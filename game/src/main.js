// Palmira Heat — the main loop and the game's whole state. Everything else is a
// specialist: the city (world.js), the cars (vehicles.js), the people (people.js), the
// story (missions.js), the pictures (render.js), the frame around them (hud.js). This
// file owns the state they share, the player's own two feet and trigger finger, the law
// (heat, stars, busts), the menus, and the order of a frame.

import { PLAYER, WANTED, WEAPON, WORLD } from './config.js';
import { Rng, clamp, dist, angleTo } from './random.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { buildCity, resolveCircle, pointBlocked, randomRoadPoint } from './world.js';
import { createCar, initRoute, updateTrafficCar, updatePoliceCar, updatePlayerCar, collideCars, damageCar } from './vehicles.js';
import { spawnPed, updatePed, scarePed, knockDown } from './people.js';
import { newMissionState, updateMissions, failCurrentMission } from './missions.js';
import { drawScene } from './render.js';
import { Hud } from './hud.js';
import { hasSave, saveGame, loadSave } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- State ---------------------------------------------------------------------

function buildState() {
  const city = buildCity(20261117);
  const S = {
    city,
    rng: new Rng(977351),
    time: 0,
    mode: 'menu', // menu | play | pause | over
    dialogOpen: false,
    dialogQueue: [],
    dialogDone: null,
    player: {
      x: city.landmarks.spawn.x, y: city.landmarks.spawn.y,
      angle: -Math.PI / 2, walkPhase: 0,
      health: PLAYER.health, ammo: WEAPON.magSize,
      reloading: 0, fireCd: 0, muzzle: 0, stun: 0, lastHurt: -99,
      inCar: null, state: 'play',
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    events: [],
    mission: newMissionState(),
    objective: null,
    money: 250,
    heat: 0,
    stars: 0,
    bust: 0,
    unseenFor: 0,
    passenger: false,
    storyDone: false,
    dusk: 0,
    duskTarget: 0,
    danger: null,
    camera: { x: 0, y: 0, w: canvas.width, h: canvas.height },
    shake: 0, shakeX: 0, shakeY: 0,
    stats: { missionsDone: 0, earned: 0, shots: 0 },
    input: Input,
    trafficTimer: 0,
    policeTimer: 0,
    pedTimer: 0,
    shotHeatCd: 0,
    crashHeatCd: 0,
    overTimer: 0,
    overKind: null,
    showDialog: null, // wired below
    toast: null,
    addMoney: null,
    addHeat: null,
  };
  S.showDialog = (lines, done) => showDialog(S, lines, done);
  S.toast = (text, seconds) => hud.toast(text, seconds);
  S.addMoney = (n) => {
    S.money += n;
    if (n > 0) {
      S.stats.earned += n;
      const p = S.player.inCar ?? S.player;
      S.particles.push({ kind: 'cash', text: '+$' + n, x: p.x, y: p.y - 26, age: 0, maxAge: 1.3 });
      Sound.cash();
    }
  };
  S.addHeat = (n) => {
    S.heat = clamp(S.heat + n, 0, WANTED.maxStars * WANTED.heatPerStar);
  };
  return S;
}

let S = buildState();
const hud = new Hud();

// ---- World population --------------------------------------------------------------

const TRAFFIC_MIX = [['sedan', 0.4], ['hatch', 0.22], ['taxi', 0.12], ['van', 0.15], ['truck', 0.05], ['sports', 0.06]];

function pickTrafficType(rng) {
  let roll = rng.next();
  for (const [type, weight] of TRAFFIC_MIX) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return 'sedan';
}

function populateWorld(S) {
  // Parked cars in the lots (never on the marina's gold spot — that is mission 1's).
  const spot = S.city.landmarks.solsticeSpot;
  for (const lot of S.city.lots) {
    if (Math.abs(lot.x - spot.x) < 6 && Math.abs(lot.y - spot.y) < 6) continue;
    if (!S.rng.chance(0.55)) continue;
    const car = createCar(S.rng, pickTrafficType(S.rng), lot.x, lot.y, lot.angle, { parked: true });
    S.cars.push(car);
  }
  // Dee holds court outside her diner.
  const dee = spawnPed(S.rng, S.city.landmarks.diner.x + 18, S.city.landmarks.diner.y + 6, 'ped');
  dee.shirt = '#e88ca0';
  dee.name = 'Dee';
  dee.home = { x: S.city.landmarks.diner.x, y: S.city.landmarks.diner.y };
  S.peds.push(dee);
  for (let i = 0; i < 12; i++) spawnTraffic(S, true);
  for (let i = 0; i < 26; i++) spawnPedNear(S, true);
}

function spawnTraffic(S, anywhere = false) {
  const p = S.player;
  const pt = randomRoadPoint(S.city, S.rng, p.x, p.y, anywhere ? 0 : 540, anywhere ? 4000 : 980);
  if (!anywhere && inCamera(S, pt.x, pt.y, 90)) return;
  const car = createCar(S.rng, pickTrafficType(S.rng), pt.x, pt.y, 0, { driver: 'traffic' });
  car.cruise = S.rng.range(185, 250);
  initRoute(S.city, S.rng, car);
  S.cars.push(car);
}

function spawnPedNear(S, anywhere = false) {
  const p = S.player;
  for (let tries = 0; tries < 10; tries++) {
    const a = S.rng.range(0, Math.PI * 2);
    const d = anywhere ? S.rng.range(60, 700) : S.rng.range(420, 760);
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d;
    if (x < 20 || y < 20 || x > WORLD.width - 20 || y > WORLD.height - 20) continue;
    if (pointBlocked(S.city, x, y, 12)) continue;
    S.peds.push(spawnPed(S.rng, x, y, 'ped'));
    return;
  }
}

function inCamera(S, x, y, pad = 0) {
  const c = S.camera;
  return x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad;
}

// ---- Dialog ---------------------------------------------------------------------------

const dialogEl = document.getElementById('dialog');
const dialogName = document.getElementById('dialog-name');
const dialogText = document.getElementById('dialog-text');
let dialogLines = [];
let dialogIndex = 0;

function showDialog(S, lines, done) {
  if (S.dialogOpen) {
    S.dialogQueue.push([lines, done]);
    return;
  }
  dialogLines = lines;
  dialogIndex = 0;
  S.dialogOpen = true;
  S.dialogDone = done ?? null;
  renderDialogLine();
  dialogEl.classList.add('show');
}

function renderDialogLine() {
  const [who, text] = dialogLines[dialogIndex];
  dialogName.textContent = who;
  dialogText.textContent = text;
}

function advanceDialog() {
  if (!S.dialogOpen) return;
  dialogIndex += 1;
  if (dialogIndex >= dialogLines.length) {
    dialogEl.classList.remove('show');
    S.dialogOpen = false;
    const done = S.dialogDone;
    S.dialogDone = null;
    if (done) done();
    if (S.dialogQueue.length) {
      const [lines, cb] = S.dialogQueue.shift();
      showDialog(S, lines, cb);
    }
  } else {
    renderDialogLine();
  }
}

dialogEl.addEventListener('click', () => {
  Sound.init();
  advanceDialog();
});

// ---- The law -----------------------------------------------------------------------------

function updateWanted(S, dt) {
  S.stars = S.heat <= 0 ? 0 : Math.min(WANTED.maxStars, Math.ceil(S.heat / WANTED.heatPerStar));
  // Seen = any live police car within earshot. Unseen heat cools, one quiet spell at a time.
  const p = S.player;
  let seen = false;
  let nearestCop = Infinity;
  for (const car of S.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    const d = dist(car.x, car.y, p.x, p.y);
    if (d < nearestCop) nearestCop = d;
    if (d < 640) seen = true;
  }
  if (seen) {
    S.unseenFor = 0;
  } else {
    S.unseenFor += dt;
    if (S.unseenFor > WANTED.decayDelay && S.heat > 0) {
      S.heat = Math.max(0, S.heat - WANTED.decayRate * dt);
    }
  }
  Sound.setSiren(S.stars > 0 ? clamp(1 - nearestCop / 720, 0, 1) : 0);
  // Cool-off means stood down: at zero stars the hunt is over, and any crew still
  // rolling peels off into ordinary traffic instead of haunting the player forever.
  if (S.stars === 0) {
    for (const car of S.cars) {
      if (car.driver === 'police' && !car.dead) {
        car.driver = 'traffic';
        car.nodeX = null;
      }
    }
  }

  // Keep the police strength matched to the stars.
  S.policeTimer -= dt;
  const wantCops = S.stars === 0 ? 0 : Math.min(6, S.stars + 1);
  const cops = S.cars.filter((c) => c.driver === 'police' && !c.dead);
  if (S.policeTimer <= 0) {
    S.policeTimer = 1.1;
    if (cops.length < wantCops) {
      const pt = randomRoadPoint(S.city, S.rng, p.x, p.y, 660, 920);
      if (!inCamera(S, pt.x, pt.y, 40)) {
        const cop = createCar(S.rng, 'police', pt.x, pt.y, 0, { driver: 'police', color: '#20242c' });
        initRoute(S.city, S.rng, cop);
        S.cars.push(cop);
      }
    }
  }
  // Bust: a crew alongside a slow or on-foot player, filling the meter.
  let busting = false;
  if (S.stars > 0 && p.health > 0) {
    const target = p.inCar ?? p;
    const speed = p.inCar ? Math.abs(p.inCar.speed) : 999;
    for (const car of cops) {
      if (dist(car.x, car.y, target.x, target.y) < WANTED.bustRange && (!p.inCar || speed < 30)) {
        busting = true;
        break;
      }
    }
  }
  if (busting) S.bust += WANTED.bustRate * dt;
  else S.bust = Math.max(0, S.bust - WANTED.bustDecay * dt);
  if (S.bust >= 100) doBusted(S);
}

function doBusted(S) {
  const fine = Math.min(S.money, 150 + S.stars * 60);
  S.money -= fine;
  S.heat = 0;
  S.bust = 0;
  Sound.busted();
  failCurrentMission(S, 'you got busted');
  gameOver(S, 'busted', `The Palmira PD impound your pride and $${fine}. You walk out of the station on foot.`);
}

function doWasted(S) {
  const fee = Math.min(S.money, 120);
  S.money -= fee;
  S.heat = 0;
  S.bust = 0;
  failCurrentMission(S, 'you ended up in hospital');
  gameOver(S, 'wasted', `St. Brisa patches you up and bills you $${fee}. The bay is still out there.`);
}

const overEl = document.getElementById('over-screen');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');

function gameOver(S, kind, text) {
  S.mode = 'over';
  S.overKind = kind;
  S.overTimer = 2.6;
  overTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  overTitle.className = kind;
  overText.textContent = text;
  overEl.classList.add('show');
  if (S.player.inCar) exitCar(S, true);
}

function respawn(S) {
  overEl.classList.remove('show');
  const p = S.player;
  const at = S.overKind === 'busted' ? S.city.landmarks.police : S.city.landmarks.hospital;
  p.x = at.x;
  p.y = at.y;
  p.health = PLAYER.health;
  p.ammo = WEAPON.magSize;
  p.inCar = null;
  p.stun = 0;
  S.mode = 'play';
  S.toast(S.overKind === 'busted' ? 'Released. Dee is not impressed.' : 'Discharged. Try to keep the car on the road.');
}

// ---- The player -----------------------------------------------------------------------------

function updatePlayer(S, dt) {
  const p = S.player;
  if (p.inCar) {
    const car = p.inCar;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (Input.justPressed('KeyF', 'KeyE')) {
      exitCar(S);
      return;
    }
    if (car.dead) {
      exitCar(S, true);
      hurtPlayer(S, 8);
      S.toast('The car is wrecked. Out — now.');
    }
    return;
  }

  if (p.stun > 0) p.stun -= dt;
  const move = Input.axes();
  const sprint = Input.down('ShiftLeft', 'ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if ((move.x !== 0 || move.y !== 0) && p.stun <= 0) {
    p.x += move.x * speed * dt;
    p.y += move.y * speed * dt;
    p.walkPhase += dt * speed * 0.06;
    const res = resolveCircle(S.city, p.x, p.y, PLAYER.radius);
    p.x = res.x;
    p.y = res.y;
  }
  // Face the mouse: the Kestrel points where the player is looking.
  const mouseWorld = { x: S.camera.x + Input.mouseScreen.x, y: S.camera.y + Input.mouseScreen.y };
  p.angle = angleTo(p.x, p.y, mouseWorld.x, mouseWorld.y);

  // Fire.
  p.fireCd -= dt;
  p.muzzle = Math.max(0, p.muzzle - dt * 6);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) p.ammo = WEAPON.magSize;
  }
  if (Input.justPressed('KeyR') && p.reloading <= 0 && p.ammo < WEAPON.magSize) {
    p.reloading = WEAPON.reloadTime;
    Sound.reload();
  }
  if (Input.mouseDown && p.fireCd <= 0 && p.stun <= 0) {
    if (p.reloading > 0) {
      // Still reloading; ignore the click.
    } else if (p.ammo <= 0) {
      p.reloading = WEAPON.reloadTime;
      Sound.dryFire();
      Sound.reload();
    } else {
      fireGun(S);
    }
  }

  // Interact: a car first, then the diner save point.
  if (Input.justPressed('KeyF', 'KeyE')) {
    const car = nearestEnterableCar(S);
    if (car) {
      enterCar(S, car);
      return;
    }
    const sp = S.city.landmarks.savePoint;
    if (dist(p.x, p.y, sp.x, sp.y) < 46) {
      p.health = PLAYER.health;
      if (saveGame(S)) S.toast('Game saved at Dee\'s. Health topped up, coffee acquired.');
      else S.toast('Health topped up. (This browser refused to keep the save.)');
      Sound.pickup();
    }
  }
}

function fireGun(S) {
  const p = S.player;
  p.fireCd = WEAPON.fireRate;
  p.ammo -= 1;
  p.muzzle = 1;
  S.stats.shots += 1;
  const spread = (S.rng.next() - 0.5) * 2 * WEAPON.spread;
  const a = p.angle + spread;
  S.bullets.push({
    x: p.x + Math.cos(p.angle) * 17,
    y: p.y + Math.sin(p.angle) * 17,
    vx: Math.cos(a) * WEAPON.bulletSpeed,
    vy: Math.sin(a) * WEAPON.bulletSpeed,
    life: WEAPON.bulletLife, damage: WEAPON.damage, from: 'player', dead: false,
  });
  Sound.shot();
  setDanger(S, p.x, p.y, 300);
  // Gunfire the law can hear earns heat, throttled so a firefight is one crime, not thirty.
  if (S.shotHeatCd <= 0 && S.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 760)) {
    S.addHeat(50);
    S.shotHeatCd = 1.4;
  }
}

function nearestEnterableCar(S) {
  const p = S.player;
  let best = null;
  let bestD = 54;
  for (const car of S.cars) {
    if (car.dead) continue;
    const d = dist(p.x, p.y, car.x, car.y) - car.def.w / 2;
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(S, car) {
  const p = S.player;
  Sound.door();
  if (car.driver === 'traffic' || car.driver === 'police') {
    // A carjack: the driver bails and runs, and the law takes an interest.
    car.driver = null;
    S.events.push({ t: 'driverFled', x: car.x + 20, y: car.y });
    S.addHeat(85);
    setDanger(S, car.x, car.y, 220);
    Sound.alarm();
    S.toast('Carjacked. The driver will have opinions about that.');
  } else if (car.parked && car.missionCar) {
    S.addHeat(60);
    Sound.alarm();
  } else if (car.parked && S.rng.chance(0.3)) {
    S.addHeat(45);
    Sound.alarm();
    S.toast('Alarm. Somewhere, an owner is waking up.');
  }
  car.driver = 'player';
  car.parked = false;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
}

function exitCar(S, forced = false) {
  const p = S.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = null;
  car.parked = true;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  p.inCar = null;
  // Step out on the left side, somewhere legal.
  for (const [dx, dy] of [[-30, 0], [30, 0], [0, -30], [0, 30], [-38, -38], [38, 38]]) {
    const x = car.x + dx;
    const y = car.y + dy;
    const res = resolveCircle(S.city, x, y, PLAYER.radius);
    if (!res.hit) {
      p.x = res.x;
      p.y = res.y;
      break;
    }
    p.x = res.x;
    p.y = res.y;
  }
  if (!forced) Sound.door();
}

function hurtPlayer(S, amount) {
  const p = S.player;
  if (S.mode !== 'play') return;
  p.health -= amount;
  p.lastHurt = S.time;
  Sound.hurt();
  S.shake = Math.min(7, S.shake + 2.5);
  if (p.health <= 0) {
    p.health = 0;
    doWasted(S);
  }
}

function setDanger(S, x, y, r) {
  S.danger = { x, y, r, until: S.time + 1.6 };
}

// ---- Bullets and collisions ------------------------------------------------------------------

function updateBullets(S, dt) {
  for (const b of S.bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    const steps = 2;
    for (let s = 0; s < steps && !b.dead; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      if (pointBlocked(S.city, b.x, b.y, 1)) {
        spark(S, b.x, b.y, 3);
        b.dead = true;
        break;
      }
      // Cars.
      for (const car of S.cars) {
        if (car.dead) continue;
        const rr = car.def.w * 0.58;
        if (Math.abs(b.x - car.x) < rr && Math.abs(b.y - car.y) < rr && dist(b.x, b.y, car.x, car.y) < rr + 3) {
          damageCar(S, car, b.from === 'player' ? 13 : 4, 'shot');
          spark(S, b.x, b.y, 4);
          Sound.hit();
          if (b.from === 'player' && car.driver === 'police') S.addHeat(35);
          if (b.from === 'gang' && S.player.inCar === car) S.shake = Math.min(6, S.shake + 1.6);
          b.dead = true;
          break;
        }
      }
      if (b.dead) break;
      // People.
      if (b.from === 'player') {
        for (const ped of S.peds) {
          if (ped.state === 'down' || ped.state === 'gone') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 11) {
            ped.hp -= b.damage;
            spark(S, b.x, b.y, 3);
            Sound.hit();
            if (ped.hp <= 0) knockDown(S, ped, true);
            else scarePed(ped, S.player.x, S.player.y, 4);
            if (ped.kind !== 'gang') S.addHeat(65);
            b.dead = true;
            break;
          }
        }
      } else if (!S.player.inCar && dist(b.x, b.y, S.player.x, S.player.y) < 12) {
        hurtPlayer(S, b.damage);
        b.dead = true;
      } else if (S.player.inCar && dist(b.x, b.y, S.player.inCar.x, S.player.inCar.y) < 24) {
        damageCar(S, S.player.inCar, 4, 'shot');
        b.dead = true;
      }
    }
  }
  S.bullets = S.bullets.filter((b) => !b.dead);
}

// Cars meet people; people meet cars. Speed decides how bad it is.
function updateCarPeople(S) {
  for (const car of S.cars) {
    const speed = Math.abs(car.speed);
    if (speed < 55 || car.dead) continue;
    for (const ped of S.peds) {
      if (ped.state === 'down' || ped.state === 'gone') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 27) {
        ped.hp -= speed * 0.14;
        knockDown(S, ped, ped.hp <= 0);
        Sound.hit();
        if (car.driver === 'player') {
          S.addHeat(60);
          setDanger(S, car.x, car.y, 240);
          S.shake = Math.min(7, S.shake + 2);
        }
      }
    }
    // And cars meet the player, when the player is on foot. A police crew pulling up to
    // make an arrest shoves Marlo aside; anything else at speed puts him in hospital.
    const p = S.player;
    if (!p.inCar && car.driver !== 'player' && dist(car.x, car.y, p.x, p.y) < 26) {
      const arresting = car.driver === 'police' && speed < 240;
      if (speed > 165 || arresting) {
        if (!arresting) {
          hurtPlayer(S, speed * 0.055);
          p.stun = 0.7;
        }
        const push = angleTo(car.x, car.y, p.x, p.y);
        p.x += Math.cos(push) * 26;
        p.y += Math.sin(push) * 26;
        const res = resolveCircle(S.city, p.x, p.y, PLAYER.radius);
        p.x = res.x;
        p.y = res.y;
      }
    }
  }
}

// ---- Particles ---------------------------------------------------------------------------------

function spark(S, x, y, n) {
  for (let i = 0; i < n; i++) {
    S.particles.push({
      kind: 'spark', x, y,
      vx: S.rng.range(-90, 90), vy: S.rng.range(-90, 90),
      age: 0, maxAge: S.rng.range(0.14, 0.3), size: 2,
    });
  }
}

function updateParticles(S, dt) {
  for (const fx of S.particles) {
    fx.age += dt;
    if (fx.vx) fx.x += fx.vx * dt;
    if (fx.vy) fx.y += fx.vy * dt;
  }
  S.particles = S.particles.filter((fx) => fx.age < fx.maxAge);
  if (S.particles.length > 1100) S.particles.splice(0, S.particles.length - 1100);
  // Tyre marks from a hard-driven player car.
  const car = S.player.inCar;
  if (car && !car.dead) {
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    const fSpeed = car.vx * fwdX + car.vy * fwdY;
    const lat = Math.abs(car.vx * -fwdY + car.vy * fwdX);
    if ((Input.down('Space') && Math.abs(fSpeed) > 60) || (lat > 95 && Math.abs(fSpeed) > 150)) {
      for (const side of [-1, 1]) {
        S.particles.push({
          kind: 'skid',
          x: car.x - fwdX * 14 - fwdY * side * 10,
          y: car.y - fwdY * 14 + fwdX * side * 10,
          age: 0, maxAge: 5, size: 3,
        });
      }
    }
    if (car.health < 42 && S.rng.chance(0.35)) {
      S.particles.push({ kind: 'smoke', x: car.x + fwdX * 18, y: car.y + fwdY * 18, age: 0, maxAge: 0.9, size: 4 });
    }
  }
}

// ---- Events ---------------------------------------------------------------------------------------

function processEvents(S) {
  for (const ev of S.events) {
    if (ev.t === 'crash') {
      Sound.crash(ev.big);
      spark(S, ev.x, ev.y, ev.big ? 9 : 4);
      setDanger(S, ev.x, ev.y, 210);
      const playerInvolved = ev.car && (ev.car.driver === 'player' || (ev.other && ev.other.driver === 'player'));
      if (playerInvolved && S.crashHeatCd <= 0) {
        S.addHeat(ev.big ? 26 : 10);
        S.crashHeatCd = 0.9;
      }
    } else if (ev.t === 'carWrecked') {
      for (let i = 0; i < 6; i++) S.particles.push({ kind: 'smoke', x: ev.x, y: ev.y, age: 0, maxAge: 1.2, size: 6 });
      Sound.crash(true);
    } else if (ev.t === 'driverFled') {
      const ped = spawnPed(S.rng, ev.x, ev.y, 'ped');
      ped.state = 'flee';
      ped.fleeX = S.player.x;
      ped.fleeY = S.player.y;
      ped.fleeTime = 3.4;
      S.peds.push(ped);
    } else if (ev.t === 'pedDown') {
      Sound.hit();
    } else if (ev.t === 'enemyShot') {
      Sound.enemyShot();
    } else if (ev.t === 'missionStart') {
      Sound.missionStart();
    } else if (ev.t === 'missionDone') {
      Sound.missionDone();
      S.stats.missionsDone += 1;
      saveGame(S);
    } else if (ev.t === 'missionFail') {
      Sound.missionFail();
    } else if (ev.t === 'pickup') {
      Sound.pickup();
    } else if (ev.t === 'ambush') {
      Sound.alarm();
    }
  }
  S.events.length = 0;
}

// ---- Population management ---------------------------------------------------------------------------

function updatePopulation(S, dt) {
  const p = S.player;
  S.trafficTimer -= dt;
  if (S.trafficTimer <= 0) {
    S.trafficTimer = 0.7;
    const traffic = S.cars.filter((c) => c.driver === 'traffic' && !c.dead);
    if (traffic.length < 14) spawnTraffic(S);
  }
  S.pedTimer -= dt;
  if (S.pedTimer <= 0) {
    S.pedTimer = 0.6;
    const near = S.peds.filter((ped) => ped.state !== 'gone' && dist(ped.x, ped.y, p.x, p.y) < 1050);
    if (near.length < 30) spawnPedNear(S);
  }
  // Retire the far and the finished, sparing anything a mission still owns.
  const owned = new Set(S.mission.entities);
  S.cars = S.cars.filter((car) => {
    if (car.driver === 'player' || owned.has(car)) return true;
    if (car.parked && !car.dead) return true;
    return dist(car.x, car.y, p.x, p.y) < 1500;
  });
  S.peds = S.peds.filter((ped) => {
    if (owned.has(ped) || ped.home) return true;
    if (ped.state === 'gone') return false;
    return dist(ped.x, ped.y, p.x, p.y) < 1250;
  });
  // Dee stays near home.
  for (const ped of S.peds) {
    if (ped.home && ped.state === 'walk' && dist(ped.x, ped.y, ped.home.x, ped.home.y) > 70) {
      ped.tx = ped.home.x + S.rng.range(-24, 24);
      ped.ty = ped.home.y + S.rng.range(-10, 26);
    }
  }
}

// ---- Camera ----------------------------------------------------------------------------------------------

function updateCamera(S, dt) {
  const cam = S.camera;
  cam.w = canvas.width;
  cam.h = canvas.height;
  const target = S.player.inCar ?? S.player;
  const lookX = target.x + (target.vx ?? 0) * 0.34;
  const lookY = target.y + (target.vy ?? 0) * 0.34;
  const k = 1 - Math.exp(-5.2 * dt);
  cam.x += (lookX - cam.w / 2 - cam.x) * k;
  cam.y += (lookY - cam.h / 2 - cam.y) * k;
  cam.x = clamp(cam.x, 0, Math.max(0, WORLD.width - cam.w));
  cam.y = clamp(cam.y, 0, Math.max(0, WORLD.height - cam.h));
  S.shake = Math.max(0, S.shake - dt * 16);
  S.shakeX = (Math.random() - 0.5) * S.shake;
  S.shakeY = (Math.random() - 0.5) * S.shake;
}

// ---- The frame -------------------------------------------------------------------------------------------------

function update(S, dt) {
  S.time += dt;
  S.shotHeatCd = Math.max(0, S.shotHeatCd - dt);
  S.crashHeatCd = Math.max(0, S.crashHeatCd - dt);
  if (S.danger && S.time > S.danger.until) S.danger = null;
  S.dusk += clamp(S.duskTarget - S.dusk, -dt * 0.25, dt * 0.25);

  if (S.mode === 'over') {
    S.overTimer -= dt;
    if (S.overTimer <= 0) respawn(S);
    updateCamera(S, dt);
    return;
  }
  if (S.mode !== 'play') {
    updateCamera(S, dt);
    return;
  }

  if (!S.dialogOpen) {
    updatePlayer(S, dt);
    for (const car of S.cars) {
      if (car.dead || car.parked) continue;
      if (car.driver === 'traffic') updateTrafficCar(S, car, dt);
      else if (car.driver === 'police') updatePoliceCar(S, car, dt);
      else if (car.driver === 'player') updatePlayerCar(S, car, dt);
    }
    collideCars(S, dt);
    for (const ped of S.peds) updatePed(S, ped, dt);
    updateBullets(S, dt);
    updateCarPeople(S);
    updateWanted(S, dt);
    updateMissions(S, dt);
    updatePopulation(S, dt);
    // Health drifts back once the shooting stops.
    const p = S.player;
    if (p.health > 0 && p.health < PLAYER.health && S.time - p.lastHurt > 6) {
      p.health = Math.min(PLAYER.health, p.health + 7 * dt);
    }
  }
  if (S.dialogOpen) Sound.setSiren(0);
  processEvents(S);
  updateParticles(S, dt);
  updateCamera(S, dt);
}

// ---- Menus and flow ----------------------------------------------------------------------------------------------

const startEl = document.getElementById('start-screen');
const pauseEl = document.getElementById('pause-screen');
const helpEl = document.getElementById('help-screen');
const continueBtn = document.getElementById('btn-continue');

function showStart() {
  S.mode = 'menu';
  continueBtn.style.display = hasSave() ? '' : 'none';
  startEl.classList.add('show');
  pauseEl.classList.remove('show');
}

function startGame(fresh) {
  Sound.init();
  const save = fresh ? null : loadSave();
  S = buildState();
  populateWorld(S);
  if (save) {
    S.money = save.money;
    S.mission.nextIndex = save.nextIndex;
    S.storyDone = save.storyDone;
    S.stats.missionsDone = save.missionsDone;
    S.stats.earned = save.earned;
    S.player.x = save.x;
    S.player.y = save.y;
    S.toast('Welcome back to Palmira Bay.');
  }
  startEl.classList.remove('show');
  S.mode = 'play';
  snapCamera(S);
  if (fresh) {
    S.showDialog([
      ['Dee', 'Marlo Reyes, as I live and breathe. Palmira Bay\'s been quiet without you.'],
      ['Marlo', 'Quiet doesn\'t pay, Dee. Tell me there\'s work.'],
      ['Dee', 'There\'s work. Walk with me — gold marker, right here at the diner. We start small: a car that needs a new home.'],
    ], () => {});
  }
}

function snapCamera(S) {
  S.camera.x = clamp(S.player.x - S.camera.w / 2, 0, Math.max(0, WORLD.width - S.camera.w));
  S.camera.y = clamp(S.player.y - S.camera.h / 2, 0, Math.max(0, WORLD.height - S.camera.h));
}

document.getElementById('btn-new').addEventListener('click', () => startGame(true));
continueBtn.addEventListener('click', () => startGame(false));
document.getElementById('btn-help').addEventListener('click', () => helpEl.classList.add('show'));
document.getElementById('btn-help-close').addEventListener('click', () => helpEl.classList.remove('show'));
document.getElementById('btn-resume').addEventListener('click', () => {
  pauseEl.classList.remove('show');
  S.mode = 'play';
});
document.getElementById('btn-save').addEventListener('click', () => {
  if (saveGame(S)) S.toast('Game saved.');
});
document.getElementById('btn-quit').addEventListener('click', () => {
  pauseEl.classList.remove('show');
  showStart();
});
for (const id of ['btn-mute', 'btn-mute-2']) {
  document.getElementById(id).addEventListener('click', (e) => {
    Sound.init();
    const muted = Sound.toggleMute();
    e.target.textContent = muted ? 'Sound: off' : 'Sound: on';
  });
}

// ---- Screenshot staging (?shot=...) -----------------------------------------------------------------------------
// The game's maker poses scenes for the entry's screenshots through the query string:
// ?shot=foot|drive|chase|pier starts the game mid-scene instead of at the menu.

function applyShot(name) {
  const L = S.city.landmarks;
  startGame(true);
  S.dialogOpen = false;
  dialogEl.classList.remove('show');
  const p = S.player;
  if (name === 'foot') {
    p.x = L.bank.x;
    p.y = L.bank.y + 26;
    S.heat = 0;
  } else if (name === 'drive') {
    const car = createCar(S.rng, 'sports', 4480 - 30, 2500, -Math.PI / 2, { color: '#e2543e' });
    S.cars.push(car);
    enterCarSilent(S, car);
    car.vy = -330;
    car.speed = 330;
  } else if (name === 'chase') {
    const car = createCar(S.rng, 'sedan', 2560, 2560 + 30, 0, { color: '#4a7fb5' });
    S.cars.push(car);
    enterCarSilent(S, car);
    car.vx = 300;
    car.speed = 300;
    S.mission.activeId = 'm2';
    S.mission.stage = 1;
    S.mission.timer = 150;
    S.heat = 310;
    for (let i = 0; i < 3; i++) {
      const cop = createCar(S.rng, 'police', 2560 - 190 - i * 90, 2560 + 30 + (i % 2) * 34, 0, { driver: 'police', color: '#20242c' });
      initRoute(S.city, S.rng, cop);
      S.cars.push(cop);
    }
  } else if (name === 'pier') {
    S.dusk = 1;
    S.duskTarget = 1;
    p.x = S.city.pier.x + 90;
    p.y = S.city.pier.y + 46;
    S.mission.activeId = 'm4';
    S.mission.stage = 1;
    S.mission.flagged = { wave: 1 };
    for (let i = 0; i < 3; i++) {
      const g = spawnPed(S.rng, S.city.pier.x + 300 + i * 44, S.city.pier.y + 20 + (i % 2) * 52, 'gang');
      g.shirt = '#20303c';
      S.peds.push(g);
      S.mission.entities.push(g);
    }
    S.heat = 130;
  }
  snapCamera(S);
}

function enterCarSilent(S, car) {
  car.driver = 'player';
  car.parked = false;
  S.player.inCar = car;
  S.player.x = car.x;
  S.player.y = car.y;
}

// ---- Boot and the loop --------------------------------------------------------------------------------------------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

Input.attach(canvas);
populateWorld(S);
snapCamera(S);

const shotParam = new URLSearchParams(window.location.search).get('shot');
if (shotParam) applyShot(shotParam);
else showStart();

window.__palmira = () => S;

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (Input.justPressed('Escape', 'KeyP') && S.mode === 'play' && !S.dialogOpen) {
    S.mode = 'pause';
    pauseEl.classList.add('show');
  } else if (Input.justPressed('Escape') && S.mode === 'pause') {
    pauseEl.classList.remove('show');
    S.mode = 'play';
  }
  if (S.dialogOpen && Input.justPressed('KeyE', 'Space', 'Enter')) {
    advanceDialog();
    Input.pressed.clear(); // a press that talks to Dee is not also an order for the world
  }
  if (Input.justPressed('KeyM')) {
    Sound.init();
    Sound.toggleMute();
  }
  update(S, dt);
  drawScene(ctx, S);
  if (S.mode === 'play' || S.mode === 'over' || S.dialogOpen) hud.update(S);
  Input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

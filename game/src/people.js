// The people of Palmira Bay. Pedestrians stroll the sidewalks, dive away from danger and
// run from gunfire; drivers whose cars are wrecked or stolen climb out and run too. The
// Corsairs — the rival crew from the story's last mission — are pedestrians with guns and
// a grudge: they keep their distance, strafe, and fire in bursts at the player.

import { clamp, angleTo, dist } from './random.js';
import { resolveCircle, pointBlocked } from './world.js';

const SHIRTS = ['#e2703a', '#3a86c8', '#e8c832', '#7ab648', '#c85a8a', '#e8e2d0', '#5aa7a0', '#9866c8'];
const SKINS = ['#f2c79b', '#d9a06b', '#a06a3c', '#6e4525', '#ffe0bd'];
const PANTS = ['#3a4a6b', '#6b4a3a', '#2e2e34', '#7a7a6e', '#54486b'];

let nextPedId = 1;

export function spawnPed(rng, x, y, kind = 'ped') {
  return {
    id: nextPedId++,
    kind, // 'ped' | 'gang'
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    hp: kind === 'gang' ? 68 : 30,
    state: 'walk', // walk | flee | down | gone
    tx: x, ty: y, // wander target
    retarget: 0,
    fleeX: 0, fleeY: 0, fleeTime: 0,
    downTime: 0,
    shootCd: rng.range(0.8, 2),
    burst: 0, burstCd: 0,
    strafeDir: rng.chance(0.5) ? 1 : -1,
    strafeTime: rng.range(1, 2.4),
    shirt: rng.pick(SHIRTS),
    skin: rng.pick(SKINS),
    pants: rng.pick(PANTS),
    walkPhase: rng.range(0, 6),
  };
}

function pickWanderTarget(S, ped) {
  for (let tries = 0; tries < 8; tries++) {
    const a = S.rng.range(0, Math.PI * 2);
    const d = S.rng.range(90, 320);
    const x = ped.x + Math.cos(a) * d;
    const y = ped.y + Math.sin(a) * d;
    if (!pointBlocked(S.city, x, y, 12)) {
      ped.tx = x;
      ped.ty = y;
      return;
    }
  }
  ped.tx = ped.x;
  ped.ty = ped.y;
}

function movePed(S, ped, dt, speed) {
  ped.speed = speed;
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  const res = resolveCircle(S.city, ped.x, ped.y, 10);
  ped.x = res.x;
  ped.y = res.y;
  ped.walkPhase += dt * speed * 0.055;
  return res.hit;
}

export function scarePed(ped, x, y, time = 3) {
  if (ped.state === 'down' || ped.state === 'gone') return;
  ped.state = 'flee';
  ped.fleeX = x;
  ped.fleeY = y;
  ped.fleeTime = time;
}

export function knockDown(S, ped, fatal = false) {
  if (ped.state === 'down' || ped.state === 'gone') return;
  ped.state = 'down';
  ped.downTime = fatal ? 26 : 6.5;
  ped.speed = 0;
  S.events.push({ t: 'pedDown', x: ped.x, y: ped.y, ped, fatal });
}

export function updatePed(S, ped, dt) {
  if (ped.state === 'gone') return;
  if (ped.state === 'down') {
    ped.downTime -= dt;
    if (ped.downTime <= 0) {
      if (ped.hp <= 0) {
        ped.state = 'gone';
      } else {
        ped.state = 'flee';
        ped.fleeX = S.player.x;
        ped.fleeY = S.player.y;
        ped.fleeTime = 2.5;
      }
    }
    return;
  }
  if (ped.kind === 'gang') {
    updateGang(S, ped, dt);
    return;
  }

  // Danger sense: gunfire, crashes and near-miss cars send everyone running.
  const danger = S.danger;
  if (danger && dist(ped.x, ped.y, danger.x, danger.y) < danger.r) {
    scarePed(ped, danger.x, danger.y, 3.2);
  }
  for (const car of S.cars) {
    if (car.parked || car.dead) continue;
    const speed = Math.abs(car.speed);
    if (speed > 190 && dist(ped.x, ped.y, car.x, car.y) < 74) {
      scarePed(ped, car.x, car.y, 1.6);
      break;
    }
  }

  if (ped.state === 'flee') {
    ped.fleeTime -= dt;
    ped.angle = angleTo(ped.fleeX, ped.fleeY, ped.x, ped.y);
    const hit = movePed(S, ped, dt, 152);
    if (hit) ped.angle += 0.9; // slide along whatever stopped them
    if (ped.fleeTime <= 0) {
      ped.state = 'walk';
      pickWanderTarget(S, ped);
    }
    return;
  }

  // Stroll.
  ped.retarget -= dt;
  if (ped.retarget <= 0 || dist(ped.x, ped.y, ped.tx, ped.ty) < 14) {
    pickWanderTarget(S, ped);
    ped.retarget = S.rng.range(3, 7);
  }
  const want = angleTo(ped.x, ped.y, ped.tx, ped.ty);
  let delta = want - ped.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  ped.angle += clamp(delta, -3.4 * dt, 3.4 * dt);
  movePed(S, ped, dt, 62);
}

// ---- The Corsairs ------------------------------------------------------------------

function updateGang(S, ped, dt) {
  const p = S.player;
  const target = p.inCar ? p.inCar : p;
  const d = dist(ped.x, ped.y, target.x, target.y);
  if (d > 900) return; // too far to matter this frame

  // Keep a fighting distance, strafing between bursts.
  ped.strafeTime -= dt;
  if (ped.strafeTime <= 0) {
    ped.strafeDir *= -1;
    ped.strafeTime = S.rng.range(0.9, 2.2);
  }
  const toPlayer = angleTo(ped.x, ped.y, target.x, target.y);
  let moveAngle = toPlayer;
  let speed = 0;
  if (d > 265) {
    moveAngle = toPlayer;
    speed = 118;
  } else if (d < 165) {
    moveAngle = toPlayer + Math.PI;
    speed = 96;
  } else {
    moveAngle = toPlayer + (Math.PI / 2) * ped.strafeDir;
    speed = 66;
  }
  ped.angle = toPlayer; // face the player, whatever the feet are doing
  if (speed > 0) {
    ped.x += Math.cos(moveAngle) * speed * dt;
    ped.y += Math.sin(moveAngle) * speed * dt;
    const res = resolveCircle(S.city, ped.x, ped.y, 10);
    ped.x = res.x;
    ped.y = res.y;
    ped.walkPhase += dt * speed * 0.05;
  }

  // Fire in bursts of three, with a human amount of wobble.
  ped.shootCd -= dt;
  if (ped.burst > 0) {
    ped.burstCd -= dt;
    if (ped.burstCd <= 0 && d < 430) {
      ped.burst -= 1;
      ped.burstCd = 0.15;
      const wobble = S.rng.range(-0.085, 0.085) + clamp((d - 200) * 0.00012, 0, 0.05);
      S.bullets.push({
        x: ped.x + Math.cos(toPlayer) * 14,
        y: ped.y + Math.sin(toPlayer) * 14,
        vx: Math.cos(toPlayer + wobble) * 820,
        vy: Math.sin(toPlayer + wobble) * 820,
        life: 0.55, damage: 9, from: 'gang', dead: false,
      });
      S.events.push({ t: 'enemyShot', x: ped.x, y: ped.y });
    }
  } else if (ped.shootCd <= 0 && d < 430) {
    ped.burst = 3;
    ped.burstCd = 0;
    ped.shootCd = S.rng.range(1.5, 2.6);
  }
}

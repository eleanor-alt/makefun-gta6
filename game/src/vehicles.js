// Cars: traffic that follows the road grid in right-hand lanes, police interceptors that
// hunt the player, and the arcade driving model for whichever car the player is sitting
// in. Traffic picks a new road at every intersection; police pick the road that closes on
// the player and switch to a direct chase when they are close. Everything reports crashes
// and other story-worthy moments into S.events for the main loop to judge.

import { CAR_TYPES, WORLD } from './config.js';
import { clamp, angleDelta, angleTo, dist } from './random.js';
import { resolveCircle, pointBlocked, nearestIntersection } from './world.js';

let nextCarId = 1;

export function createCar(rng, type, x, y, angle, opts = {}) {
  const def = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    def,
    x, y, angle,
    vx: 0, vy: 0, // velocity, used by the player-driven car
    speed: 0, // scalar road speed for AI cars
    color: opts.color ?? rng.pick(def.colors),
    health: 100,
    driver: opts.driver ?? null, // 'traffic' | 'police' | 'player' | null (parked)
    parked: opts.parked ?? false,
    locked: opts.locked ?? false, // the mission car resists until the story says take it
    missionCar: opts.missionCar ?? false,
    nodeX: null, nodeY: null, // intersection the AI is heading for
    targetX: x, targetY: y,
    arriveDir: null,
    stuckTime: 0,
    reverseTime: 0,
    honkTime: 0,
    dead: false,
  };
}

// ---- Road routing ------------------------------------------------------------

function laneTarget(city, fromX, fromY, toX, toY) {
  const off = WORLD.laneOffset;
  if (toX > fromX) return { x: toX, y: fromY + off }; // eastbound
  if (toX < fromX) return { x: toX, y: fromY - off }; // westbound
  if (toY > fromY) return { x: fromX - off, y: toY }; // southbound
  return { x: fromX + off, y: toY }; // northbound
}

function neighbours(city, nx, ny) {
  const pitch = WORLD.blockPitch;
  const out = [];
  for (const [dx, dy] of [[pitch, 0], [-pitch, 0], [0, pitch], [0, -pitch]]) {
    const x = nx + dx;
    const y = ny + dy;
    if (city.roadX.includes(x) && city.roadY.includes(y)) out.push({ x, y });
  }
  return out;
}

// Send a car toward its first intersection, in the right lane.
export function initRoute(city, rng, car) {
  const n = nearestIntersection(city, car.x, car.y);
  car.nodeX = n.x;
  car.nodeY = n.y;
  const t = laneTarget(city, car.x, car.y, n.x, n.y);
  car.targetX = t.x;
  car.targetY = t.y;
  car.angle = angleTo(car.x, car.y, t.x, t.y);
}

function pickNextNode(city, rng, car, goal = null) {
  const options = neighbours(city, car.nodeX, car.nodeY).filter((n) => {
    // No U-turns unless the road forces one.
    return !(car.arriveDir && n.x === car.arriveDir.x && n.y === car.arriveDir.y);
  });
  const pool = options.length ? options : neighbours(city, car.nodeX, car.nodeY);
  if (!pool.length) return;
  let next;
  if (goal) {
    // Police: mostly greedy toward the goal, sometimes not (they are only human).
    pool.sort((a, b) => dist(a.x, a.y, goal.x, goal.y) - dist(b.x, b.y, goal.x, goal.y));
    next = rng.chance(0.78) ? pool[0] : rng.pick(pool);
  } else {
    // Traffic: prefers going straight, which reads as purpose.
    const straight = pool.find((n) => {
      const dx = Math.sign(n.x - car.nodeX);
      const dy = Math.sign(n.y - car.nodeY);
      return car.arriveDir && dx === -Math.sign(car.arriveDir.x - car.nodeX) && dy === -Math.sign(car.arriveDir.y - car.nodeY);
    });
    next = straight && rng.chance(0.55) ? straight : rng.pick(pool);
  }
  car.arriveDir = { x: car.nodeX, y: car.nodeY };
  car.nodeX = next.x;
  car.nodeY = next.y;
  const t = laneTarget(city, car.arriveDir.x, car.arriveDir.y, next.x, next.y);
  car.targetX = t.x;
  car.targetY = t.y;
}

// ---- Shared AI driving ---------------------------------------------------------

function obstacleAhead(S, car, lookDist) {
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  const px = car.x + hx * lookDist;
  const py = car.y + hy * lookDist;
  for (const other of S.cars) {
    if (other === car || other.dead) continue;
    if (Math.abs(other.x - px) < 34 && Math.abs(other.y - py) < 34) return other;
  }
  const p = S.player;
  if (!p.inCar && Math.abs(p.x - px) < 26 && Math.abs(p.y - py) < 26) return p;
  return null;
}

function driveToward(S, car, dt, cruiseSpeed) {
  const desired = angleTo(car.x, car.y, car.targetX, car.targetY);
  const turn = clamp(angleDelta(car.angle, desired), -2.4 * dt, 2.4 * dt);
  car.angle += turn;
  const blockedBy = obstacleAhead(S, car, 58);
  let target = cruiseSpeed;
  if (blockedBy) target = 0;
  if (car.reverseTime > 0) {
    car.reverseTime -= dt;
    target = -90;
  }
  car.speed += clamp(target - car.speed, -420 * dt, car.def.accel * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const before = Math.abs(car.speed);
  const res = resolveCircle(S.city, car.x, car.y, 23);
  car.x = res.x;
  car.y = res.y;
  if (res.hit && before > 130) {
    damageCar(S, car, (before - 120) * 0.05, 'wall');
    car.speed *= -0.18;
    S.events.push({ t: 'crash', x: car.x, y: car.y, big: before > 260, car });
  } else if (res.hit) {
    car.speed *= 0.4;
  }
  // Unstick: throttle on, barely moving, for a while → reverse and re-aim.
  if (Math.abs(target) > 40 && Math.abs(car.speed) < 14 && car.reverseTime <= 0) {
    car.stuckTime += dt;
    if (car.stuckTime > 1.1) {
      car.reverseTime = 0.55;
      car.stuckTime = 0;
    }
  } else {
    car.stuckTime = Math.max(0, car.stuckTime - dt);
  }
}

export function updateTrafficCar(S, car, dt) {
  if (car.nodeX === null) initRoute(S.city, S.rng, car);
  if (dist(car.x, car.y, car.nodeX, car.nodeY) < 52) pickNextNode(S.city, S.rng, car);
  driveToward(S, car, dt, car.cruise ?? 215);
}

// ---- Police --------------------------------------------------------------------

export function updatePoliceCar(S, car, dt) {
  const p = S.player;
  const goal = p.inCar ? p.inCar : p;
  const d = dist(car.x, car.y, goal.x, goal.y);
  if (d < 300) {
    // Direct chase: aim at the player, leaning around buildings when the way is shut.
    let desired = angleTo(car.x, car.y, goal.x, goal.y);
    const aheadX = car.x + Math.cos(desired) * 78;
    const aheadY = car.y + Math.sin(desired) * 78;
    if (pointBlocked(S.city, aheadX, aheadY, 16)) {
      for (const bend of [0.7, -0.7, 1.3, -1.3]) {
        const a = desired + bend;
        if (!pointBlocked(S.city, car.x + Math.cos(a) * 78, car.y + Math.sin(a) * 78, 16)) {
          desired = a;
          break;
        }
      }
    }
    car.targetX = car.x + Math.cos(desired) * 120;
    car.targetY = car.y + Math.sin(desired) * 120;
    // Alongside an on-foot suspect the crew pulls up and holds: that is what fills the
    // bust meter. It approaches a pedestrian at a sane pace — a bust is an arrest, not a
    // hit-and-run. Against a car, or from farther out, it is a pursuit at full pace.
    const cruise = !p.inCar
      ? d < 130 ? 36 : d < 280 ? 150 : car.def.topSpeed
      : d > 190 ? car.def.topSpeed : car.def.topSpeed * 0.86;
    driveToward(S, car, dt, cruise);
    car.nodeX = null; // rejoin the road plan when the chase breaks off
  } else {
    if (car.nodeX === null) initRoute(S.city, S.rng, car);
    if (dist(car.x, car.y, car.nodeX, car.nodeY) < 56) {
      pickNextNode(S.city, S.rng, car, goal);
    }
    driveToward(S, car, dt, car.def.topSpeed * 0.94);
  }
}

// ---- Damage ----------------------------------------------------------------------

export function damageCar(S, car, amount, cause) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    S.events.push({ t: 'carWrecked', x: car.x, y: car.y, car, cause });
    if (car.driver === 'traffic') {
      car.driver = null;
      car.parked = true;
      S.events.push({ t: 'driverFled', x: car.x, y: car.y });
    }
  }
}

// ---- The player's car --------------------------------------------------------------

export function updatePlayerCar(S, car, dt) {
  const input = S.input;
  const fwdX = Math.cos(car.angle);
  const fwdY = Math.sin(car.angle);
  let fSpeed = car.vx * fwdX + car.vy * fwdY;
  const latX = car.vx - fwdX * fSpeed;
  const latY = car.vy - fwdY * fSpeed;

  const dead = car.dead;
  let throttle = 0;
  if (!dead && input.down('KeyW', 'ArrowUp')) throttle = 1;
  if (!dead && input.down('KeyS', 'ArrowDown')) throttle = -1;
  const handbrake = !dead && input.down('Space');

  if (throttle > 0) fSpeed += car.def.accel * dt * (1 - Math.max(0, fSpeed) / (car.def.topSpeed * 1.06));
  else if (throttle < 0) {
    if (fSpeed > 30) fSpeed -= 480 * dt; // braking
    else fSpeed = Math.max(fSpeed - car.def.accel * 0.7 * dt, -150); // reverse
  } else {
    fSpeed -= fSpeed * 0.55 * dt; // rolling drag
  }
  if (handbrake) fSpeed -= fSpeed * 1.4 * dt;

  let steer = 0;
  if (input.down('KeyA', 'ArrowLeft')) steer = -1;
  if (input.down('KeyD', 'ArrowRight')) steer = 1;
  const steerAuthority = clamp(fSpeed / 130, -1, 1);
  car.angle += steer * steerAuthority * 2.05 * dt * (handbrake ? 1.35 : 1);

  const grip = handbrake ? 1.6 : car.def.grip;
  const latDecay = Math.exp(-grip * dt);
  const nFwdX = Math.cos(car.angle);
  const nFwdY = Math.sin(car.angle);
  car.vx = nFwdX * fSpeed + latX * latDecay;
  car.vy = nFwdY * fSpeed + latY * latDecay;

  const prevSpeed = Math.hypot(car.vx, car.vy);
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  const res = resolveCircle(S.city, car.x, car.y, 23);
  if (res.hit) {
    car.x = res.x;
    car.y = res.y;
    if (prevSpeed > 120) {
      damageCar(S, car, (prevSpeed - 110) * 0.075, 'wall');
      S.events.push({ t: 'crash', x: car.x, y: car.y, big: prevSpeed > 280, car, player: true });
      S.shake = Math.min(9, prevSpeed * 0.02);
    }
    // Kill the velocity component that ran into the world.
    const into = car.vx * nFwdX + car.vy * nFwdY;
    if (Math.abs(into) > 40) {
      car.vx -= nFwdX * into * 1.25;
      car.vy -= nFwdY * into * 1.25;
    } else {
      car.vx *= 0.5;
      car.vy *= 0.5;
    }
  }
  car.speed = Math.hypot(car.vx, car.vy);
  return { driving: throttle !== 0 || Math.abs(fSpeed) > 24, fSpeed, handbrake };
}

// Car against car: circles, a shove, a little damage, and a noise the main loop judges.
export function collideCars(S, dt) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = 44;
      if (d2 > min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      if (!a.parked) { a.x -= nx * push; a.y -= ny * push; }
      if (!b.parked) { b.x += nx * push; b.y += ny * push; }
      const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
      if (rel > 130) {
        damageCar(S, a, (rel - 120) * 0.05, 'car');
        damageCar(S, b, (rel - 120) * 0.05, 'car');
        S.events.push({ t: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, big: rel > 300, car: b, other: a });
        if (a.driver === 'player' || b.driver === 'player') S.shake = Math.min(8, rel * 0.018);
      }
      if (a.driver !== 'player') a.speed *= 0.55;
      if (b.driver !== 'player') b.speed *= 0.55;
    }
  }
}

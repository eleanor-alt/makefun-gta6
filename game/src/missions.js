// The story of Palmira Heat, as a chain of missions handed out by Delia "Dee" Fontaine at
// her diner. Marlo Reyes, a wheelman down on his luck, works his way up her ladder: steal
// a car, move a crate, drive a getaway, and settle things with the Corsairs at the pier.
// Each mission is a small state machine over stages; this module sets objectives, watches
// for arrivals, runs the dialog and pays out. Deaths and busts mid-mission are reported by
// the main loop through failCurrentMission, which resets the mission to its first stage.

import { dist } from './random.js';
import { createCar } from './vehicles.js';
import { spawnPed } from './people.js';

export const STORY_ORDER = ['m1', 'm2', 'm3', 'm4'];

const DEE = 'Dee';
const MARLO = 'Marlo';
const NILS = 'Nils';

export function newMissionState() {
  return {
    activeId: null, // mission currently being played
    stage: 0,
    nextIndex: 0, // next story mission in STORY_ORDER to offer
    entities: [], // cars and peds this mission spawned, for cleanup
    car: null, // the mission car, where one matters
    timer: null, // seconds left, where a stage is timed
    flagged: {}, // one-shot stage flags
    courier: false,
  };
}

function track(S, ent) {
  S.mission.entities.push(ent);
  return ent;
}

function cleanup(S) {
  for (const ent of S.mission.entities) {
    ent.dead = true;
    ent.state = 'gone';
    ent.parked = true;
    ent.driver = null;
  }
  S.mission.entities = [];
  S.mission.car = null;
}

function objective(S, text, x, y, sub = '') {
  S.objective = { text, x, y, sub, timer: S.mission.timer };
}

function noObjective(S) {
  S.objective = null;
}

// ---- Starting and ending -------------------------------------------------------

export function offerAtDiner(S) {
  // Standing at the diner with no mission running: the next chapter, or courier work.
  if (S.mission.activeId) return false;
  if (S.mission.nextIndex < STORY_ORDER.length) return true;
  return S.storyDone;
}

export function beginOffered(S) {
  const M = S.mission;
  if (M.nextIndex < STORY_ORDER.length) {
    beginMission(S, STORY_ORDER[M.nextIndex]);
  } else {
    beginCourier(S);
  }
}

export function beginMission(S, id) {
  const M = S.mission;
  cleanup(S);
  M.activeId = id;
  M.stage = 0;
  M.timer = null;
  M.flagged = {};
  M.courier = false;
  S.events.push({ t: 'missionStart', id });
  const L = S.city.landmarks;
  if (id === 'm1') {
    S.showDialog([
      [DEE, 'Marlo Reyes. Still the best pair of hands ever to disgrace my parking lot.'],
      [MARLO, 'And you still owe me for the last job, Dee.'],
      [DEE, 'Then earn. A Vantek Solstice is sitting in the marina lot, keys in, owner in Aruba. Bring it to my garage — gently, she\'s a collector\'s girl.'],
      [MARLO, 'Stealing a convertible. Retirement really is overrated.'],
    ], () => {});
    const spot = S.city.landmarks.solsticeSpot;
    const car = createCar(S.rng, 'sports', spot.x, spot.y, spot.angle, { color: '#f2c230', parked: true, missionCar: true });
    S.cars.push(track(S, car));
    M.car = car;
  } else if (id === 'm2') {
    S.showDialog([
      [DEE, 'A crate came in at the Old Port warehouse. Medicine, machine parts — don\'t ask, don\'t open.'],
      [DEE, 'Pick it up on foot, then take it to a villa up in Sunny Heights. The buyer pays on the doorstep, and the port police have been twitchy all week.'],
      [MARLO, 'Twitchy how?'],
      [DEE, 'Two-stars twitchy, the second you touch that crate. Drive like you mean it.'],
    ], () => {});
  } else if (id === 'm3') {
    S.showDialog([
      [DEE, 'Nils Berg. Used to count money for Palmira Trust; today he\'s walking out with a bag of it.'],
      [DEE, 'He\'ll be at the bank doors, sweating through his suit. Pick him up, keep that car alive, and lose him at the old house in the Flats.'],
      [MARLO, 'And the police?'],
      [DEE, 'Three stars\' worth of opinions about it. Go.'],
    ], () => {});
    const nils = spawnPed(S.rng, L.bank.x, L.bank.y, 'ped');
    nils.shirt = '#2e2e34';
    nils.name = NILS;
    S.peds.push(track(S, nils));
    M.flagged.nils = nils;
  } else if (id === 'm4') {
    S.showDialog([
      [DEE, 'Last one, Marlo. Captain Vara and her Corsairs think the pier is theirs now. They jumped two of my drivers this week.'],
      [DEE, 'Go down there at dusk and explain property law. However you like — you\'re better with that Kestrel than you admit.'],
      [MARLO, 'And when they\'re done explaining back?'],
      [DEE, 'Then come home. Dinner\'s on the house, forever. That\'s the deal.'],
    ], () => {});
    S.duskTarget = 1;
  }
}

function completeMission(S, reward, lines) {
  const M = S.mission;
  S.addMoney(reward);
  S.events.push({ t: 'missionDone', id: M.activeId, reward });
  cleanup(S);
  M.activeId = null;
  M.timer = null;
  if (!M.courier) M.nextIndex += 1;
  if (M.nextIndex >= STORY_ORDER.length) S.storyDone = true;
  noObjective(S);
  if (lines) S.showDialog(lines, () => {});
}

export function failCurrentMission(S, reason) {
  const M = S.mission;
  if (!M.activeId) return;
  const id = M.activeId;
  S.events.push({ t: 'missionFail', id, reason });
  cleanup(S);
  M.activeId = null;
  M.timer = null;
  S.duskTarget = 0;
  noObjective(S);
  S.toast(`Mission failed — ${reason}. Dee will run it again from the diner.`);
  // Re-offer the same mission straight away.
  M.pendingRestart = id;
}

// ---- Courier work (repeatable, after the story) ----------------------------------

const COURIER_SPOTS = ['bank', 'warehouse', 'marina', 'hospital', 'buyer', 'hideout', 'police'];

function beginCourier(S) {
  const M = S.mission;
  cleanup(S);
  M.activeId = 'courier';
  M.courier = true;
  M.stage = 0;
  M.flagged = {};
  const L = S.city.landmarks;
  const destKey = COURIER_SPOTS[Math.floor(S.rng.next() * COURIER_SPOTS.length)];
  const dest = L[destKey];
  M.flagged.dest = dest;
  const d = dist(L.diner.x, L.diner.y, dest.x, dest.y);
  M.timer = Math.round(d / 9.5) + 25;
  M.flagged.reward = Math.round(120 + d * 0.09);
  S.showDialog([
    [DEE, 'Courier run, if you want it. Small package, far corner of the bay, clock\'s running.'],
  ], () => {});
  S.events.push({ t: 'missionStart', id: 'courier' });
}

// ---- The per-frame watch ----------------------------------------------------------

export function updateMissions(S, dt) {
  const M = S.mission;
  const L = S.city.landmarks;
  const p = S.player;

  if (M.pendingRestart) {
    const id = M.pendingRestart;
    M.pendingRestart = null;
    beginMission(S, id);
    return;
  }

  if (!M.activeId) {
    if (offerAtDiner(S)) {
      objective(S, S.mission.nextIndex < STORY_ORDER.length ? 'See Dee at the diner' : 'Courier work at the diner', L.diner.x, L.diner.y, 'Walk into the gold marker');
      if (!p.inCar && dist(p.x, p.y, L.diner.x, L.diner.y) < 42) beginOffered(S);
    } else {
      noObjective(S);
    }
    return;
  }

  if (M.timer !== null && M.timer !== undefined) {
    M.timer -= dt;
    if (M.timer <= 0) {
      failCurrentMission(S, 'out of time');
      return;
    }
  }

  const id = M.activeId;
  if (id === 'm1') updateM1(S, L, p);
  else if (id === 'm2') updateM2(S, L, p, dt);
  else if (id === 'm3') updateM3(S, L, p);
  else if (id === 'm4') updateM4(S, L, p);
  else if (id === 'courier') updateCourier(S, L, p);
}

function updateM1(S, L, p) {
  const M = S.mission;
  const car = M.car;
  if (M.stage === 0) {
    objective(S, 'Steal the gold Vantek Solstice', L.marina.x, L.marina.y, 'It is parked in the marina lot');
    if (car && car.dead) return failCurrentMission(S, 'the Solstice was wrecked');
    if (p.inCar === car) {
      M.stage = 1;
      S.toast('That\'s the car. Get it to Dee\'s garage.');
    }
  } else {
    objective(S, 'Deliver the Solstice to Dee\'s garage', L.garage.x, L.garage.y, 'Park it in the marker behind the diner');
    if (car.dead) return failCurrentMission(S, 'the Solstice was wrecked');
    if (p.inCar === car && dist(car.x, car.y, L.garage.x, L.garage.y) < 58) {
      // The delivered car stays in the world as a trophy — Marlo is sitting in it,
      // so it stays his current car: just take it off the mission's books before
      // completion cleans the rest up.
      S.mission.entities = S.mission.entities.filter((e) => e !== car);
      S.mission.car = null;
      car.missionCar = false;
      completeMission(S, 600, [
        [DEE, 'Not a scratch. She purrs, Marlo. Six hundred, and there\'s more where that came from.'],
        [MARLO, 'There always is with you.'],
      ]);
    }
  }
}

function updateM2(S, L, p) {
  const M = S.mission;
  if (M.stage === 0) {
    objective(S, 'Pick up the crate at the Old Port warehouse', L.warehouse.x, L.warehouse.y, 'On foot — walk into the marker');
    if (!p.inCar && dist(p.x, p.y, L.warehouse.x, L.warehouse.y) < 44) {
      M.stage = 1;
      M.timer = 185;
      S.heat = Math.max(S.heat, 205);
      S.events.push({ t: 'pickup' });
      S.toast('Crate in hand. The port police noticed — move!');
    }
  } else {
    objective(S, 'Deliver the crate to the Sunny Heights villa', L.buyer.x, L.buyer.y, 'The buyer pays on the doorstep');
    if (dist(p.x, p.y, L.buyer.x, L.buyer.y) < 50) {
      M.timer = null;
      completeMission(S, 1000, [
        ['Buyer', 'Dee\'s famous discretion. Tell her the villa is grateful — and that the crate was heavier than money.'],
        [MARLO, 'I stopped asking questions two jobs ago.'],
      ]);
    }
  }
}

function updateM3(S, L, p) {
  const M = S.mission;
  const nils = M.flagged.nils;
  if (M.stage === 0) {
    objective(S, 'Pick up Nils at Palmira Trust', L.bank.x, L.bank.y, 'Pull up at the bank doors in any car');
    if (nils && p.inCar && dist(p.inCar.x, p.inCar.y, nils.x, nils.y) < 62) {
      nils.state = 'gone';
      M.stage = 1;
      S.passenger = true;
      S.heat = Math.max(S.heat, 305);
      S.events.push({ t: 'pickup' });
      S.toast('Nils is in. "Drive! Drive like the rent is due!"');
    }
  } else {
    objective(S, 'Lose the heat and reach the Flats hideout', L.hideout.x, L.hideout.y, 'Keep the car alive — Nils is precious cargo');
    if (!p.inCar) return; // on foot mid-mission is allowed, just slow
    if (p.inCar.dead) return failCurrentMission(S, 'the getaway car was wrecked');
    if (dist(p.inCar.x, p.inCar.y, L.hideout.x, L.hideout.y) < 62) {
      S.passenger = false;
      const out = spawnPed(S.rng, p.inCar.x + 30, p.inCar.y + 10, 'ped');
      out.shirt = '#2e2e34';
      out.state = 'flee';
      out.fleeX = p.inCar.x;
      out.fleeY = p.inCar.y;
      out.fleeTime = 3;
      S.peds.push(out);
      completeMission(S, 1600, [
        [NILS, 'We made it. WE MADE IT. Dee — your man is a surgeon with a steering wheel.'],
        [DEE, 'Sixteen hundred, Marlo. One more job after this. The big one. Rest up.'],
      ]);
    }
  }
}

function updateM4(S, L, p) {
  const M = S.mission;
  const pier = { x: S.city.pier.x + 190, y: S.city.pier.y + 46 };
  if (M.stage === 0) {
    objective(S, 'Go to the pier and face the Corsairs', pier.x, pier.y, 'They are expecting you at dusk');
    if (dist(p.x, p.y, pier.x, pier.y) < 130) {
      M.stage = 1;
      M.flagged.wave = 0;
      M.flagged.toSpawn = true;
      S.heat = Math.max(S.heat, 120);
      S.toast('Captain Vara steps out of the shadows. "Wrong pier, Reyes."');
    }
    return;
  }
  if (M.flagged.toSpawn) {
    M.flagged.toSpawn = false;
    M.flagged.wave += 1;
    const wave = M.flagged.wave;
    const count = wave === 1 ? 3 : wave === 2 ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const g = spawnPed(S.rng, pier.x + 120 + i * 46, pier.y - 30 + (i % 2) * 60, 'gang');
      if (wave === 3) g.hp = 100;
      g.shirt = '#20303c';
      S.peds.push(track(S, g));
      M.flagged['gang' + g.id] = g;
    }
    S.events.push({ t: 'ambush', wave });
    S.toast(wave === 1 ? 'Corsairs! Put them down.' : `Wave ${wave} — more Corsairs pour onto the pier.`);
  }
  const alive = M.entities.filter((e) => e.kind === 'gang' && e.state !== 'gone' && e.state !== 'down');
  if (M.stage === 1 && !M.flagged.toSpawn) {
    objective(S, `Put down the Corsairs — wave ${M.flagged.wave} of 3`, pier.x, pier.y, `${alive.length} still standing`);
    if (alive.length === 0) {
      if (M.flagged.wave >= 3) {
        M.stage = 2;
        S.toast('The pier is yours. Get back to Dee.');
      } else {
        M.flagged.toSpawn = true;
      }
    }
  } else if (M.stage === 2) {
    objective(S, 'Return to Dee at the diner', L.diner.x, L.diner.y, 'The last job is done — go home');
    if (dist(p.x, p.y, L.diner.x, L.diner.y) < 55) {
      S.duskTarget = 0;
      completeMission(S, 2600, [
        [DEE, 'Vara\'s crew just sent word: the pier, the port, all of it — yours, if you ever want it.'],
        [MARLO, 'I don\'t. I want a booth, a coffee, and no sirens for a week.'],
        [DEE, 'Done. Palmira Bay is quiet again, Marlo Reyes. Quiet as you made it.'],
      ]);
    }
  }
}

function updateCourier(S, L, p) {
  const M = S.mission;
  const dest = M.flagged.dest;
  objective(S, 'Courier delivery', dest.x, dest.y, 'Beat the clock — any route, any wheels');
  if (dist(p.x, p.y, dest.x, dest.y) < 52) {
    const reward = M.flagged.reward;
    M.timer = null;
    completeMission(S, reward, null);
    S.toast(`Delivered. $${reward} for the run.`);
  }
}

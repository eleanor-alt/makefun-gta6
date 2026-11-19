// Palmira Bay: a seeded grid city of pastel blocks, built once at load. Roads run on a
// regular pitch with right-hand lanes; inside each block sit buildings, parks, plazas or
// parking lots. The east edge is the bay — sand, then water, with a wooden pier. Landmarks
// the story needs (Dee's diner, the bank, the docks warehouse, the marina, the hideout...)
// are placed on named blocks so missions and the minimap can point at them.

import { WORLD, PALETTE } from './config.js';
import { Rng } from './random.js';

const ROOF_COLORS = ['#e8dcc4', '#dfb49a', '#c9d6cf', '#e3c9d2', '#b8c9de', '#efe3b0', '#d9a08a', '#a8bfb2', '#f0e6d2', '#c4b49a'];
const WALL_COLORS = ['#f2e7d3', '#e8cdb4', '#d7e2da', '#eed3da', '#cfdce8', '#f4ead0'];

export function buildCity(seed = 20261117) {
  const rng = new Rng(seed);
  const pitch = WORLD.blockPitch;
  const halfRoad = WORLD.roadWidth / 2;
  const cols = Math.floor(WORLD.width / pitch); // 8
  const rows = Math.floor(WORLD.height / pitch); // 6

  const roadX = [];
  for (let i = 0; i <= cols; i++) roadX.push(i * pitch);
  const roadY = [];
  for (let j = 0; j <= rows; j++) roadY.push(j * pitch);

  const buildings = [];
  const props = [];
  const lots = []; // parking spots: {x, y, angle}
  const blockKind = new Map();

  const addBuilding = (x, y, w, h, opts = {}) => {
    const b = {
      x, y, w, h,
      roof: opts.roof ?? rng.pick(ROOF_COLORS),
      wall: opts.wall ?? rng.pick(WALL_COLORS),
      label: opts.label ?? null,
      kind: opts.kind ?? 'block',
      floors: opts.floors ?? rng.int(1, 4),
    };
    buildings.push(b);
    return b;
  };

  const addProp = (x, y, kind) => props.push({ x, y, kind, sway: rng.range(0, Math.PI * 2) });

  // Landmark blocks are spoken for; the rest are filled by the generator below.
  const reserved = new Set(['1,2', '4,1', '5,4', '4,3', '2,5', '6,4', '0,5', '6,0']);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const key = `${i},${j}`;
      const bx = i * pitch + halfRoad + 14;
      const by = j * pitch + halfRoad + 14;
      const bw = pitch - WORLD.roadWidth - 28;
      const bh = bw;
      if (reserved.has(key)) {
        blockKind.set(key, 'landmark');
        continue;
      }
      if (i === cols - 1) {
        // The shore column: open beach and palms, a couple of low bars.
        blockKind.set(key, 'beach');
        for (let t = 0; t < 7; t++) addProp(bx + rng.range(20, bw - 20), by + rng.range(20, bh - 20), 'palm');
        if (rng.chance(0.5)) addBuilding(bx + 120, by + 170, 150, 90, { label: rng.pick(['Tiki Bar', 'Surf Rentals', 'Café Brisa']), floors: 1 });
        continue;
      }
      const roll = rng.next();
      if (roll < 0.14) {
        blockKind.set(key, 'park');
        for (let t = 0; t < 12; t++) addProp(bx + rng.range(16, bw - 16), by + rng.range(16, bh - 16), rng.chance(0.6) ? 'palm' : 'tree');
        for (let t = 0; t < 4; t++) addProp(bx + rng.range(30, bw - 30), by + rng.range(30, bh - 30), 'bench');
      } else if (roll < 0.26) {
        blockKind.set(key, 'parking');
        for (let s = 0; s < 6; s++) {
          lots.push({ x: bx + 60 + (s % 3) * 130, y: by + 90 + Math.floor(s / 3) * 190, angle: Math.PI / 2 });
        }
        if (rng.chance(0.6)) addBuilding(bx + 330, by + 330, 130, 110, { floors: 1, label: rng.pick(['Mini Mart', 'Laundromat', 'Pawn & Gold']) });
      } else {
        blockKind.set(key, 'buildings');
        const n = rng.int(2, 4);
        const cell = bw / 2;
        const spots = [
          [bx + 8, by + 8], [bx + cell + 8, by + 8],
          [bx + 8, by + cell + 8], [bx + cell + 8, by + cell + 8],
        ];
        for (let k = 0; k < n; k++) {
          const [sx, sy] = spots[k];
          const w = cell - rng.range(46, 90);
          const h = cell - rng.range(46, 90);
          addBuilding(sx + rng.range(0, 24), sy + rng.range(0, 24), w, h, {});
        }
        if (rng.chance(0.4)) addProp(bx + rng.range(30, bw - 30), by + bh - 24, 'palm');
      }
    }
  }

  // Street lamps at every intersection corner.
  for (const x of roadX) for (const y of roadY) addProp(x + halfRoad + 8, y + halfRoad + 8, 'lamp');

  // ---- Landmarks -----------------------------------------------------------
  const L = {};
  const blockOrigin = (i, j) => ({ x: i * pitch + halfRoad + 14, y: j * pitch + halfRoad + 14 });

  { // Dee's Diner and her garage, block (1,2) — the game's home base.
    const o = blockOrigin(1, 2);
    addBuilding(o.x + 40, o.y + 60, 230, 120, { label: "Dee's Diner", roof: '#e88ca0', floors: 1 });
    addBuilding(o.x + 320, o.y + 60, 160, 120, { label: 'Garage', roof: '#9db4c0', floors: 1 });
    L.diner = { x: o.x + 155, y: o.y + 240 };
    L.garage = { x: o.x + 400, y: o.y + 240 };
    L.savePoint = { x: o.x + 155, y: o.y + 300 };
    L.spawn = { x: o.x + 155, y: o.y + 330 };
  }
  { // Police headquarters, block (4,1).
    const o = blockOrigin(4, 1);
    addBuilding(o.x + 90, o.y + 120, 320, 190, { label: 'Palmira PD', roof: '#5a6c85', wall: '#aebdd0', floors: 3 });
    L.police = { x: o.x + 250, y: o.y + 370 };
  }
  { // St. Brisa Hospital, block (5,4).
    const o = blockOrigin(5, 4);
    addBuilding(o.x + 110, o.y + 110, 300, 200, { label: 'St. Brisa Hospital', roof: '#e8e8e8', wall: '#eef2f2', floors: 3 });
    L.hospital = { x: o.x + 260, y: o.y + 370 };
  }
  { // Palmira Trust bank, block (4,3), downtown.
    const o = blockOrigin(4, 3);
    addBuilding(o.x + 100, o.y + 90, 310, 230, { label: 'Palmira Trust', roof: '#d9a441', wall: '#e8dcc0', floors: 4 });
    L.bank = { x: o.x + 255, y: o.y + 390 };
  }
  { // Old Port warehouse, block (2,5), the docks.
    const o = blockOrigin(2, 5);
    addBuilding(o.x + 70, o.y + 130, 360, 170, { label: 'Old Port Warehouse', roof: '#8a97a5', wall: '#b9c2c9', floors: 1 });
    L.warehouse = { x: o.x + 250, y: o.y + 370 };
  }
  { // Marina parking lot, block (6,4): the Solstice waits here in mission 1.
    const o = blockOrigin(6, 4);
    for (let s = 0; s < 6; s++) {
      lots.push({ x: o.x + 70 + (s % 3) * 140, y: o.y + 110 + Math.floor(s / 3) * 200, angle: Math.PI / 2 });
    }
    addBuilding(o.x + 330, o.y + 330, 140, 100, { label: 'Marina Office', floors: 1 });
    L.marina = { x: o.x + 210, y: o.y + 210 };
    L.solsticeSpot = { x: o.x + 70, y: o.y + 110, angle: Math.PI / 2 };
  }
  { // The hideout, a plain house in The Flats, block (0,5).
    const o = blockOrigin(0, 5);
    addBuilding(o.x + 150, o.y + 150, 180, 130, { label: null, roof: '#c9a689', floors: 1 });
    L.hideout = { x: o.x + 240, y: o.y + 340 };
  }
  { // The buyer's villa in Sunny Heights, block (6,0).
    const o = blockOrigin(6, 0);
    addBuilding(o.x + 130, o.y + 120, 240, 160, { label: null, roof: '#e3b7a0', floors: 2 });
    for (let t = 0; t < 5; t++) addProp(o.x + rng.range(20, 480), o.y + rng.range(320, 480), 'palm');
    L.buyer = { x: o.x + 250, y: o.y + 340 };
  }

  // The pier: a deck reaching into the bay at the middle of the shore.
  const pier = { x: WORLD.waterX - 30, y: 3 * pitch + 250, w: WORLD.width - WORLD.waterX + 30, h: 92 };

  // Spatial index of buildings by block, for cheap collision queries.
  const grid = new Map();
  for (const b of buildings) {
    const i0 = Math.floor(b.x / pitch);
    const i1 = Math.floor((b.x + b.w) / pitch);
    const j0 = Math.floor(b.y / pitch);
    const j1 = Math.floor((b.y + b.h) / pitch);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const key = `${i},${j}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(b);
    }
  }

  return {
    width: WORLD.width,
    height: WORLD.height,
    roadX, roadY, buildings, props, lots,
    landmarks: L, pier, grid,
    palette: PALETTE,
  };
}

// ---- Queries ---------------------------------------------------------------

export function buildingsNear(city, x, y) {
  const pitch = WORLD.blockPitch;
  const key = `${Math.floor(x / pitch)},${Math.floor(y / pitch)}`;
  return city.grid.get(key) ?? [];
}

export function onPier(city, x, y) {
  const p = city.pier;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

export function isWater(city, x, y) {
  return x > WORLD.waterX && !onPier(city, x, y);
}

// True when a circle at (x, y) may not be there: inside a building, in the bay off the
// pier, or outside the world.
export function pointBlocked(city, x, y, pad = 0) {
  if (x < 6 || y < 6 || x > city.width - 6 || y > city.height - 6) return true;
  if (isWater(city, x, y)) return true;
  for (const b of buildingsNear(city, x, y)) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

// Push a circle out of every building it overlaps; returns the resolved position and
// whether anything was hit (cars use the hit to take damage and stop).
export function resolveCircle(city, x, y, r) {
  let hit = false;
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > city.width - r) { x = city.width - r; hit = true; }
  if (y > city.height - r) { y = city.height - r; hit = true; }
  if (isWater(city, x, y)) {
    x = Math.min(x, WORLD.waterX - r);
    hit = true;
  }
  for (const b of buildingsNear(city, x, y)) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Centre inside the box: leave by the shortest side.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return { x, y, hit };
}

export function isRoad(city, x, y) {
  const half = WORLD.roadWidth / 2 + 4;
  for (const rx of city.roadX) if (Math.abs(x - rx) <= half) return true;
  for (const ry of city.roadY) if (Math.abs(y - ry) <= half) return true;
  return false;
}

// The intersection (road crossing) nearest a point.
export function nearestIntersection(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadX) for (const ry of city.roadY) {
    const d = (rx - x) * (rx - x) + (ry - y) * (ry - y);
    if (d < bestD) { bestD = d; best = { x: rx, y: ry }; }
  }
  return best;
}

// A random point on a random road, optionally within a ring around (cx, cy).
export function randomRoadPoint(city, rng, cx = null, cy = null, minD = 0, maxD = Infinity) {
  for (let tries = 0; tries < 24; tries++) {
    let x;
    let y;
    if (rng.chance(0.5)) {
      x = rng.pick(city.roadX) + rng.range(-WORLD.roadWidth / 3, WORLD.roadWidth / 3);
      y = rng.range(40, city.height - 40);
    } else {
      x = rng.range(40, city.width - 40);
      y = rng.pick(city.roadY) + rng.range(-WORLD.roadWidth / 3, WORLD.roadWidth / 3);
    }
    if (cx === null) return { x, y };
    const d = Math.hypot(x - cx, y - cy);
    if (d >= minD && d <= maxD) return { x, y };
  }
  return { x: city.roadX[1], y: city.roadY[1] };
}

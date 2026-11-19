// Drawing Palmira Bay: sun-bleached ground, a grid of warm asphalt roads, pastel blocks
// with flat roofs, palms and lamps, then the cars and people on top. Everything is drawn
// from the world data with the camera's view culled, so a frame only pays for what is on
// screen. A dusk factor (the last mission's evening) deepens the light and wakes the lamps.

import { WORLD, PALETTE } from './config.js';
import { clamp } from './random.js';

function inView(S, x, y, pad = 80) {
  const c = S.camera;
  return x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad;
}

export function drawScene(ctx, S) {
  const cam = S.camera;
  const city = S.city;
  ctx.save();
  ctx.translate(-Math.round(cam.x + S.shakeX), -Math.round(cam.y + S.shakeY));
  drawGround(ctx, S, city);
  drawRoads(ctx, S, city);
  drawBlocks(ctx, S, city);
  drawPier(ctx, S, city);
  drawProps(ctx, S, city);
  drawBeacon(ctx, S);
  for (const car of S.cars) if (inView(S, car.x, car.y, 90)) drawCar(ctx, S, car);
  for (const ped of S.peds) if (ped.state !== 'gone' && inView(S, ped.x, ped.y, 40)) drawPed(ctx, S, ped);
  if (S.player.state !== 'gone') drawPlayer(ctx, S);
  drawBullets(ctx, S);
  drawParticles(ctx, S);
  ctx.restore();
  drawLight(ctx, S);
}

// ---- Ground, roads, blocks -----------------------------------------------------

function drawGround(ctx, S, city) {
  const cam = S.camera;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(cam.x - 20, cam.y - 20, cam.w + 40, cam.h + 40);
  // Mown stripes on the grass, cheap and cheerful.
  ctx.fillStyle = PALETTE.grassDark;
  const stripe = 128;
  for (let x = Math.floor(cam.x / stripe) * stripe; x < cam.x + cam.w; x += stripe * 2) {
    ctx.fillRect(x, cam.y - 20, stripe, cam.h + 40);
  }
  // The shore: sand, then the bay.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.beachX, cam.y - 20, WORLD.waterX - WORLD.beachX + 60, cam.h + 40);
  const wave = Math.sin(S.time * 1.4) * 6;
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WORLD.waterX + wave * 0.3, cam.y - 20, city.width - WORLD.waterX + 60, cam.h + 40);
  ctx.fillStyle = PALETTE.waterDeep;
  for (let y = Math.floor(cam.y / 90) * 90; y < cam.y + cam.h; y += 90) {
    ctx.fillRect(WORLD.waterX + 26 + ((y / 90) % 3) * 30, y, 90, 5);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(WORLD.waterX + wave, cam.y - 20, 4, cam.h + 40);
}

function drawRoads(ctx, S, city) {
  const half = WORLD.roadWidth / 2;
  ctx.fillStyle = PALETTE.road;
  for (const x of city.roadX) {
    if (x + half < S.camera.x || x - half > S.camera.x + S.camera.w) continue;
    ctx.fillRect(x - half, 0, WORLD.roadWidth, city.height);
  }
  for (const y of city.roadY) {
    if (y + half < S.camera.y || y - half > S.camera.y + S.camera.h) continue;
    ctx.fillRect(0, y - half, city.width, WORLD.roadWidth);
  }
  // Edge lines and dashed centrelines, skipping the crossings.
  ctx.fillStyle = PALETTE.roadEdge;
  for (const x of city.roadX) {
    if (x + half < S.camera.x || x - half > S.camera.x + S.camera.w) continue;
    ctx.fillRect(x - half, 0, 3, city.height);
    ctx.fillRect(x + half - 3, 0, 3, city.height);
  }
  for (const y of city.roadY) {
    if (y + half < S.camera.y || y - half > S.camera.y + S.camera.h) continue;
    ctx.fillRect(0, y - half, city.width, 3);
    ctx.fillRect(0, y + half - 3, city.width, 3);
  }
  ctx.fillStyle = PALETTE.lane;
  const dash = 30;
  const gap = 26;
  for (const x of city.roadX) {
    if (x < S.camera.x - 10 || x > S.camera.x + S.camera.w + 10) continue;
    for (let y = Math.max(0, Math.floor(S.camera.y / (dash + gap)) * (dash + gap)); y < Math.min(city.height, S.camera.y + S.camera.h); y += dash + gap) {
      if (city.roadY.some((ry) => Math.abs(y + dash / 2 - ry) < half + 14)) continue;
      ctx.fillRect(x - 2, y, 4, dash);
    }
  }
  for (const y of city.roadY) {
    if (y < S.camera.y - 10 || y > S.camera.y + S.camera.h + 10) continue;
    for (let x = Math.max(0, Math.floor(S.camera.x / (dash + gap)) * (dash + gap)); x < Math.min(city.width, S.camera.x + S.camera.w); x += dash + gap) {
      if (city.roadX.some((rx) => Math.abs(x + dash / 2 - rx) < half + 14)) continue;
      ctx.fillRect(x, y - 2, dash, 4);
    }
  }
}

function drawBlocks(ctx, S, city) {
  const pitch = WORLD.blockPitch;
  const half = WORLD.roadWidth / 2;
  // Sidewalk slabs under everything built.
  ctx.fillStyle = PALETTE.sidewalk;
  for (let i = 0; i < city.roadX.length - 1; i++) {
    for (let j = 0; j < city.roadY.length - 1; j++) {
      const x = city.roadX[i] + half;
      const y = city.roadY[j] + half;
      const w = pitch - WORLD.roadWidth;
      if (!inView(S, x + w / 2, y + w / 2, w)) continue;
      ctx.fillRect(x, y, w, w);
    }
  }
  // Parking lots get stall lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (const lot of city.lots) {
    if (!inView(S, lot.x, lot.y, 30)) continue;
    ctx.strokeRect(lot.x - 22, lot.y - 30, 44, 60);
  }
  // Buildings: drop shadow, wall, roof, a parapet line, and the odd roof box.
  for (const b of city.buildings) {
    if (!inView(S, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = PALETTE.roofShadow;
    ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(90,70,40,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(120,110,90,0.5)';
    const seed = Math.floor(b.x * 7 + b.y * 13);
    ctx.fillRect(b.x + 14 + (seed % 40), b.y + 14 + (seed % 30), 22, 16);
    if (b.floors >= 3) ctx.fillRect(b.x + b.w - 52, b.y + b.h - 40, 26, 20);
    if (b.label) {
      ctx.fillStyle = 'rgba(40,32,20,0.85)';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6);
    }
  }
}

function drawPier(ctx, S, city) {
  const p = city.pier;
  if (!inView(S, p.x + p.w / 2, p.y + p.h / 2, p.w)) return;
  ctx.fillStyle = 'rgba(46,38,20,0.25)';
  ctx.fillRect(p.x + 6, p.y + 8, p.w, p.h);
  ctx.fillStyle = '#a97d4f';
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#96703f';
  for (let x = p.x + 8; x < p.x + p.w; x += 26) ctx.fillRect(x, p.y + 4, 3, p.h - 8);
  ctx.fillStyle = '#7d5c33';
  ctx.fillRect(p.x, p.y, p.w, 5);
  ctx.fillRect(p.x, p.y + p.h - 5, p.w, 5);
}

function drawProps(ctx, S, city) {
  for (const prop of city.props) {
    if (!inView(S, prop.x, prop.y, 46)) continue;
    if (prop.kind === 'palm') drawPalm(ctx, S, prop);
    else if (prop.kind === 'tree') drawTree(ctx, prop);
    else if (prop.kind === 'bench') {
      ctx.fillStyle = '#8a6b42';
      ctx.fillRect(prop.x - 11, prop.y - 4, 22, 8);
    } else if (prop.kind === 'lamp') {
      ctx.fillStyle = '#3c4048';
      ctx.fillRect(prop.x - 2, prop.y - 2, 4, 4);
      if (S.dusk > 0.25) {
        const g = ctx.createRadialGradient(prop.x, prop.y, 2, prop.x, prop.y, 44);
        g.addColorStop(0, `rgba(255,214,140,${0.5 * S.dusk})`);
        g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(prop.x - 44, prop.y - 44, 88, 88);
      }
    }
  }
}

function drawPalm(ctx, S, prop) {
  const sway = Math.sin(S.time * 1.1 + prop.sway) * 2;
  ctx.strokeStyle = '#8a6b42';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(prop.x, prop.y);
  ctx.quadraticCurveTo(prop.x + 3, prop.y - 9, prop.x + 6 + sway * 0.4, prop.y - 16);
  ctx.stroke();
  ctx.strokeStyle = '#4e8f3e';
  ctx.lineWidth = 3;
  const topX = prop.x + 6 + sway * 0.4;
  const topY = prop.y - 16;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + prop.sway;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(a) * 13, topY + Math.sin(a) * 8 - 4,
      topX + Math.cos(a) * 22 + sway, topY + Math.sin(a) * 13 + 5,
    );
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(46,38,20,0.2)';
  ctx.beginPath();
  ctx.ellipse(prop.x + 2, prop.y + 3, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx, prop) {
  ctx.fillStyle = 'rgba(46,38,20,0.2)';
  ctx.beginPath();
  ctx.ellipse(prop.x + 3, prop.y + 4, 15, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5d9c48';
  ctx.beginPath();
  ctx.arc(prop.x, prop.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6fae56';
  ctx.beginPath();
  ctx.arc(prop.x - 4, prop.y - 4, 9, 0, Math.PI * 2);
  ctx.fill();
}

// ---- The objective beacon ---------------------------------------------------------

function drawBeacon(ctx, S) {
  const o = S.objective;
  if (!o || o.x === null) return;
  const pulse = 0.72 + Math.sin(S.time * 4) * 0.28;
  const grad = ctx.createLinearGradient(0, o.y - 340, 0, o.y);
  grad.addColorStop(0, 'rgba(255,196,48,0)');
  grad.addColorStop(1, `rgba(255,196,48,${0.4 * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(o.x - 15, o.y - 340, 30, 340);
  ctx.strokeStyle = `rgba(255,196,48,${0.9 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, 30 + Math.sin(S.time * 4) * 5, 15 + Math.sin(S.time * 4) * 2.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffc430';
  ctx.beginPath();
  ctx.moveTo(o.x, o.y - 52 - Math.sin(S.time * 4) * 5);
  ctx.lineTo(o.x - 11, o.y - 76 - Math.sin(S.time * 4) * 5);
  ctx.lineTo(o.x + 11, o.y - 76 - Math.sin(S.time * 4) * 5);
  ctx.closePath();
  ctx.fill();
}

// ---- Cars and people -----------------------------------------------------------------

export function drawCar(ctx, S, car) {
  const { def } = car;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow, then body, cabin, glass and details in the car's local frame (nose = +x).
  ctx.fillStyle = 'rgba(30,26,16,0.3)';
  roundRect(ctx, -def.w / 2 + 3, -def.h / 2 + 4, def.w, def.h, 6);
  ctx.fill();
  ctx.fillStyle = car.dead ? '#4c4c50' : car.color;
  roundRect(ctx, -def.w / 2, -def.h / 2, def.w, def.h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, -def.w / 2 + 3, -def.h / 2 + 2, def.w - 6, 5, 3);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = '#222a33';
  roundRect(ctx, -def.w * 0.16, -def.h / 2 + 3, def.w * 0.34, def.h - 6, 3);
  ctx.fill();
  ctx.fillStyle = '#9fc6d8';
  roundRect(ctx, def.w * 0.13, -def.h / 2 + 4, 5, def.h - 8, 2);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#17181c';
  const ww = 8;
  const wh = 4.5;
  ctx.fillRect(-def.w / 2 + 4, -def.h / 2 - 2, ww, wh);
  ctx.fillRect(-def.w / 2 + 4, def.h / 2 - 2, ww, wh);
  ctx.fillRect(def.w / 2 - 4 - ww, -def.h / 2 - 2, ww, wh);
  ctx.fillRect(def.w / 2 - 4 - ww, def.h / 2 - 2, ww, wh);
  // Lights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(def.w / 2 - 2, -def.h / 2 + 3, 3, 4);
  ctx.fillRect(def.w / 2 - 2, def.h / 2 - 7, 3, 4);
  ctx.fillStyle = '#c8352c';
  ctx.fillRect(-def.w / 2 - 1, -def.h / 2 + 3, 3, 4);
  ctx.fillRect(-def.w / 2 - 1, def.h / 2 - 7, 3, 4);
  if (car.type === 'police') {
    const flash = Math.floor(S.time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#3a7bff';
    roundRect(ctx, -8, -def.h / 2 + 4, 7, def.h - 8, 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#3a7bff' : '#ff3b30';
    roundRect(ctx, 1, -def.h / 2 + 4, 7, def.h - 8, 2);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-def.w / 2 + 10, -3, def.w - 26, 6);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-4, -5, 9, 10);
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0.5, 2.5);
  }
  if (car.missionCar) {
    ctx.strokeStyle = `rgba(255,196,48,${0.65 + Math.sin(S.time * 5) * 0.35})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, -def.w / 2 - 4, -def.h / 2 - 4, def.w + 8, def.h + 8, 8);
    ctx.stroke();
  }
  ctx.restore();
  // Damage smoke drifts up in world space.
  if (!car.dead && car.health < 45) {
    const n = car.health < 20 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = (S.time * 0.9 + i * 0.37 + car.id) % 1;
      ctx.fillStyle = `rgba(60,60,60,${0.4 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(car.x + Math.cos(car.angle) * 16 + t * 8, car.y - 6 - t * 30, 4 + t * 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    ctx.beginPath();
    ctx.arc(car.x, car.y - 10 - (S.time % 1) * 12, 8 + (S.time % 1) * 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPed(ctx, S, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(30,26,16,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-11, -3.4, 12, 6.8);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(1, -4.4, 10, 8.8);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(14, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 1.6;
  ctx.fillStyle = 'rgba(30,26,16,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ped.angle);
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-6, -5 + bob * 0.4, 7, 3.6);
  ctx.fillRect(-6, 1.4 - bob * 0.4, 7, 3.6);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(2.6, bob * 0.3, 4.3, 0, Math.PI * 2);
  ctx.fill();
  if (ped.kind === 'gang') {
    ctx.strokeStyle = '#14161a';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(5, 2);
    ctx.lineTo(15, 2.6);
    ctx.stroke();
  }
  ctx.restore();
  if (ped.name) {
    ctx.fillStyle = 'rgba(30,26,16,0.8)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ped.name, ped.x, ped.y - 16);
  }
}

function drawPlayer(ctx, S) {
  const p = S.player;
  if (p.inCar) return; // the car is the player while driving
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(30,26,16,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  const bob = Math.sin(p.walkPhase) * 1.6;
  ctx.fillStyle = '#2b3440';
  ctx.fillRect(-6, -5 + bob * 0.4, 7, 3.6);
  ctx.fillRect(-6, 1.4 - bob * 0.4, 7, 3.6);
  // Marlo's teal jacket and cap: the one person in the bay dressed like the cover.
  ctx.fillStyle = '#12836f';
  ctx.beginPath();
  ctx.arc(0, bob * 0.3, 6.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(2.6, bob * 0.3, 4.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e2543e';
  ctx.beginPath();
  ctx.arc(2.2, bob * 0.3, 4.5, Math.PI * 0.9, Math.PI * 1.9);
  ctx.fill();
  // The Kestrel, levelled at the mouse.
  ctx.strokeStyle = '#14161a';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(5, 2.4);
  ctx.lineTo(16, 2.8);
  ctx.stroke();
  ctx.restore();
  if (p.muzzle > 0) {
    ctx.fillStyle = 'rgba(255,210,90,0.9)';
    ctx.beginPath();
    const mx = p.x + Math.cos(p.angle) * 20;
    const my = p.y + Math.sin(p.angle) * 20;
    ctx.arc(mx, my, 5 + p.muzzle * 22, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- Tracers and particles ----------------------------------------------------------------

function drawBullets(ctx, S) {
  ctx.lineWidth = 2;
  for (const b of S.bullets) {
    ctx.strokeStyle = b.from === 'player' ? 'rgba(255,224,130,0.95)' : 'rgba(255,120,90,0.9)';
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles(ctx, S) {
  for (const fx of S.particles) {
    const life = fx.age / fx.maxAge;
    if (fx.kind === 'smoke') {
      ctx.fillStyle = `rgba(70,70,70,${0.38 * (1 - life)})`;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y - life * 26, fx.size + life * 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (fx.kind === 'spark') {
      ctx.fillStyle = `rgba(255,${180 + Math.floor(60 * (1 - life))},60,${1 - life})`;
      ctx.fillRect(fx.x - 1.6, fx.y - 1.6, 3.2, 3.2);
    } else if (fx.kind === 'flash') {
      ctx.fillStyle = `rgba(255,214,100,${0.85 * (1 - life)})`;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.size * (1 - life * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (fx.kind === 'cash') {
      ctx.fillStyle = `rgba(120,220,120,${1 - life})`;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text, fx.x, fx.y - life * 34);
    } else if (fx.kind === 'skid') {
      ctx.fillStyle = `rgba(30,30,30,${0.34 * (1 - life)})`;
      ctx.fillRect(fx.x - 2, fx.y - 2, 4, 4);
    }
  }
}

// ---- Light ---------------------------------------------------------------------------------

function drawLight(ctx, S) {
  const { w, h } = S.camera;
  if (S.dusk > 0.01) {
    ctx.fillStyle = `rgba(38,30,86,${0.34 * S.dusk})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(255,120,60,${0.1 * S.dusk})`;
    ctx.fillRect(0, 0, w, h);
  }
  // A whisper of vignette keeps the corners calm.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(30,20,0,0)');
  g.addColorStop(1, 'rgba(30,20,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { clamp };

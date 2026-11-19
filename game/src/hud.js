// The heads-up display: money and wanted stars top-left, the current objective across
// the top, health and weapon bottom-right, a bust meter when the police are close, and
// the minimap in the bottom-left corner — roads, the bay, the player's arrow, the gold
// objective marker and the flashing red-and-blue of any police nearby.

import { WORLD } from './config.js';
import { clamp } from './random.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['money', 'stars', 'objective', 'obj-text', 'obj-sub', 'obj-timer', 'health-fill', 'health-text', 'weapon', 'speed', 'bust', 'bust-fill', 'toast', 'passenger']) {
      this.el[id] = document.getElementById('hud-' + id);
    }
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastUntil = 0;
    this.lastMoney = null;
    this.lastStars = -1;
  }

  toast(text, seconds = 3.4) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastUntil = performance.now() + seconds * 1000;
  }

  update(S) {
    const p = S.player;
    if (this.toastUntil && performance.now() > this.toastUntil) {
      this.el.toast.classList.remove('show');
      this.toastUntil = 0;
    }
    if (S.money !== this.lastMoney) {
      this.el.money.textContent = '$' + S.money.toLocaleString('en-US');
      this.lastMoney = S.money;
    }
    const stars = S.stars;
    if (stars !== this.lastStars) {
      this.el.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      this.el.stars.classList.toggle('hot', stars > 0);
      this.lastStars = stars;
    }
    const o = S.objective;
    if (o) {
      this.el.objective.classList.add('show');
      this.el['obj-text'].textContent = o.text;
      let sub = o.sub ?? '';
      if (o.x !== null && o.x !== undefined) {
        const d = Math.hypot(p.x - o.x, p.y - o.y);
        sub += (sub ? ' · ' : '') + Math.round(d) + ' m';
      }
      this.el['obj-sub'].textContent = sub;
      if (o.timer !== null && o.timer !== undefined) {
        const t = Math.max(0, o.timer);
        const mm = Math.floor(t / 60);
        const ss = Math.floor(t % 60).toString().padStart(2, '0');
        this.el['obj-timer'].textContent = `${mm}:${ss}`;
        this.el['obj-timer'].classList.toggle('low', t < 30);
      } else {
        this.el['obj-timer'].textContent = '';
      }
    } else {
      this.el.objective.classList.remove('show');
    }
    const hp = clamp(p.health, 0, 100);
    this.el['health-fill'].style.width = hp + '%';
    this.el['health-fill'].style.background = hp > 45 ? '#58c24a' : hp > 22 ? '#e8b73a' : '#d8402e';
    this.el['health-text'].textContent = Math.ceil(hp) + '';
    if (p.inCar) {
      this.el.weapon.textContent = p.inCar.def.label;
      this.el.speed.classList.add('show');
      this.el.speed.textContent = Math.round(Math.abs(p.inCar.speed) * 0.36) + ' km/h';
    } else {
      this.el.weapon.textContent = `Kestrel 9mm · ${p.ammo} / ∞`;
      this.el.speed.classList.remove('show');
    }
    this.el.passenger.classList.toggle('show', !!S.passenger);
    if (S.bust > 0.01 && p.health > 0) {
      this.el.bust.classList.add('show');
      this.el['bust-fill'].style.width = clamp(S.bust, 0, 100) + '%';
    } else {
      this.el.bust.classList.remove('show');
    }
    this.drawMinimap(S);
  }

  drawMinimap(S) {
    const g = this.mapCtx;
    const W = this.map.width;
    const H = this.map.height;
    const sx = W / WORLD.width;
    const sy = H / WORLD.height;
    g.fillStyle = '#79a85b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2e8fa3';
    g.fillRect(WORLD.waterX * sx, 0, W - WORLD.waterX * sx, H);
    g.fillStyle = '#ecd9a0';
    g.fillRect(WORLD.beachX * sx, 0, (WORLD.waterX - WORLD.beachX) * sx, H);
    g.strokeStyle = 'rgba(240,238,228,0.85)';
    g.lineWidth = 2;
    for (const x of S.city.roadX) {
      g.beginPath();
      g.moveTo(x * sx, 0);
      g.lineTo(x * sx, H);
      g.stroke();
    }
    for (const y of S.city.roadY) {
      g.beginPath();
      g.moveTo(0, y * sy);
      g.lineTo(W, y * sy);
      g.stroke();
    }
    // Police first, so the player and the objective sit on top.
    const flash = Math.floor(S.time * 5) % 2 === 0;
    for (const car of S.cars) {
      if (car.driver !== 'police' || car.dead) continue;
      g.fillStyle = flash ? '#ff3b30' : '#3a7bff';
      g.fillRect(car.x * sx - 2.4, car.y * sy - 2.4, 4.8, 4.8);
    }
    for (const ped of S.peds) {
      if (ped.kind !== 'gang' || ped.state === 'gone' || ped.state === 'down') continue;
      g.fillStyle = '#ff3b30';
      g.fillRect(ped.x * sx - 2, ped.y * sy - 2, 4, 4);
    }
    const o = S.objective;
    if (o && o.x !== null && o.x !== undefined) {
      const pulse = 3 + Math.sin(S.time * 5) * 1.2;
      g.fillStyle = '#ffc430';
      g.beginPath();
      g.arc(o.x * sx, o.y * sy, pulse + 1.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a5200';
      g.beginPath();
      g.arc(o.x * sx, o.y * sy, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    // The player: a white arrow on foot, a white wedge in a car.
    const p = S.player;
    const px = (p.inCar ? p.inCar.x : p.x) * sx;
    const py = (p.inCar ? p.inCar.y : p.y) * sy;
    const ang = p.inCar ? p.inCar.angle : p.angle;
    g.save();
    g.translate(px, py);
    g.rotate(ang);
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(20,20,20,0.6)';
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-4.4, -4);
    g.lineTo(-4.4, 4);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 10px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText('N', W - 5, 12);
  }
}

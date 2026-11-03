// The overlay. Fixed 1600 x 900 (or 900 x 1600 on phones) CSS layout,
// scaled to the window. update() redraws it from one frame's state.
import {P, PV_KWP, OVERHANG, GLASS_H, rainCatch, roofAreas} from './house.js';
import {sunPos, dayLength, MID_N, GLASS_SAMPLES, PR} from './sun.js';
import {fmtHour, clamp} from './util.js';

const $ = id => document.getElementById(id);
const RAIN = rainCatch();
const CANTILEVER = P.bar.z[1] - 3.0;

export const CALLOUTS = {
  overhang: {a: [2.6, 7.0, P.bar.z[1]], d: [70, -170], t: `${OVERHANG.toFixed(1)} m overhang`, b: 'Keeps high sun off the glass'},
  celosia: {a: [P.bar.x[0], 5.6, 6.2], d: [-250, -150], t: 'Celosía', b: 'Brick lattice, half open, faces west'},
  pv: {a: [1.2, 7.9, P.pv.rowZ[0]], d: [90, -150], t: `PV, ${PV_KWP} kWp`, b: `${P.pv.cols * P.pv.rows} × ${P.pv.wattsEach} W, ${P.pv.tiltDeg}° tilt, facing south`},
  cantilever: {a: [4.2, 3.3, P.bar.z[1]], d: [70, 90], t: `${CANTILEVER.toFixed(1)} m cantilever`, b: 'The bar reaches past the wings'},
  jacaranda: {a: [P.tree.x, 5.4, P.tree.z], d: [190, 150], t: 'Jacaranda', b: 'Blooms Feb to Apr in this city'},
  bridge: {a: [1.3, 3.58, 0.95], d: [-200, 260], t: 'The bridge', b: `First floor, ${CANTILEVER.toFixed(1)} m past the wings`},
  cistern: {a: [P.cistern.x[1] > 0.6 ? 0.6 : P.cistern.x[1], -1.6, -2.5], d: [180, 110], t: `Cistern, ${RAIN.tankM3.toFixed(0)} m³`, b: 'Under the patio paving'},
  stair: {a: [-3.4, 2.0, -1.4], d: [-150, -200], t: 'Stair', b: `20 risers of ${((P.ufFloor - P.plinth) / 20 * 100).toFixed(0)} cm`},
  patio: {a: [0.6, 2.6, -2.0], d: [140, -230], t: 'Patio', b: 'Open to the sky, glass on three sides'},
  greenroof: {a: [-3.5, 4.1, -8.5], d: [-120, -130], t: 'Green roofs', b: `${roofAreas().green.toFixed(0)} m² planted`},
};

export function createConsole() {
  const stage = $('stage');
  const el = {time: $('time'), alt: $('alt'), az: $('az'), daylen: $('daylen'), glassPct: $('glassPct'), glassNote: $('glassNote'),
    kwNow: $('kwNow'), kwhDay: $('kwhDay'), rain: $('rain'), caption: $('caption'), hour: $('hour'), cursor: $('cursor'),
    leaders: $('leaders'), callouts: $('callouts'), hint: $('hint')};
  const polar = $('polar'), sect = $('sect'), pvc = $('pvChart');
  const buttons = [...stage.querySelectorAll('[data-press]')];
  let layout = {s: 1, ox: 0, oy: 0, port: false, W: 1600, H: 900};
  let colors = {};
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
    colors = {ink: g('--ink'), soft: g('--ink-soft'), muted: g('--ink-muted'), line: g('--line'), accent: g('--accent'), bg: g('--bg')};
  };
  readColors();

  el.rain.textContent = `${RAIN.hardM2.toFixed(0)} m² of hard roof feeds a ${RAIN.tankM3.toFixed(0)} m³ cistern. About ${Math.round(RAIN.m3PerYear / 5) * 5} m³ a year at ${80}% runoff.`;

  // HiDPI canvases.
  const hiDpi = (c, w, h) => { const r = Math.min(3, (window.devicePixelRatio || 1) * 1.5); c.width = w * r; c.height = h * r; const g = c.getContext('2d'); g.setTransform(r, 0, 0, r, 0, 0); return g; };
  let gPolar, gSect, gPv;
  function fitCanvases() {
    const port = layout.port;
    gPolar = hiDpi(polar, 300, 230);
    gSect = hiDpi(sect, port ? 362 : 340, port ? 168 : 200);
    gPv = hiDpi(pvc, 340, 104);
    last = {};
  }

  function setLayout(W, H) {
    const port = W / H < 0.8;
    const SW = port ? 900 : 1600, SH = port ? 1600 : 900;
    const s = Math.min(W / SW, H / SH);
    layout = {s, ox: (W - SW * s) / 2, oy: (H - SH * s) / 2, port, W: SW, H: SH};
    stage.classList.toggle('port', port); stage.classList.toggle('land', !port);
    stage.style.transform = `translate(${layout.ox}px, ${layout.oy}px) scale(${s})`;
    el.leaders.setAttribute('width', SW); el.leaders.setAttribute('height', SH);
    fitCanvases();
    return layout;
  }

  // ---------- Panels ----------
  let last = {};
  function drawPolar(st) {
    const g = gPolar, W = 300, H = 230, cx = 150, cy = 116, R = 98;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1; g.strokeStyle = colors.line; g.fillStyle = colors.muted; g.font = '500 12px "IBM Plex Mono", monospace';
    for (const a of [0, 30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - a) / 90, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', cx, cy - R - 9); g.fillText('S', cx, cy + R + 9); g.fillText('E', cx + R + 10, cy); g.fillText('W', cx - R - 11, cy);
    g.textAlign = 'left'; g.fillText('30°', cx + 3, cy - R * 60 / 90 + 8); g.fillText('60°', cx + 3, cy - R * 30 / 90 + 8);
    // House plan, north up: the bar's south glass line drawn heavier.
    const k = R * 0.022;
    g.strokeStyle = colors.soft; g.lineWidth = 1;
    g.strokeRect(cx - 6.2 * k, cy - 11.4 * k, 12.4 * k, 20.5 * k);
    g.strokeStyle = colors.ink; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(cx - 5.8 * k, cy + P.glassZ * k); g.lineTo(cx + 5.8 * k, cy + P.glassZ * k); g.stroke();
    // Day path.
    const xy = (alt, az) => { const r = R * (90 - alt) / 90, a = az * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
    g.strokeStyle = colors.ink; g.lineWidth = 1.25; g.beginPath();
    let pen = false;
    for (let h = 5; h <= 19.001; h += 0.1) {
      const p = sunPos(st.date.day, h); if (p.alt < 0) { pen = false; continue; }
      const [x, y] = xy(p.alt, p.az); if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
    }
    g.stroke();
    if (st.r.alt > 0) {
      const [x, y] = xy(st.r.alt, st.r.az);
      g.strokeStyle = colors.accent; g.lineWidth = 1.25; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
      g.fillStyle = colors.accent; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill();
    }
  }

  function drawSection(st) {
    const port = layout.port, W = port ? 362 : 340, H = port ? 168 : 200, g = gSect;
    g.clearRect(0, 0, W, H);
    // z from 6.2 (inside) to 10.6 (outside, south): sun comes from the right.
    const z0 = 6.0, y0 = 3.25, sc = Math.min((W - 20) / 4.6, (H - 14) / 4.4);
    const X = z => 10 + (z - z0) * sc, Y = y => H - 8 - (y - y0) * sc;
    const rect = (za, zb, ya, yb, fill) => { g.fillStyle = fill; g.fillRect(X(za), Y(yb), (zb - za) * sc, (yb - ya) * sc); };
    const cut = colors.ink;
    rect(z0, P.bar.z[1], P.gfTop, P.ufFloor, cut);           // floor slab
    rect(P.bar.z[1] - 0.35, P.bar.z[1], 3.2, P.gfTop, cut);   // downstand
    rect(z0, P.bar.z[1], P.ufCeil, P.roofTop, cut);          // roof slab
    rect(P.bar.z[1] - 0.25, P.bar.z[1], P.roofTop, P.roofTop + 0.25, cut);
    rect(8.6, P.bar.z[1], P.ufFloor, 4.45, cut);             // trough
    g.fillStyle = colors.soft; for (let z = 8.7; z < 9.05; z += 0.12) { g.beginPath(); g.arc(X(z), Y(4.5), 3, 0, 7); g.fill(); }
    // Glass: thin line, lit cells thick in accent (same ray cast as the %).
    g.strokeStyle = colors.muted; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(P.glassZ), Y(P.glass.y[0])); g.lineTo(X(P.glassZ), Y(P.glass.y[1])); g.stroke();
    const col = st.mid, dy = GLASS_H / MID_N;
    g.strokeStyle = colors.accent; g.lineWidth = 6; g.lineCap = 'butt';
    for (let j = 0; j < MID_N; j++) if (col[j]) { g.beginPath(); g.moveTo(X(P.glassZ), Y(P.glass.y[0] + j * dy)); g.lineTo(X(P.glassZ), Y(P.glass.y[0] + (j + 1) * dy)); g.stroke(); }
    // Sun ray through the overhang edge at the profile angle.
    g.font = '500 12px "IBM Plex Mono", monospace'; g.textBaseline = 'alphabetic';
    if (st.r.alt > 0 && st.r.profile != null) {
      const a = st.r.profile * Math.PI / 180, ez = P.bar.z[1], ey = P.ufCeil;
      const toGlass = ez - P.glassZ, yHit = ey - toGlass * Math.tan(a);
      g.strokeStyle = colors.accent; g.lineWidth = 1.25; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(X(ez + 3), Y(ey + 3 * Math.tan(a))); g.lineTo(X(ez), Y(ey));
      g.lineTo(X(P.glassZ), Y(Math.max(yHit, P.glass.y[0] - 0.4))); g.stroke(); g.setLineDash([]);
      g.fillStyle = colors.soft; g.textAlign = 'right';
      g.fillText(`profile ${st.r.profile.toFixed(0)}°`, W - 6, 14);
    } else {
      g.fillStyle = colors.soft; g.textAlign = 'right';
      g.fillText(st.r.alt > 0 ? 'sun north of the facade' : 'sun down', W - 6, 14);
    }
    g.textAlign = 'left'; g.fillStyle = colors.muted;
    g.fillText('in', X(6.1), Y(P.glass.y[0]) - 8); g.fillText('out', X(9.5), Y(P.glass.y[0]) - 8);
  }

  function drawPv(st, table) {
    const g = gPv, W = 340, H = 104, L = 26, B = 18, top = 6;
    g.clearRect(0, 0, W, H);
    const kmax = 5, X = h => L + (h - 5) / 14 * (W - L - 4), Y = k => H - B - k / kmax * (H - B - top);
    g.strokeStyle = colors.line; g.lineWidth = 1; g.fillStyle = colors.muted; g.font = '500 11px "IBM Plex Mono", monospace';
    for (const k of [0, 2.5, 5]) { g.beginPath(); g.moveTo(L, Y(k)); g.lineTo(W - 4, Y(k)); g.stroke(); g.textAlign = 'right'; g.fillText(k === 0 ? '0' : k.toString(), L - 5, Y(k) + 4); }
    g.textAlign = 'center';
    for (const h of [6, 9, 12, 15, 18]) g.fillText(String(h).padStart(2, '0'), X(h), H - 4);
    g.strokeStyle = colors.ink; g.lineWidth = 1.5; g.beginPath();
    table.hs.forEach((h, i) => { const x = X(h), y = Y(table.kw[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    const x = X(clamp(st.hour, 5, 19));
    g.strokeStyle = colors.accent; g.lineWidth = 1.25; g.beginPath(); g.moveTo(x, top); g.lineTo(x, H - B); g.stroke();
    g.fillStyle = colors.accent; g.beginPath(); g.arc(x, Y(st.r.pv.kw), 4.5, 0, 7); g.fill();
    g.fillStyle = colors.muted; g.textAlign = 'left'; g.fillText('kW', L + 4, top + 9);
  }

  function update(st, table) {
    const key = `${st.date.id}|${st.hour.toFixed(3)}|${layout.port}`;
    if (key !== last.key) {
      last.key = key;
      const r = st.r;
      el.time.textContent = fmtHour(st.hour);
      el.alt.textContent = `${r.alt.toFixed(1)}°`;
      el.az.textContent = `${r.az.toFixed(0)}° ${compass(r.az)}`;
      const dl = dayLength(st.date.day);
      el.daylen.textContent = `${Math.floor(dl.hours)} h ${String(Math.round((dl.hours % 1) * 60)).padStart(2, '0')} min`;
      el.glassPct.textContent = `${Math.round(r.glass * 100)}%`;
      el.glassNote.textContent = `${table.glassHours.toFixed(1)} h of sun on this glass on ${st.date.label}. Ray-cast over ${GLASS_SAMPLES.length} points.`;
      el.kwNow.textContent = `${r.pv.kw.toFixed(1)} kW`;
      el.kwhDay.textContent = `${table.kwh.toFixed(0)} kWh/day`;
      if (document.activeElement !== el.hour) el.hour.value = st.hour;
      drawPolar(st); drawSection(st); drawPv(st, table);
    }
    for (const b of buttons) {
      const [kind, id] = b.dataset.press.split(':');
      const on = (kind === 'date' && id === st.date.id) || (kind === 'view' && id === st.view) || (kind === 'mode' && id === st.mode);
      b.classList.toggle('on', on);
      b.classList.toggle('press', st.pressing === b.dataset.press);
      if (kind === 'play') b.classList.toggle('playing', !!st.playing);
    }
    // Caption
    const cap = st.captionText || '';
    if (cap !== last.cap) { last.cap = cap; el.caption.firstElementChild.textContent = cap; el.caption.classList.toggle('empty', !cap); }
    el.caption.style.opacity = cap ? st.captionK : 0;
    el.caption.style.transform = `translateY(${(1 - st.captionK) * 10}px)`;
    el.hint.style.opacity = st.touring ? 0 : 1;
  }

  // ---------- Callouts ----------
  const pool = {};
  function callouts(list, k, project) {
    const ids = new Set(list || []);
    let svg = '';
    for (const id of Object.keys(CALLOUTS)) {
      let node = pool[id];
      if (!ids.has(id) || k <= 0) { if (node) node.style.display = 'none'; continue; }
      const c = CALLOUTS[id];
      if (!node) {
        node = document.createElement('div'); node.className = 'callout';
        node.innerHTML = `<div class="bgbox"><b>${c.t}</b><span>${c.b}</span></div>`;
        el.callouts.appendChild(node); pool[id] = node;
        node._w = 0;
      }
      node.style.display = 'block';
      const p = project(c.a);
      if (p.behind) { node.style.display = 'none'; continue; }
      const ax = (p.x - layout.ox) / layout.s, ay = (p.y - layout.oy) / layout.s;
      if (!node._w) { node._w = node.offsetWidth; node._h = node.offsetHeight; }
      let lx = ax + c.d[0] * (layout.port ? 0.6 : 1), ly = ay + c.d[1] * (layout.port ? 0.6 : 1);
      const xmin = layout.port ? 24 : 440, xmax = layout.port ? 876 : 1124, ymin = layout.port ? 190 : 150, ymax = layout.port ? 830 : 690;
      if (c.d[0] < 0) lx -= node._w;
      lx = clamp(lx, xmin, xmax - node._w); ly = clamp(ly, ymin, ymax - node._h);
      node.style.transform = `translate(${lx}px, ${ly}px)`;
      node.style.opacity = k;
      const ex = clamp(ax, lx, lx + node._w), ey = ay < ly ? ly : ay > ly + node._h ? ly + node._h : ly + node._h / 2;
      const jx = ax < lx ? lx : ax > lx + node._w ? lx + node._w : ex;
      svg += `<line x1="${ax}" y1="${ay}" x2="${jx}" y2="${ey}" opacity="${k}"/><circle cx="${ax}" cy="${ay}" r="4.5" opacity="${k}"/>`;
    }
    el.leaders.innerHTML = svg;
  }

  // ---------- Tour cursor ----------
  const centre = press => {
    const b = buttons.find(x => x.dataset.press === press);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return [(r.left + r.width / 2 - layout.ox) / layout.s, (r.top + r.height / 2 - layout.oy) / layout.s];
  };
  function cursor(cur, visible) {
    el.cursor.classList.toggle('on', !!visible);
    if (!visible || !cur) return;
    const rest = layout.port ? [700, 1380] : [1000, 760];
    const a = (cur.from && centre(cur.from)) || rest, b = (cur.to && centre(cur.to)) || rest;
    // Slight arc so it reads as a hand, not a tween.
    const k = cur.k, x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k - Math.sin(Math.PI * k) * 40;
    el.cursor.style.transform = `translate(${x - 6}px, ${y - 3}px)`;
    const ring = el.cursor.lastElementChild;
    ring.style.opacity = cur.click; ring.style.transform = `scale(${1.6 - cur.click * 0.8})`;
  }

  return {setLayout, update, callouts, cursor, readColors, layout: () => layout, buttons};
}

function compass(az) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
}

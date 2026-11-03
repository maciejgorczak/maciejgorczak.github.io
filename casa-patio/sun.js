// The sun, and what it does to this house. One input: (date, solar hour).
// Everything here is plain math on the boxes in house.js. No three.js.

import {SITE, P, BOXES, PV_KWP} from './house.js';
import {DEG, clamp} from './util.js';

export const DATES = [
  {id: 'mar', label: 'Mar 20', day: 79, note: 'Equinox. Jacarandas in bloom.'},
  {id: 'jun', label: 'Jun 21', day: 172, note: 'Solstice. Noon sun north of overhead.'},
  {id: 'dec', label: 'Dec 21', day: 355, note: 'Solstice. Lowest sun of the year.'},
];
export const dateById = id => DATES.find(d => d.id === id) || DATES[0];

// Solar declination (Cooper 1969), degrees.
export const declination = day => 23.44 * Math.sin(DEG * 360 / 365 * (284 + day));

// Sun position for solar time h (hours). Azimuth from north, clockwise.
export function sunPos(day, h) {
  const phi = SITE.lat * DEG, dec = declination(day) * DEG, H = 15 * (h - 12) * DEG;
  const sinA = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(clamp(sinA, -1, 1));
  const azS = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  let az = azS / DEG + 180; az = ((az % 360) + 360) % 360;
  const altD = alt / DEG;
  // Unit vector toward the sun in scene axes (x east, y up, z south).
  const ca = Math.cos(alt), azr = az * DEG;
  const dir = [Math.sin(azr) * ca, Math.sin(alt), -Math.cos(azr) * ca];
  return {alt: altD, az, dir};
}

export function dayLength(day) {
  const phi = SITE.lat * DEG, dec = declination(day) * DEG;
  const H0 = Math.acos(clamp(-Math.tan(phi) * Math.tan(dec), -1, 1)) / DEG;
  return {rise: 12 - H0 / 15, set: 12 + H0 / 15, hours: 2 * H0 / 15};
}

// Clear-sky direct normal irradiance, W/m2: Meinel model with the Laue
// altitude correction, Kasten-Young air mass. No haze, no clouds.
export function clearSky(altDeg) {
  if (altDeg <= 0.5) return {dni: 0, dhi: 0};
  const z = 90 - altDeg;
  const am = 1 / (Math.cos(z * DEG) + 0.50572 * Math.pow(Math.max(96.07995 - z, 1e-3), -1.6364));
  const a = 0.14 * SITE.elevKm;
  const dni = 1353 * ((1 - a) * Math.pow(0.7, Math.pow(am, 0.678)) + a);
  return {dni, dhi: 0.1 * dni};   // diffuse as 10% of direct (Meinel rule of thumb)
}

// ---------- Ray casting against the house ----------

const RAY = [];
let CEL = null;            // the brick lattice as one cluster with a bounding box
{
  const bricks = [];
  for (const b of BOXES) {
    if (!b.ray) continue;
    if (b.group === 'celosia') { bricks.push(b); continue; }
    RAY.push(b);
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const b of bricks) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  CEL = {min, max, items: bricks};
}

function hitAabb(o, d, min, max) {
  let t0 = 1e-4, t1 = 1e9;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) { if (o[i] < min[i] || o[i] > max[i]) return false; continue; }
    const inv = 1 / d[i];
    let a = (min[i] - o[i]) * inv, b = (max[i] - o[i]) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

// Boxes rotated about the x axis through their centre (the PV panels).
function hitBox(o, d, b) {
  if (!b.tilt) return hitAabb(o, d, b.min, b.max);
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const cs = Math.cos(-b.tilt), sn = Math.sin(-b.tilt);
  const oy = o[1] - c[1], oz = o[2] - c[2];
  const lo = [o[0] - c[0], oy * cs - oz * sn, oy * sn + oz * cs];
  const ld = [d[0], d[1] * cs - d[2] * sn, d[1] * sn + d[2] * cs];
  const h = [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2];
  return hitAabb(lo, ld, [-h[0], -h[1], -h[2]], h);
}

export function blocked(o, d, skip) {
  for (const b of RAY) if (b !== skip && hitBox(o, d, b)) return true;
  if (hitAabb(o, d, CEL.min, CEL.max)) for (const b of CEL.items) if (hitAabb(o, d, b.min, b.max)) return true;
  return false;
}

// ---------- South glazing: share of the pane in direct sun ----------

export const GX = 36, GY = 14;
export const GLASS_SAMPLES = [];
for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
  GLASS_SAMPLES.push([P.glass.x[0] + (i + 0.5) / GX * (P.glass.x[1] - P.glass.x[0]),
                      P.glass.y[0] + (j + 0.5) / GY * (P.glass.y[1] - P.glass.y[0]),
                      P.glassZ + 0.03]);
}

export function glassCells(dir) {
  const cells = new Uint8Array(GLASS_SAMPLES.length);
  if (dir[1] <= 0 || dir[2] <= 0.0005) return {cells, frac: 0};   // sun down, or north of the facade
  let lit = 0;
  GLASS_SAMPLES.forEach((s, i) => { if (!blocked(s, dir)) { cells[i] = 1; lit++; } });
  return {cells, frac: lit / GLASS_SAMPLES.length};
}
export const glassSun = dir => glassCells(dir).frac;

// One vertical line through the middle of the pane, for the section diagram.
// Returns lit flags bottom to top, from the same ray cast.
export const MID_N = 48;
export function glassMidColumn(dir, x = -3.0) {
  const out = new Array(MID_N).fill(false);
  if (dir[1] <= 0 || dir[2] <= 0.0005) return out;
  for (let j = 0; j < MID_N; j++) {
    const y = P.glass.y[0] + (j + 0.5) / MID_N * (P.glass.y[1] - P.glass.y[0]);
    out[j] = !blocked([x, y, P.glassZ + 0.03], dir);
  }
  return out;
}

// Profile (vertical shadow) angle on the south facade, degrees.
export function profileAngle(alt, az) {
  const g = (az - 180) * DEG;
  if (Math.cos(g) <= 0) return null;
  return Math.atan(Math.tan(alt * DEG) / Math.cos(g)) / DEG;
}

// ---------- PV array ----------

const PANELS = BOXES.filter(b => b.group === 'pv');
const PV_SAMPLES = [];
for (const b of PANELS) {
  const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const hx = (b.max[0] - b.min[0]) / 2, hz = (b.max[2] - b.min[2]) / 2, top = (b.max[1] - b.min[1]) / 2 + 0.004;
  const cs = Math.cos(b.tilt), sn = Math.sin(b.tilt);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) {
    const lx = -hx + (i + 0.5) / 4 * 2 * hx, lz = -hz + (k + 0.5) / 6 * 2 * hz;
    PV_SAMPLES.push({p: [c[0] + lx, c[1] + top * cs - lz * sn, c[2] + top * sn + lz * cs], panel: b});
  }
}
const PV_TILT = P.pv.tiltDeg * DEG;
const PV_N = [0, Math.cos(PV_TILT), Math.sin(PV_TILT)];   // facing south
export const PR = 0.8;   // performance ratio: inverter, heat, wiring, soiling

export function pv(dir, alt) {
  const {dni, dhi} = clearSky(alt);
  if (dni <= 0) return {kw: 0, poa: 0, shaded: 0, dni: 0};
  const cosI = Math.max(0, dir[0] * PV_N[0] + dir[1] * PV_N[1] + dir[2] * PV_N[2]);
  let lit = 0;
  if (cosI > 0) for (const s of PV_SAMPLES) if (!blocked(s.p, dir, s.panel)) lit++;
  const f = cosI > 0 ? lit / PV_SAMPLES.length : 0;
  const poa = dni * cosI * f + dhi * (1 + Math.cos(PV_TILT)) / 2;
  return {kw: PV_KWP * poa / 1000 * PR, poa, shaded: cosI > 0 ? 1 - f : 0, dni};
}

// ---------- The whole state for one moment ----------

export function readings(day, h) {
  const s = sunPos(day, h);
  const g = glassCells(s.dir);
  const p = pv(s.dir, s.alt);
  return {...s, glass: g.frac, cells: g.cells, pv: p, profile: profileAngle(s.alt, s.az)};
}

// Day tables, integrated once per date at load (6 minute steps).
const TABLES = new Map();
export function dayTable(day) {
  if (TABLES.has(day)) return TABLES.get(day);
  const step = 0.1, hs = [], kw = [], glass = [];
  let kwh = 0, glassHours = 0;
  for (let h = 5; h <= 19.0001; h += step) {
    const r = readings(day, h);
    hs.push(h); kw.push(r.pv.kw); glass.push(r.glass);
    kwh += r.pv.kw * step; glassHours += r.glass * step;
  }
  const t = {hs, kw, glass, kwh, glassHours, peak: Math.max(...kw)};
  TABLES.set(day, t);
  return t;
}

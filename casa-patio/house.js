// The building as data. No three.js in here.
// Units: metres. Axes: x = east, y = up, z = south (north is -z).
// Every surface the sun can be blocked by is a box in BOXES. The geometry
// module draws these boxes, and shade.js ray-casts against the same list,
// so the shadow on screen and the numbers in the panels come from one source.

import {rng} from './util.js';

export const SITE = {
  place: 'Mexico City',
  lat: 19.43,          // deg N
  elevKm: 2.24,        // valley floor, km above sea level
  rainMm: 670,         // mm/yr, citywide 1970-2000 normal (WorldClim 2.1 grid)
};

// Parameter block. Change a number here and the building, the shadows,
// the shading %, the PV yield and the rain catch all follow.
export const P = {
  lot: {x: [-7, 7], z: [-14, 14]},
  plinth: 0.3,       // finished ground floor level
  gfTop: 3.6,        // underside of first floor slab
  ufFloor: 3.9,      // first floor level
  ufCeil: 6.8,       // underside of roof slab
  roofTop: 7.2,      // top of roof slab (0.4 m, brutal on purpose)
  wall: 0.3,
  bar: {x: [-6.2, 6.2], z: [0.8, 9.1]},   // the bridge: first floor bar over the patio
  glassZ: 7.5,       // south glazing line, recessed behind the frame
  glass: {x: [-5.8, 5.8], y: [3.9, 6.8]},
  patio: {x: [-2.5, 2.5], z: [-4.8, 0.8]},
  pv: {cols: 6, rows: 2, w: 1.134, l: 1.722, t: 0.035, tiltDeg: 19.4, wattsEach: 400,
       rowZ: [3.4, 6.5], gap: 0.03, rack: 0.38},
  cistern: {x: [-1.8, 1.8], z: [-4.2, -0.8], y: [-2.3, -0.3]},   // inside faces
  tree: {x: 0.2, z: -1.6, top: 6.9},   // jacaranda, kept below the PV so it never shades it
  pond: {x: [-5.2, 0.6], z: [9.8, 12.8]},
  balconyPlant: {top: 4.6},
};

export const OVERHANG = P.bar.z[1] - P.glassZ;   // 1.6 m
export const GLASS_H = P.glass.y[1] - P.glass.y[0]; // 2.9 m

// box(name, [x0,x1], [y0,y1], [z0,z1], mat, flags)
function box(id, x, y, z, mat, f = {}) {
  return {id, min: [x[0], y[0], z[0]], max: [x[1], y[1], z[1]], mat,
          cast: f.cast ?? true, ray: f.ray ?? true, tilt: f.tilt ?? 0,
          roof: f.roof ?? 0, group: f.group ?? 'house', clip: f.clip ?? true};
}

export function buildBoxes() {
  const B = [];
  const {plinth: pl, gfTop, ufFloor, ufCeil, roofTop} = P;
  const W = P.wall;

  // Volcanic stone plinth under the whole house footprint.
  B.push(box('plinth', [-6.4, 6.4], [0, pl], [-11.4, 3.2], 'recinto', {ray: false}));

  // --- Back bar (street side, one storey) ---
  B.push(box('north wall', [-6.2, 6.2], [pl, gfTop], [-11.2, -11.2 + W], 'concrete'));
  B.push(box('back west wall', [-6.2, -6.2 + W], [pl, gfTop], [-11.2, -4.8], 'concrete'));
  B.push(box('back east wall', [6.2 - W, 6.2], [pl, gfTop], [-11.2, -4.8], 'concrete'));
  B.push(box('back roof', [-6.4, 6.4], [gfTop, ufFloor], [-11.4, -4.8], 'concrete', {roof: 'green'}));
  B.push(box('back parapet', [-6.4, 6.4], [ufFloor, ufFloor + 0.55], [-11.4, -11.1], 'concrete'));
  B.push(box('patio planter N', [-2.5, 2.5], [ufFloor, ufFloor + 0.5], [-5.1, -4.8], 'concrete'));

  // --- West wing (ground floor) + stair lantern above it ---
  B.push(box('west wall', [-6.2, -6.2 + W], [pl, gfTop], [-4.8, 3.0], 'concrete'));
  B.push(box('west wing S', [-6.2, -2.5], [pl, gfTop], [3.0 - W, 3.0], 'concrete'));
  B.push(box('west roof', [-6.4, -2.5], [gfTop, ufFloor], [-4.8, -3.6], 'concrete', {roof: 'green'}));
  // Hole in the slab over the stair: slab pieces either side.
  B.push(box('west roof W', [-6.4, -4.1], [gfTop, ufFloor], [-3.6, 0.8], 'concrete'));
  B.push(box('west roof E', [-2.8, -2.5], [gfTop, ufFloor], [-3.6, 0.8], 'concrete'));
  B.push(box('lantern W', [-6.2, -6.2 + W], [ufFloor, ufCeil], [-3.6, 0.8], 'concrete'));
  B.push(box('lantern N', [-6.2, -2.5], [ufFloor, ufCeil], [-3.6, -3.6 + W], 'concrete'));
  B.push(box('lantern E low', [-2.5 - W, -2.5], [ufFloor, 5.0], [-3.6, 0.8], 'concrete'));
  B.push(box('lantern roof', [-6.4, -2.5], [ufCeil, roofTop], [-3.8, 0.8], 'concrete', {roof: 'hard'}));

  // --- East wing (ground floor) + roof garden ---
  B.push(box('east wall', [6.2 - W, 6.2], [pl, gfTop], [-4.8, 3.0], 'concrete'));
  B.push(box('east wing S', [2.5, 6.2], [pl, gfTop], [3.0 - W, 3.0], 'concrete'));
  B.push(box('east roof', [2.5, 6.4], [gfTop, ufFloor], [-4.8, 0.8], 'concrete', {roof: 'green'}));
  B.push(box('patio planter E', [2.5, 2.8], [ufFloor, ufFloor + 0.5], [-4.8, 0.8], 'concrete'));

  // --- The bridge: first floor bar, cantilevered 6 m past the wings ---
  const [bx0, bx1] = P.bar.x, [bz0, bz1] = P.bar.z;
  B.push(box('bar floor', [bx0, bx1], [gfTop, ufFloor], [bz0, bz1], 'concrete'));
  B.push(box('bar roof', [bx0, bx1], [ufCeil, roofTop], [bz0, bz1], 'concrete', {roof: 'hard'}));
  B.push(box('east fin', [bx1 - 0.4, bx1], [ufFloor, ufCeil], [bz0, bz1], 'concrete'));
  B.push(box('bar north low', [-2.5, bx1 - 0.4], [ufFloor, 5.2], [bz0, bz0 + W], 'concrete'));
  B.push(box('roof upstand S', [bx0, bx1], [roofTop, roofTop + 0.25], [bz1 - 0.25, bz1], 'concrete'));
  B.push(box('roof upstand N', [-2.5, bx1], [roofTop, roofTop + 0.25], [bz0, bz0 + 0.25], 'concrete'));
  B.push(box('lantern upstand N', [-6.4, -2.5], [roofTop, roofTop + 0.25], [-3.8, -3.55], 'concrete'));
  B.push(box('roof upstand E', [bx1 - 0.25, bx1], [roofTop, roofTop + 0.25], [bz0, bz1], 'concrete'));
  B.push(box('roof upstand W', [-6.4, -6.15], [roofTop, roofTop + 0.25], [-3.8, bz1], 'concrete'));
  B.push(box('balcony trough', [-5.8, bx1 - 0.4], [ufFloor, 4.45], [8.6, bz1], 'concrete'));
  // Planting in the trough, as the box the shadow sees.
  B.push(box('balcony planting', [-5.75, bx1 - 0.45], [4.45, P.balconyPlant.top], [8.65, bz1 - 0.05], 'plant', {cast: false}));
  // Rain spout (gargola) off the bar roof into the pond.
  B.push(box('gargola', [-3.15, -2.75], [6.9, 7.12], [bz1, 10.4], 'concrete'));

  // Soffit beam under the cantilever, stiffening the bar (downstand).
  B.push(box('cantilever beam', [bx0, bx1], [3.2, gfTop], [bz1 - 0.35, bz1], 'concrete'));

  // --- Glazing (drawn, not ray-cast: the south pane is the target itself) ---
  const g = {ray: false, cast: false};
  B.push(box('south glass', P.glass.x, P.glass.y, [P.glassZ - 0.02, P.glassZ + 0.02], 'glass', g));
  B.push(box('clerestory N', [-2.5, bx1 - 0.4], [5.2, ufCeil], [bz0 + 0.12, bz0 + 0.16], 'glass', g));
  B.push(box('lantern glass E', [-2.68, -2.64], [5.0, ufCeil], [-3.3, bz0], 'glass', g));
  B.push(box('patio glass N', [-2.5, 2.5], [pl, gfTop], [-4.82, -4.78], 'glass', g));
  B.push(box('patio glass W', [-2.52, -2.48], [pl, gfTop], [-4.8, 3.0], 'glass', g));
  B.push(box('patio glass E', [2.48, 2.52], [pl, gfTop], [-4.8, 3.0], 'glass', g));
  for (let k = 0; k <= 6; k++) {
    const x = P.glass.x[0] + k * (P.glass.x[1] - P.glass.x[0]) / 6;
    B.push(box(`mullion ${k}`, [x - 0.03, x + 0.03], P.glass.y, [P.glassZ - 0.05, P.glassZ + 0.03], 'steel', {ray: false}));
  }

  // --- Interior (shown in section and x-ray) ---
  B.push(box('gf slab', [-6.0, 6.0], [0.2, pl], [-11.0, 3.0], 'floor', {ray: false}));
  B.push(box('uf partition', [-2.1, -1.95], [ufFloor, ufCeil], [2.2, P.glassZ], 'plaster', {ray: false}));
  B.push(box('uf wardrobe', [-1.95, -1.35], [ufFloor, 6.2], [1.15, 2.2], 'wood', {ray: false}));
  B.push(box('bed', [-1.75, 0.35], [ufFloor, 4.35], [4.2, 6.3], 'linen', {ray: false}));
  B.push(box('bed head', [-1.85, 0.45], [ufFloor, 4.9], [3.95, 4.2], 'wood', {ray: false}));
  B.push(box('kitchen island', [-1.6, 1.6], [pl, 1.22], [-8.6, -7.6], 'concrete', {ray: false}));
  B.push(box('kitchen wall', [-5.9, 5.9], [pl, 2.4], [-10.9, -10.3], 'wood', {ray: false}));
  B.push(box('dining table', [-1.4, 1.4], [pl, 1.05], [-6.9, -5.9], 'wood', {ray: false}));
  B.push(box('sofa', [3.2, 5.6], [pl, 0.75], [-2.0, -1.1], 'linen', {ray: false}));
  B.push(box('studio desk', [-5.7, -4.3], [pl, 1.05], [-1.5, 1.5], 'wood', {ray: false}));

  // Stair in the west wing: 20 risers of 0.18 m, goings of 0.27 m.
  const risers = 20, rise = (ufFloor - pl) / risers, going = 0.27;
  const sz0 = -4.6;
  for (let i = 0; i < risers; i++) {
    const y1 = pl + rise * (i + 1);
    B.push(box(`step ${i + 1}`, [-4.05, -2.85], [y1 - 0.12, y1], [sz0 + going * i, sz0 + going * (i + 1)], 'concrete', {ray: false}));
  }

  // Cistern under the patio (concrete shell around P.cistern).
  const c = P.cistern, ct = 0.25;
  B.push(box('cistern floor', [c.x[0] - ct, c.x[1] + ct], [c.y[0] - ct, c.y[0]], [c.z[0] - ct, c.z[1] + ct], 'concrete', {ray: false, group: 'below'}));
  B.push(box('cistern W', [c.x[0] - ct, c.x[0]], [c.y[0], c.y[1]], [c.z[0] - ct, c.z[1] + ct], 'concrete', {ray: false, group: 'below'}));
  B.push(box('cistern E', [c.x[1], c.x[1] + ct], [c.y[0], c.y[1]], [c.z[0] - ct, c.z[1] + ct], 'concrete', {ray: false, group: 'below'}));
  B.push(box('cistern N', [c.x[0], c.x[1]], [c.y[0], c.y[1]], [c.z[0] - ct, c.z[0]], 'concrete', {ray: false, group: 'below'}));
  B.push(box('cistern S', [c.x[0], c.x[1]], [c.y[0], c.y[1]], [c.z[1], c.z[1] + ct], 'concrete', {ray: false, group: 'below'}));
  B.push(box('cistern lid', [c.x[0] - ct, c.x[1] + ct], [c.y[1], 0.05], [c.z[0] - ct, c.z[1] + ct], 'concrete', {ray: false, group: 'below'}));

  // --- Garden ---
  B.push(box('patio paving', [-2.5, 2.5], [0.05, 0.22], [-4.8, 0.8], 'recinto', {ray: false, clip: true}));
  B.push(box('terrace', [-6.4, 6.4], [0, 0.22], [3.2, 5.0], 'recinto', {ray: false}));
  const pd = P.pond;
  B.push(box('pond rim N', [pd.x[0] - 0.3, pd.x[1] + 0.3], [0, 0.32], [pd.z[0] - 0.3, pd.z[0]], 'recinto', {ray: false}));
  B.push(box('pond rim S', [pd.x[0] - 0.3, pd.x[1] + 0.3], [0, 0.32], [pd.z[1], pd.z[1] + 0.3], 'recinto', {ray: false}));
  B.push(box('pond rim W', [pd.x[0] - 0.3, pd.x[0]], [0, 0.32], [pd.z[0], pd.z[1]], 'recinto', {ray: false}));
  B.push(box('pond rim E', [pd.x[1], pd.x[1] + 0.3], [0, 0.32], [pd.z[0], pd.z[1]], 'recinto', {ray: false}));
  B.push(box('east boundary', [6.75, 7.0], [0, 2.4], [-11.4, 14], 'recinto', {ray: false, clip: false}));
  B.push(box('west boundary', [-7.0, -6.75], [0, 2.4], [-11.4, 14], 'recinto', {ray: false, clip: false}));
  B.push(box('south boundary W', [-7.0, 1.2], [0, 1.1], [13.75, 14], 'recinto', {ray: false, clip: false}));
  B.push(box('south boundary E', [3.0, 7.0], [0, 1.1], [13.75, 14], 'recinto', {ray: false, clip: false}));

  // --- PV array on the bar roof ---
  const pv = P.pv, tilt = pv.tiltDeg * Math.PI / 180;
  const half = (pv.l / 2) * Math.sin(tilt);
  const cy = roofTop + pv.rack + half;
  const span = pv.cols * pv.w + (pv.cols - 1) * pv.gap;
  for (let r = 0; r < pv.rows; r++) for (let k = 0; k < pv.cols; k++) {
    const x0 = -span / 2 + k * (pv.w + pv.gap);
    const zc = pv.rowZ[r];
    B.push(box(`pv ${r}-${k}`, [x0, x0 + pv.w], [cy - pv.t / 2, cy + pv.t / 2], [zc - pv.l / 2, zc + pv.l / 2], 'pv', {tilt, group: 'pv'}));
  }

  // --- Celosia: west end of the bar, a brick lattice against the west sun ---
  // Red-fired brick 0.28 x 0.07 x 0.14, stack-bonded with 0.14 gaps (half-open).
  const L = {x: [bx0, bx0 + 0.14], y: [ufFloor, ufCeil], z: [bz0 + 0.3, bz1], bl: 0.28, bh: 0.07, gap: 0.14};
  const rows = Math.floor((L.y[1] - L.y[0]) / (L.bh * 2));
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const y0 = L.y[0] + r * L.bh * 2 + L.bh * 0.5;
    const offset = (r % 2) * (L.bl + L.gap) / 2;
    for (let z = L.z[0] - offset; z < L.z[1]; z += L.bl + L.gap) {
      const z0 = Math.max(z, L.z[0]), z1 = Math.min(z + L.bl, L.z[1]);
      if (z1 - z0 < 0.05) continue;
      B.push(box(`brick ${n++}`, L.x, [y0, y0 + L.bh], [z0, z1], 'brick', {group: 'celosia'}));
    }
  }
  // Lattice frame: top and bottom courses solid.
  B.push(box('celosia sill', [bx0, bx0 + 0.3], [ufFloor, ufFloor + 0.04], [bz0 + 0.3, bz1], 'concrete'));

  return B;
}

export const BOXES = buildBoxes();

// --- Derived numbers, all read off the boxes above ---
export function roofAreas(boxes = BOXES) {
  let hard = 0, green = 0;
  for (const b of boxes) {
    const a = (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]);
    if (b.roof === 'hard') hard += a;
    if (b.roof === 'green') green += a;
  }
  return {hard, green};
}

export const RUNOFF_HARD = 0.8;   // fraction of rain reaching the tank from a hard roof
export function rainCatch() {
  const {hard, green} = roofAreas();
  const m3 = hard * SITE.rainMm / 1000 * RUNOFF_HARD;
  const c = P.cistern;
  const tank = (c.x[1] - c.x[0]) * (c.y[1] - c.y[0]) * (c.z[1] - c.z[0]);
  return {hardM2: hard, greenM2: green, m3PerYear: m3, tankM3: tank};
}

export const PV_KWP = P.pv.cols * P.pv.rows * P.pv.wattsEach / 1000;

// Planting layout, deterministic. Used only for drawing (not in the sun model:
// the plants that could block the glass or the PV are bounded by boxes above).
export function planting(seed = 7) {
  const R = rng(seed);
  const shrubs = [], agaves = [], vines = [];
  const scatter = (x, z, n, s0, s1, y = 0, tones = 4) => {
    for (let i = 0; i < n; i++) {
      shrubs.push({x: x[0] + R() * (x[1] - x[0]), y, z: z[0] + R() * (z[1] - z[0]),
                   s: s0 + R() * (s1 - s0), tone: Math.floor(R() * tones), rot: R() * 6.28});
    }
  };
  // Roof gardens (green roofs)
  scatter([-6.0, 6.0], [-11.0, -5.2], 70, 0.25, 0.6, P.ufFloor);
  scatter([2.9, 6.0], [-4.6, 0.6], 26, 0.25, 0.55, P.ufFloor);
  scatter([-6.0, -2.6], [-4.6, -3.7], 8, 0.2, 0.45, P.ufFloor);
  // Patio planters
  scatter([-2.4, 2.4], [-5.05, -4.85], 10, 0.2, 0.35, P.ufFloor + 0.5);
  // Balcony trough, kept inside the 'balcony planting' box
  for (let x = -5.6; x < 5.6; x += 0.32) shrubs.push({x: x + R() * 0.1, y: 4.45, z: 8.85, s: 0.2 + R() * 0.06, tone: 1 + Math.floor(R() * 2), rot: R() * 6.28, cap: P.balconyPlant.top});
  // Garden beds
  scatter([-6.5, 6.5], [5.2, 9.4], 60, 0.3, 0.9, 0);
  scatter([1.2, 6.5], [9.6, 13.4], 40, 0.35, 1.0, 0);
  scatter([-6.5, -5.6], [9.6, 13.4], 12, 0.3, 0.8, 0);
  scatter([-6.5, 6.5], [13.0, 13.6], 30, 0.4, 1.1, 0);
  scatter([-6.5, -6.0], [-11, 3], 14, 0.3, 0.7, 0);
  // Agaves in the garden
  for (const [x, z, s] of [[2.6, 10.6, 1.0], [4.6, 11.8, 1.25], [3.4, 12.6, 0.8], [5.6, 9.9, 0.9], [-6.0, 6.2, 0.9], [1.8, 6.4, 0.7]])
    agaves.push({x, z, s, rot: R() * 6.28});
  // Vines trailing from planter edges: [x0, x1, y, z, dir(+1 south / -1 north / 'e'/'w'), maxLen]
  const runs = [
    [-6.0, 6.0, P.ufFloor - 0.3, P.bar.z[1] + 0.02, 'z', 2.6],     // off the balcony trough, over the frame face
    [-2.4, 2.4, P.ufFloor + 0.45, -4.78, 'z', 1.7],                // from the patio planter into the patio
    [-6.2, 6.2, P.ufFloor + 0.5, -11.43, '-z', 2.8],               // down the street facade
    [-4.8, -0.6, 7.1, P.bar.z[1] + 0.02, 'z', 1.0],                // a little from the roof edge
  ];
  for (const [x0, x1, y, z, dir, maxLen] of runs) {
    for (let x = x0; x < x1; x += 0.11) {
      if (R() < 0.18) continue;
      vines.push({x: x + R() * 0.06, y, z, dir, len: maxLen * (0.35 + 0.65 * Math.pow(R(), 0.7)), phase: R() * 6.28});
    }
  }
  // East patio planter, trailing west into the patio
  for (let z = -4.6; z < 0.6; z += 0.12) if (R() > 0.2) vines.push({x: 2.48, y: P.ufFloor + 0.45, z, dir: '-x', len: 1.8 * (0.35 + 0.65 * R()), phase: R() * 6.28});
  return {shrubs, agaves, vines};
}

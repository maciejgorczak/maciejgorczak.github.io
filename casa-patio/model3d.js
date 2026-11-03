// The geometry, built from the boxes in house.js. update() poses it.
import * as THREE from 'three';
import {BOXES, P, planting} from './house.js';
import {GLASS_SAMPLES} from './sun.js';
import {rng} from './util.js';

const CUT_NONE = 1e4;

// ---------- Procedural textures (canvas, seeded) ----------

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.repeat.set(repeat, repeat);
  return t;
}

// Board-formed concrete: 2 m tile, 0.2 m boards, grain, joints, pores.
function boardTex() {
  const R = rng(11);
  return canvasTex(512, (g, S) => {
    const boardPx = S / 10;
    for (let b = 0; b < 10; b++) {
      const v = 200 + (R() - 0.5) * 18;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, b * boardPx, S, boardPx);
      for (let k = 0; k < 26; k++) {                   // wood grain streaks
        const y = b * boardPx + R() * boardPx, a = 0.05 + R() * 0.07;
        g.strokeStyle = R() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
        g.lineWidth = 0.6 + R() * 1.6;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 1.2 + (R() - 0.5) * 0.8);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, b * boardPx, S, 1.5);   // joint
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, b * boardPx + 1.5, S, 1);
      const seams = [R() * S, R() * S];                // board ends
      for (const x of seams) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, b * boardPx, 1.2, boardPx); }
    }
    for (let i = 0; i < 2200; i++) {                   // pores
      g.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.25})`;
      g.beginPath(); g.arc(R() * S, R() * S, 0.4 + R() * 1.1, 0, 7); g.fill();
    }
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {   // tie holes
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x * S, y * S + 2, 3.2, 0, 7); g.fill();
    }
  });
}

// Recinto: dark porous volcanic stone in irregular blocks (tileable Voronoi).
function stoneTex() {
  const R = rng(5);
  return canvasTex(256, (g, S) => {
    const pts = Array.from({length: 26}, () => [R() * S, R() * S, 70 + R() * 26]);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9, tone = 0;
      for (const [px, py, t] of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = x - px - ox * S, dy = y - py - oy * S, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; tone = t; } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      let v = edge < 2.2 ? 52 : tone + (R() - 0.5) * 30;
      if (R() < 0.06) v *= 0.55;
      const i = (y * S + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.93; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

function hatchTex(ink) {
  return canvasTex(64, (g, S) => {
    g.fillStyle = '#d9d1bb'; g.fillRect(0, 0, S, S);
    g.strokeStyle = ink; g.globalAlpha = 0.55; g.lineWidth = 1.5;
    for (let k = -S; k < 2 * S; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke(); }
  });
}

function vineTex() {
  const R = rng(3);
  return canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#4b5130'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
    for (let i = 0; i < 46; i++) {
      const y = R() * S, x = S / 2 + (R() - 0.5) * S * 0.8, r = 7 + R() * 9;
      const c = [[86, 98, 52], [104, 115, 64], [72, 84, 44], [120, 128, 76]][Math.floor(R() * 4)];
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, R() * 3, 0, 7); g.fill();
    }
  });
}

// World-space UVs so textures keep their real size on every box face.
function worldUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (ay > 0.5) { u = x; v = z; } else if (ax > 0.5) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function boxGeo(b) {
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
  const g = new THREE.BoxGeometry(w, h, d);
  if (b.tilt) g.rotateX(b.tilt);
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  return g;
}

function merge(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    const I = g.index.array; for (let k = 0; k < I.length; k++) idx[oi + k] = I[k] + ov;
    ov += g.attributes.position.count; oi += I.length;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

// ---------- Build ----------

export function buildModel(tokens) {
  const root = new THREE.Group();
  const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), CUT_NONE);   // keeps x < constant
  const planes = [clipPlane];
  const noAO = [];          // hidden during the AO normal pass (transparent or alpha-tested)
  const uTime = {value: 0};

  const concreteMap = boardTex();
  const stoneMap = stoneTex(); stoneMap.repeat.set(1, 1);
  const M = {
    concrete: new THREE.MeshStandardMaterial({color: 0xb5ac9c, map: concreteMap, bumpMap: concreteMap, bumpScale: 0.6, roughness: 0.9, envMapIntensity: 0.5}),
    recinto: new THREE.MeshStandardMaterial({color: 0x8e8a82, map: stoneMap, bumpMap: stoneMap, bumpScale: 1.2, roughness: 0.95, envMapIntensity: 0.4}),
    floor: new THREE.MeshStandardMaterial({color: 0xcfc6b2, roughness: 0.6, envMapIntensity: 0.5}),
    plaster: new THREE.MeshStandardMaterial({color: 0xe0d8c6, roughness: 0.92}),
    wood: new THREE.MeshStandardMaterial({color: 0x8d6c4d, roughness: 0.7}),
    linen: new THREE.MeshStandardMaterial({color: 0xd6ccb8, roughness: 0.95}),
    steel: new THREE.MeshStandardMaterial({color: 0x34342e, roughness: 0.5, metalness: 0.4}),
    brick: new THREE.MeshStandardMaterial({color: 0xa86a4f, roughness: 0.9}),
    pv: new THREE.MeshStandardMaterial({color: 0x1f2630, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.8}),
    glass: new THREE.MeshStandardMaterial({color: 0x52605a, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.38, envMapIntensity: 1.1, depthWrite: false}),
    soil: new THREE.MeshStandardMaterial({color: 0x6d7046, roughness: 1}),
    water: new THREE.MeshStandardMaterial({color: 0x3a463f, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.2}),
    tank: new THREE.MeshStandardMaterial({color: 0x56707a, roughness: 0.1, transparent: true, opacity: 0.85}),
  };
  for (const m of Object.values(M)) { m.clippingPlanes = planes; m.clipShadows = true; }
  M.glass.side = THREE.DoubleSide;

  // Merge boxes per material (and per x-ray group) into a few draw calls.
  const byMat = new Map();
  for (const b of BOXES) {
    if (b.mat === 'plant') continue;
    const key = b.mat + (b.group === 'below' ? ':below' : '');
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key).push(boxGeo(b));
  }
  // Green-roof soil layers on top of the 'green' roofs.
  const soil = [];
  for (const b of BOXES) if (b.roof === 'green')
    soil.push(boxGeo({min: [b.min[0] + 0.15, b.max[1], b.min[2] + 0.15], max: [b.max[0] - 0.15, b.max[1] + 0.12, b.max[2] - 0.15]}));
  byMat.set('soil', soil);

  const meshes = {};
  const solidKeys = [];
  for (const [key, geos] of byMat) {
    const g = merge(geos);
    const mat = M[key.split(':')[0]];
    if (key.startsWith('concrete') || key.startsWith('recinto') || key === 'floor') worldUV(g, key.startsWith('recinto') ? 1.2 : 2);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = !['glass'].includes(key);
    mesh.receiveShadow = true;
    if (key === 'glass') { mesh.renderOrder = 2; noAO.push(mesh); }
    meshes[key] = mesh; root.add(mesh);
    if (key !== 'glass') solidKeys.push(key);
  }

  // Edges for x-ray mode: the building as a line drawing.
  const edgeGeos = [];
  for (const b of BOXES) if (b.mat !== 'plant' && b.mat !== 'glass' && b.group !== 'celosia' && !b.id.startsWith('step')) edgeGeos.push(new THREE.EdgesGeometry(boxGeo(b)));
  let ne = 0; for (const e of edgeGeos) ne += e.attributes.position.count;
  const ep = new Float32Array(ne * 3); let o = 0;
  for (const e of edgeGeos) { ep.set(e.attributes.position.array, o); o += e.attributes.position.array.length; }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({color: tokens.ink, transparent: true, opacity: 0.55, clippingPlanes: planes}));
  edges.visible = false; root.add(edges); noAO.push(edges);
  const ghost = new THREE.MeshStandardMaterial({color: 0xd8d0bd, transparent: true, opacity: 0.16, depthWrite: false, roughness: 1, side: THREE.DoubleSide});

  // ---------- Ground ----------
  const groundMat = new THREE.MeshStandardMaterial({color: tokens.ground, roughness: 1, clippingPlanes: planes});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  const lawnMat = new THREE.MeshStandardMaterial({color: 0x8a8a5c, roughness: 1, clippingPlanes: planes, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 10.55), lawnMat);
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, 0.01, 3.2 + 10.55 / 2); lawn.receiveShadow = true; root.add(lawn);
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(40, 3.2), new THREE.MeshStandardMaterial({color: new THREE.Color(tokens.ground).offsetHSL(0, -0.05, 0.05), roughness: 1, clippingPlanes: planes, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}));
  sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(0, 0.01, -13.2); sidewalk.receiveShadow = true; root.add(sidewalk);

  // Pond water and the cistern's water.
  const pd = P.pond;
  const pond = new THREE.Mesh(new THREE.PlaneGeometry(pd.x[1] - pd.x[0], pd.z[1] - pd.z[0]), M.water);
  pond.rotation.x = -Math.PI / 2; pond.position.set((pd.x[0] + pd.x[1]) / 2, 0.2, (pd.z[0] + pd.z[1]) / 2); pond.receiveShadow = true; root.add(pond);
  const c = P.cistern, fill = 0.8;
  const tankWater = new THREE.Mesh(boxGeo({min: [c.x[0], c.y[0], c.z[0]], max: [c.x[1], c.y[0] + (c.y[1] - c.y[0]) * fill, c.z[1]]}), M.tank);
  tankWater.visible = false; root.add(tankWater);

  // ---------- Planting ----------
  const plant = planting();
  const greens = [0x6b7546, 0x57603a, 0x7f8a55, 0x4c5634].map(c => new THREE.Color(c));
  const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
  const shrubMat = new THREE.MeshStandardMaterial({roughness: 0.95, flatShading: true, clippingPlanes: planes});
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, plant.shrubs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e3 = new THREE.Euler();
  plant.shrubs.forEach((s, i) => {
    let hy = s.s * 0.7;
    if (s.cap) hy = Math.min(hy, (s.cap - s.y) / 1.6);
    p3.set(s.x, s.y + hy * 0.6, s.z); q.setFromEuler(e3.set(0, s.rot, 0)); s3.set(s.s, hy, s.s);
    shrubs.setMatrixAt(i, m4.compose(p3, q, s3)); shrubs.setColorAt(i, greens[s.tone]);
  });
  shrubs.castShadow = true; shrubs.receiveShadow = true; root.add(shrubs);

  // Agaves: rosettes of tapered leaves.
  const leafGeo = new THREE.ConeGeometry(0.08, 1, 4); leafGeo.translate(0, 0.5, 0); leafGeo.scale(1, 1, 0.45);
  const agaveMat = new THREE.MeshStandardMaterial({color: 0x7f8f7e, roughness: 0.6, flatShading: true, clippingPlanes: planes});
  const per = 18, agaves = new THREE.InstancedMesh(leafGeo, agaveMat, plant.agaves.length * per);
  const R = rng(21); let ai = 0;
  for (const a of plant.agaves) for (let k = 0; k < per; k++) {
    const ring = k < 8 ? 0 : k < 14 ? 1 : 2;
    const yaw = a.rot + k * 2.399, tiltA = [1.15, 0.75, 0.35][ring] + (R() - 0.5) * 0.15, len = a.s * [0.95, 0.85, 0.6][ring];
    q.setFromEuler(e3.set(0, yaw, tiltA, 'YXZ'));
    // tilt about local z after yaw: build as yaw then tilt outward
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -tiltA);
    q.copy(qy).multiply(qt);
    agaves.setMatrixAt(ai++, m4.compose(p3.set(a.x, 0.02, a.z), q, s3.set(a.s * 1.6, len, a.s * 1.6)));
  }
  agaves.castShadow = true; agaves.receiveShadow = true; root.add(agaves);

  // Vines: alpha-tested strips that sway a little (driven by uTime).
  const vgeo = new THREE.PlaneGeometry(0.16, 1, 1, 6); vgeo.translate(0, -0.5, 0);
  const vmap = vineTex(); vmap.wrapT = THREE.RepeatWrapping;
  const vineMat = new THREE.MeshStandardMaterial({map: vmap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, clippingPlanes: planes});
  const phases = new Float32Array(plant.vines.length);
  vineMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = clamp(-position.y, 0.0, 1.0);
        transformed.z += sin(uTime * 1.3 + aPhase) * 0.05 * k * k;
        transformed.x += sin(uTime * 0.9 + aPhase * 1.7) * 0.02 * k;`);
  };
  const vines = new THREE.InstancedMesh(vgeo, vineMat, plant.vines.length);
  plant.vines.forEach((v, i) => {
    let yaw = 0;
    if (v.dir === 'z' || v.dir === '-z') yaw = 0; else yaw = Math.PI / 2;
    q.setFromEuler(e3.set(0, yaw + (R() - 0.5) * 0.4, 0));
    const off = v.dir === 'z' ? 0.03 : v.dir === '-z' ? -0.03 : v.dir === '-x' ? -0.03 : 0.03;
    const px = v.dir.endsWith('x') ? v.x + off : v.x, pz = v.dir.endsWith('z') ? v.z + off : v.z;
    vines.setMatrixAt(i, m4.compose(p3.set(px, v.y, pz), q, s3.set(1, v.len, 1)));
    phases[i] = v.phase;
  });
  vgeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  vines.receiveShadow = true; root.add(vines); noAO.push(vines);

  // ---------- Jacaranda ----------
  const tree = new THREE.Group(); root.add(tree);
  const T = P.tree, TR = rng(77);
  const barkMat = new THREE.MeshStandardMaterial({color: 0x5b5246, roughness: 0.95});
  const tips = [];
  const grow = (from, dir, len, rad, depth) => {
    const to = from.clone().add(dir.clone().multiplyScalar(len));
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((TR() - 0.5) * 0.3, 0, (TR() - 0.5) * 0.3));
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 6, rad, 6), barkMat);
    m.castShadow = true; m.receiveShadow = true; tree.add(m);
    if (depth === 0) { tips.push(to); return; }
    const n = depth >= 2 ? 3 : 2 + Math.floor(TR() * 2);
    for (let i = 0; i < n; i++) {
      const a = TR() * Math.PI * 2;
      const nd = dir.clone().multiplyScalar(0.55).add(new THREE.Vector3(Math.cos(a) * 0.7, 0.35 + TR() * 0.3, Math.sin(a) * 0.7)).normalize();
      grow(to, nd, len * (0.62 + TR() * 0.12), rad * 0.62, depth - 1);
    }
  };
  grow(new THREE.Vector3(T.x, 0.2, T.z), new THREE.Vector3(0.05, 1, -0.03).normalize(), 2.4, 0.16, 3);
  // Scale the tree so its crown stays below the PV (asserted in the sun model).
  const leafGeo2 = new THREE.IcosahedronGeometry(1, 1);
  const leafMat = new THREE.MeshStandardMaterial({roughness: 0.9, flatShading: true});
  const clusters = [];
  for (const t of tips) for (let k = 0; k < 7; k++) clusters.push([t.x + (TR() - 0.5) * 1.3, t.y + (TR() - 0.4) * 0.8, t.z + (TR() - 0.5) * 1.3, 0.35 + TR() * 0.35, TR()]);
  let maxY = 0; for (const cl of clusters) maxY = Math.max(maxY, cl[1] + cl[3]);
  const crown = new THREE.InstancedMesh(leafGeo2, leafMat, clusters.length);
  const fitY = Math.min(1, (T.top - 0.2) / (maxY - 0.2));
  tree.scale.set(1, 1, 1);
  tree.children.forEach(m => { m.position.y = 0; });
  tree.position.set(0, 0, 0);
  // Apply vertical fit by scaling the whole tree about its base.
  tree.scale.y = fitY; tree.position.y = 0.2 * (1 - fitY);
  clusters.forEach((cl, i) => crown.setMatrixAt(i, m4.compose(p3.set(cl[0], cl[1], cl[2]), q.identity(), s3.set(cl[3], cl[3] * 0.75, cl[3]))));
  crown.castShadow = true; crown.receiveShadow = true; tree.add(crown);
  const crownColors = {
    mar: [0xa69dc6, 0xb3a9d0, 0x958db8, 0x76804e],
    jun: [0x6a7a40, 0x5d6c3a, 0x7b8a4c, 0x55613a],
    dec: [0x7d8148, 0x8b8a52, 0x6d743f, 0x96904f],
  };
  let crownDate = null;
  const setCrown = id => {
    if (crownDate === id) return; crownDate = id;
    const cols = crownColors[id].map(c => new THREE.Color(c));
    clusters.forEach((cl, i) => {
      const k = id === 'mar' ? (cl[4] < 0.72 ? Math.floor(cl[4] * 4.2) % 3 : 3) : Math.floor(cl[4] * 4);
      crown.setColorAt(i, cols[k]);
      const sc = id === 'dec' ? 0.8 : 1;
      crown.setMatrixAt(i, m4.compose(p3.set(cl[0], cl[1], cl[2]), q.identity(), s3.set(cl[3] * sc, cl[3] * 0.75 * sc, cl[3] * sc)));
    });
    crown.instanceColor.needsUpdate = true; crown.instanceMatrix.needsUpdate = true;
  };
  setCrown('mar');

  // ---------- The gauge on the model: lit cells of the south glass ----------
  const GX = 36, GY = 14;
  const litData = new Uint8Array(GX * GY * 4);
  const litTex = new THREE.DataTexture(litData, GX, GY); litTex.magFilter = THREE.NearestFilter; litTex.needsUpdate = true;
  const litMat = new THREE.MeshBasicMaterial({map: litTex, transparent: true, depthWrite: false, clippingPlanes: planes, toneMapped: false});
  const lit = new THREE.Mesh(new THREE.PlaneGeometry(P.glass.x[1] - P.glass.x[0], P.glass.y[1] - P.glass.y[0]), litMat);
  lit.position.set(0, (P.glass.y[0] + P.glass.y[1]) / 2, P.glassZ + 0.035); lit.renderOrder = 3; root.add(lit); noAO.push(lit);
  const accent = new THREE.Color(tokens.accent);

  // ---------- Sun path and sun marker ----------
  const pathMat = new THREE.LineBasicMaterial({color: tokens.accent, transparent: true, opacity: 0.7});
  const pathGeo = new THREE.BufferGeometry(); pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 121), 3));
  const sunPath = new THREE.Line(pathGeo, pathMat); root.add(sunPath); noAO.push(sunPath);
  const sunDot = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), new THREE.MeshBasicMaterial({color: tokens.accent, toneMapped: false}));
  root.add(sunDot); noAO.push(sunDot);
  const SUN_R = 26, SUN_C = new THREE.Vector3(0, 0, 0);

  // ---------- Section caps (poche) ----------
  const capMat = new THREE.MeshBasicMaterial({color: tokens.ink, side: THREE.DoubleSide});
  const earthMat = new THREE.MeshBasicMaterial({map: hatchTex(tokens.ink), side: THREE.DoubleSide});
  earthMat.map.repeat.set(1, 1);
  const capGeo = new THREE.BufferGeometry();
  const caps = new THREE.Mesh(capGeo, capMat); caps.visible = false; root.add(caps);
  const earthGeo = new THREE.BufferGeometry();
  const earth = new THREE.Mesh(earthGeo, earthMat); earth.visible = false; root.add(earth);
  const capBoxes = BOXES.filter(b => b.clip && b.mat !== 'glass' && b.mat !== 'plant' && !b.tilt);
  let lastCut = null;
  function buildCaps(x) {
    if (lastCut === x) return; lastCut = x;
    const quads = [];
    const eps = 0.004;
    for (const b of capBoxes) if (b.min[0] < x - eps && b.max[0] > x + eps) quads.push([b.min[1], b.max[1], b.min[2], b.max[2]]);
    const pos = new Float32Array(quads.length * 18);
    quads.forEach(([y0, y1, z0, z1], i) => {
      pos.set([x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z0, x, y1, z1, x, y0, z1], i * 18);
    });
    capGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); capGeo.computeBoundingSphere();
    // Earth: y in [-3.2, 0], with a hole where the cistern is cut.
    const E = [];
    const ey0 = -3.0, ey1 = 0, ez0 = -14, ez1 = 14;
    const ct = 0.25, cx0 = c.x[0] - ct, cx1 = c.x[1] + ct;
    if (x > cx0 && x < cx1) {
      const hz0 = c.z[0] - ct, hz1 = c.z[1] + ct, hy0 = c.y[0] - ct, hy1 = 0.05;
      E.push([ey0, ey1, ez0, hz0], [ey0, ey1, hz1, ez1], [ey0, hy0, hz0, hz1]);
      if (hy1 < ey1) E.push([hy1, ey1, hz0, hz1]);
    } else E.push([ey0, ey1, ez0, ez1]);
    const ep = new Float32Array(E.length * 18), eu = new Float32Array(E.length * 12);
    E.forEach(([y0, y1, z0, z1], i) => {
      ep.set([x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z0, x, y1, z1, x, y0, z1], i * 18);
      const s = 1 / 2;
      eu.set([z0 * s, y0 * s, z0 * s, y1 * s, z1 * s, y1 * s, z0 * s, y0 * s, z1 * s, y1 * s, z1 * s, y0 * s], i * 12);
    });
    earthGeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    earthGeo.setAttribute('uv', new THREE.BufferAttribute(eu, 2)); earthGeo.computeBoundingSphere();
  }

  // ---------- Pose ----------
  let lastLit = null, lastPathDay = null, lastMode = null;
  function update(st) {
    uTime.value = st.t;
    // Crown sways a hair; leaves of the vines sway in the shader.
    tree.rotation.z = Math.sin(st.t * 0.6) * 0.006; tree.rotation.x = Math.sin(st.t * 0.45 + 1) * 0.004;
    setCrown(st.date.id);

    // Sun marker and the day's path.
    const d = st.r.dir;
    sunDot.position.set(SUN_C.x + d[0] * SUN_R, SUN_C.y + d[1] * SUN_R, SUN_C.z + d[2] * SUN_R);
    sunDot.visible = st.r.alt > -2 && st.showSun;
    sunPath.visible = st.showSun;
    if (lastPathDay !== st.date.day) {
      lastPathDay = st.date.day;
      const a = pathGeo.attributes.position.array;
      for (let i = 0; i <= 120; i++) {
        const sp = st.sunAt(5 + i * 14 / 120);
        const y = Math.max(sp.dir[1], -0.02);
        a[i * 3] = sp.dir[0] * SUN_R; a[i * 3 + 1] = y * SUN_R; a[i * 3 + 2] = sp.dir[2] * SUN_R;
      }
      pathGeo.attributes.position.needsUpdate = true; pathGeo.computeBoundingSphere();
    }

    // Lit cells on the glass, from the same ray cast as the gauge.
    if (st.litKey !== lastLit) {
      lastLit = st.litKey;
      for (let i = 0; i < GX * GY; i++) {
        const on = st.litCells[i];
        litData[i * 4] = accent.r * 255; litData[i * 4 + 1] = accent.g * 255; litData[i * 4 + 2] = accent.b * 255;
        litData[i * 4 + 3] = on ? 120 : 0;
      }
      litTex.needsUpdate = true;
    }
    lit.visible = st.showLit;

    // Cutaway modes.
    clipPlane.constant = st.cut;
    const cutting = st.cut < 100;
    if (cutting) buildCaps(st.cut);
    caps.visible = earth.visible = cutting;
    tankWater.visible = cutting || st.mode === 'xray';
    if (st.mode !== lastMode) {
      lastMode = st.mode;
      const x = st.mode === 'xray';
      for (const k of solidKeys) {
        const base = M[k.split(':')[0]];
        if (k.endsWith(':below')) { meshes[k].material = base; meshes[k].visible = x || cutting; continue; }
        if (['concrete', 'recinto', 'brick'].includes(k)) meshes[k].material = x ? ghost : base;
        meshes[k].castShadow = true;
      }
      edges.visible = x;
      groundMat.transparent = x; groundMat.opacity = x ? 0.35 : 1; groundMat.depthWrite = !x; groundMat.needsUpdate = true;
      lawnMat.transparent = x; lawnMat.opacity = x ? 0.4 : 1; lawnMat.needsUpdate = true;
    }
    if (meshes['concrete:below']) meshes['concrete:below'].visible = cutting || st.mode === 'xray';
  }

  return {root, update, noAO, planes, glassSamples: GLASS_SAMPLES, GX, GY};
}

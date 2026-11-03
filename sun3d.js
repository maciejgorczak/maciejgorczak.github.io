// The Sun, taken apart. three.js, drawn as engraving: ink lines on the page
// colour, one accent for the core where the work happens.
// Numbers and labels come from sun-model.js.
import * as THREE from 'three';
import {LAYERS, FACTS, SPOTS, omegaDegPerDay, periodDays, lightTime, EARTH_SCALE} from './sun-model.js';

const GLSL_COMMON = /* glsl */`
  uniform vec3 uPaper, uInk, uAccent;
  uniform float uDays, uSec, uCut;
  // distance-to-line mask: lines at integer x, width as a fraction of the period
  float lineMask(float x, float width) {
    float d = abs(fract(x + 0.5) - 0.5);
    float aa = max(fwidth(x), 1e-4);
    return 1.0 - smoothstep(max(width * 0.5 - aa, 0.0), width * 0.5 + aa, d);
  }
  float omega(float lat) {                       // rad per day, Snodgrass & Ulrich 1990
    float s2 = sin(lat) * sin(lat);
    return radians(14.713 - 2.396 * s2 - 1.787 * s2 * s2);
  }
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }
  float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
  // Cellular noise: F1 and F2 distances, feature points drift with time.
  vec2 cells(vec3 x, float t) {
    vec3 i = floor(x), f = fract(x);
    float f1 = 8.0, f2 = 8.0;
    for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
      vec3 g = vec3(float(a), float(b), float(c));
      vec3 h = hash3(i + g);
      vec3 o = 0.5 + 0.38 * sin(t * (0.6 + h * 0.8) + 6.2831 * h);
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return vec2(f1, f2);
  }
`;

// ---------- Photosphere: limb darkening as line weight, granules, spots ----------
const SURFACE_FRAG = /* glsl */`
  ${GLSL_COMMON}
  uniform vec4 uSpots[6];
  varying vec3 vPos;
  void main() {
    vec3 p = normalize(vPos);
    if (all(greaterThan(p, vec3(uCut)))) discard;
    vec3 V = normalize(cameraPosition - vPos);
    float mu = clamp(dot(p, V), 0.0, 1.0);

    // Limb darkening, linear law I/I0 = 1 - u(1 - mu), u = 0.6 in visible light.
    float dark = 0.03 + 0.6 * pow(1.0 - mu, 1.6);

    // Surface pattern in the rotating frame: each latitude turns at its own rate.
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);
    float lq = lon + omega(lat) * uDays;
    vec3 q = vec3(cos(lat) * cos(lq), p.y, cos(lat) * sin(lq));

    // Sunspots: umbra dense, penumbra as radial filaments.
    float spot = 0.0, fil = 0.0;
    for (int k = 0; k < 6; k++) {
      vec4 s = uSpots[k];
      float slon = s.y - omega(s.x) * uDays;
      vec3 c = vec3(cos(s.x) * cos(slon), sin(s.x), cos(s.x) * sin(slon));
      float a = acos(clamp(dot(p, c), -1.0, 1.0));
      if (a < s.z) {
        if (a < s.z * 0.45) spot = max(spot, 0.9);
        else {
          vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), c)), e2 = cross(c, e1);
          vec3 v = p - c * dot(p, c);
          float ang = atan(dot(v, e2), dot(v, e1));
          fil = max(fil, lineMask(ang * 30.0 / 6.2831, 0.35) * 0.85);
          spot = max(spot, 0.45);
        }
      }
    }
    dark = max(dark, spot);

    // Engraving: parallels, thicker where darker; crossed where darkest.
    float ink = lineMask(p.y * 52.0, clamp(dark * 0.75, 0.05, 0.9)) * 0.7;
    if (dark > 0.5) ink = max(ink, lineMask((p.x + p.z) * 40.0, (dark - 0.5) * 1.5) * 0.75);
    ink *= 1.0 - smoothstep(0.965, 0.995, abs(p.y));   // no bullseye at the poles
    ink = max(ink, fil);

    // Granulation: the dark lanes between cells, fading toward the limb.
    vec2 F = cells(q * 34.0, uSec * 0.22);
    float lane = 1.0 - smoothstep(0.0, 0.07 + fwidth(F.y - F.x), F.y - F.x);
    ink = max(ink, lane * 0.55 * smoothstep(0.1, 0.45, mu) * (1.0 - spot));

    // Limb outline and the edge of the cut.
    float fm = fwidth(mu);
    ink = max(ink, 1.0 - smoothstep(fm * 1.2, fm * 2.6, mu));
    float e = 9.0;
    if (p.y > uCut && p.z > uCut) e = min(e, uCut - p.x);
    if (p.x > uCut && p.z > uCut) e = min(e, uCut - p.y);
    if (p.x > uCut && p.y > uCut) e = min(e, uCut - p.z);
    float fe = length(fwidth(p)) * 1.5;   // smooth width: e itself jumps where the cases switch
    if (uCut < 0.99) ink = max(ink, 1.0 - smoothstep(0.004, 0.004 + fe, abs(e)));

    gl_FragColor = vec4(mix(uPaper, uInk, clamp(ink, 0.0, 1.0)), 1.0);
  }
`;

// ---------- Cut faces: core, radiative zone, tachocline, convection cells ----------
const FACE_FRAG = /* glsl */`
  ${GLSL_COMMON}
  uniform int uAxis;
  varying vec3 vPos;
  void main() {
    vec3 p = vPos;
    float r = length(p);
    vec2 uv = uAxis == 0 ? p.yz : uAxis == 1 ? p.xz : p.xy;
    if (r > 1.0 || uv.x < uCut || uv.y < uCut) discard;
    float ink = 0.0, acc = 0.0;

    if (r < ${LAYERS.core.r1.toFixed(3)}) {
      // Core: stipple in the accent, denser toward the centre.
      vec2 g = uv / 0.022;
      vec2 cell = fract(g) - 0.5;
      float h = hash1(dot(floor(g), vec2(17.0, 59.0)));
      float rad = 0.16 + 0.26 * (1.0 - r / ${LAYERS.core.r1.toFixed(3)});
      float tw = 0.75 + 0.25 * sin(uSec * 2.2 + h * 6.2831);
      acc = (1.0 - smoothstep(rad * tw - 0.08, rad * tw + 0.08, length(cell)));
      acc = max(acc, lineMask(r / ${LAYERS.core.r1.toFixed(3)}, 0.012 / ${LAYERS.core.r1.toFixed(3)}) );
    } else if (r < ${LAYERS.radiative.r1.toFixed(3)}) {
      // Radiative zone: concentric shells, closer together toward the core.
      ink = lineMask(pow(r, 0.75) * 46.0, 0.12) * 0.55;
    } else {
      // Convective zone: rolling cells, flow lines with dashes moving along them.
      float th = atan(uv.y, uv.x) / 1.5708 * 7.0;
      float idx = floor(th);
      float mid = 0.5 * (${LAYERS.convective.r0.toFixed(3)} + 1.0), half_ = 0.5 * (1.0 - ${LAYERS.convective.r0.toFixed(3)});
      vec2 c = vec2((fract(th) - 0.5) * 1.5708 / 7.0 * r / half_, (r - mid) / half_);
      float ell = length(vec2(c.x * 0.95, c.y));
      float dir = mod(idx, 2.0) < 1.0 ? 1.0 : -1.0;
      float ph = atan(c.y, c.x) / 6.2831 * 5.0 + dir * uSec * 0.12;
      float dash = smoothstep(0.35, 0.45, fract(ph)) * (1.0 - smoothstep(0.85, 0.95, fract(ph)));
      if (ell < 0.95) ink = lineMask(ell * 4.0, 0.16) * 0.75 * mix(0.35, 1.0, dash);
    }
    // Boundaries: core edge (accent), tachocline (bold), surface rim, cut edges.
    ink = max(ink, lineMask((r - ${LAYERS.tachocline.r.toFixed(3)}) * 60.0, 0.32) * step(abs(r - ${LAYERS.tachocline.r.toFixed(3)}), 0.02));
    ink = max(ink, 1.0 - smoothstep(0.0, fwidth(r) * 2.5, 1.0 - r - 0.004));
    float fe = fwidth(uv.x) * 2.2;
    ink = max(ink, 1.0 - smoothstep(fe, fe * 1.8, min(uv.x - uCut, uv.y - uCut)));

    vec3 base = mix(uPaper, uInk, 0.035);
    vec3 col = mix(base, uInk, clamp(ink, 0.0, 1.0));
    col = mix(col, uAccent, clamp(acc, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------- Corona and chromosphere: a billboard around the disc ----------
const CORONA_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    gl_Position = projectionMatrix * viewMatrix * vec4(right * position.x + up * position.y, 1.0);
  }
`;
const CORONA_FRAG = /* glsl */`
  ${GLSL_COMMON}
  uniform float uLimb;
  varying vec2 vUv;
  void main() {
    float rho = length(vUv) / uLimb, phi = atan(vUv.y, vUv.x);
    if (rho < 1.0) discard;
    float a = 0.0;
    // Chromosphere: dense spicules just above the limb.
    float sp = 1.0 + 0.035 + 0.02 * hash1(floor(phi / 6.2831 * 480.0));
    a = max(a, lineMask(phi / 6.2831 * 480.0, 0.25) * (1.0 - smoothstep(sp - 0.01, sp, rho)) * 0.35);
    // Corona: rays, longer in streamers near the equator, short over the poles.
    float N = 96.0, k = floor(phi / 6.2831 * N + 0.5);
    float h = hash1(k + 3.0);
    float eq = exp(-pow(sin(k / N * 6.2831), 2.0) / 0.07);
    float L = 0.16 + 0.42 * h * h + 0.85 * eq * (0.5 + 0.5 * hash1(k * 1.7));
    L *= 0.92 + 0.08 * sin(uSec * 0.4 + h * 6.2831);
    float inRay = step(1.06, rho) * (1.0 - smoothstep(1.0 + L - 0.01, 1.0 + L, rho));
    a = max(a, lineMask(phi / 6.2831 * N, 0.06) * inRay * (0.42 - 0.3 * (rho - 1.0) / max(L, 0.01)));
    // A dot at the end of every fourth ray, as on the old plate.
    if (mod(k, 4.0) < 0.5) {
      vec2 tip = vec2(cos(k / N * 6.2831), sin(k / N * 6.2831)) * (1.0 + L + 0.015) * uLimb;
      float d = length(vUv - tip), fw = fwidth(d);
      a = max(a, (1.0 - smoothstep(0.012 - fw, 0.012 + fw, d)) * 0.4);
    }
    // Dashed rings at 1.25, 1.5, 1.75 and 2 solar radii.
    float ring = lineMask((rho - 1.0) * 4.0, 0.03) * step(1.2, rho) * step(rho, 2.05);
    float dashed = step(0.4, fract(phi / 6.2831 * 90.0));
    a = max(a, ring * dashed * 0.28);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uInk, a);
  }
`;

const SURFACE_VERT = /* glsl */`
  varying vec3 vPos;
  void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const g = (n, d) => cs.getPropertyValue(n).trim() || d;
  return {paper: g('--bg', '#e8e2d1'), ink: g('--ink', '#2b2a1e'), accent: g('--accent', '#5b6a26')};
}

const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // state to state

export function mountSun(plate) {
  const canvas = plate.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const DIST = 7.4;

  const tok = readTokens();
  const common = {
    uPaper: {value: new THREE.Color(tok.paper)}, uInk: {value: new THREE.Color(tok.ink)}, uAccent: {value: new THREE.Color(tok.accent)},
    uDays: {value: 0}, uSec: {value: 0}, uCut: {value: 1},
  };
  const deg = Math.PI / 180;
  const spotsU = SPOTS.map(s => new THREE.Vector4(s.lat * deg, s.lon * deg, s.r, 0));

  // Photosphere
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120),
    new THREE.ShaderMaterial({uniforms: {...common, uSpots: {value: spotsU}}, vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, side: THREE.FrontSide}));
  scene.add(sun);

  // Cut faces, one quad per axis, each spanning [0,1] x [0,1] in its plane.
  const faces = [0, 1, 2].map(axis => {
    const g = new THREE.PlaneGeometry(1, 1);   // positions are rewritten by placeFaces()
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({uniforms: {...common, uAxis: {value: axis}}, vertexShader: SURFACE_VERT, fragmentShader: FACE_FRAG, side: THREE.DoubleSide}));
    scene.add(m);
    return m;
  });
  // Lay each quad on its plane: x = c (y,z in [0,1]), y = c (x,z), z = c (x,y).
  function placeFaces(c) {
    const set = (m, pts) => { const a = m.geometry.attributes.position; pts.forEach((p, i) => a.setXYZ(i, ...p)); a.needsUpdate = true; m.geometry.computeBoundingSphere(); };
    const s = 1.0;
    set(faces[0], [[c, c, c], [c, s, c], [c, c, s], [c, s, s]]);
    set(faces[1], [[c, c, c], [s, c, c], [c, c, s], [s, c, s]]);
    set(faces[2], [[c, c, c], [s, c, c], [c, s, c], [s, s, c]]);
  }
  for (const f of faces) { f.geometry.setIndex([0, 1, 3, 0, 3, 2]); }

  // Corona billboard
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(6, 6),
    new THREE.ShaderMaterial({uniforms: {...common, uLimb: {value: 1}}, vertexShader: CORONA_VERT, fragmentShader: CORONA_FRAG, transparent: true, depthWrite: false}));
  corona.frustumCulled = false; corona.renderOrder = -1;
  scene.add(corona);

  // Coronal loops over the leading spot pair: field lines as ink arcs.
  const loops = new THREE.Group(); scene.add(loops);
  const lineMat = new THREE.LineBasicMaterial({color: tok.ink, transparent: true, opacity: 0.75});
  const dir = (la, lo) => new THREE.Vector3(Math.cos(la * deg) * Math.cos(lo * deg), Math.sin(la * deg), Math.cos(la * deg) * Math.sin(lo * deg));
  const A = SPOTS[0], B = SPOTS[1];
  const pairLat = (A.lat + B.lat) / 2;
  for (let k = 0; k < 9; k++) {
    const off = (k - 4) * 0.9;
    const a = dir(A.lat + off * 0.45, A.lon + 1), b = dir(B.lat + off * 0.55, B.lon - 1);
    const h = 0.12 + 0.05 * (4 - Math.abs(k - 4)) + 0.02 * (k % 2);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = a.clone().lerp(b, t).normalize().multiplyScalar(1 + h * Math.sin(Math.PI * t) + 0.004);
      pts.push(p);
    }
    loops.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }

  // A photon's random walk across the radiative zone, drawn on the y = c face.
  const walk = [];
  {
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let ang = 0.85, r = LAYERS.radiative.r0 + 0.01;
    while (r < LAYERS.radiative.r1 - 0.01 && walk.length < 400) {
      walk.push(new THREE.Vector3(r * Math.cos(ang), 0, r * Math.sin(ang)));
      const a = rnd() * Math.PI * 2, st = 0.022;
      const nx = r * Math.cos(ang) + st * Math.cos(a) + 0.0035 * Math.cos(ang), nz = r * Math.sin(ang) + st * Math.sin(a) + 0.0035 * Math.sin(ang);
      r = Math.hypot(nx, nz); ang = Math.min(1.35, Math.max(0.22, Math.atan2(nz, nx)));
      r = Math.max(r, LAYERS.radiative.r0 + 0.01);
    }
  }
  const walkLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(walk), new THREE.LineBasicMaterial({color: tok.ink, transparent: true, opacity: 0.8}));
  scene.add(walkLine);

  // ---------- Labels and leaders ----------
  const overlay = plate.querySelector('.sun-labels');
  const svg = plate.querySelector('.sun-leaders');
  const legend = plate.parentElement.querySelector('.sun-legend');
  const ORDER_L = ['corona', 'chromosphere', 'photosphere', 'granules'];
  const ORDER_R = ['core', 'radiative', 'convective', 'sunspot', 'loops'];
  const labels = {};
  [...ORDER_L, ...ORDER_R].forEach((id, i) => {
    const el = document.createElement('div');
    el.className = 'sun-label' + (ORDER_L.includes(id) ? ' left' : ' right') + (id === 'core' ? ' accent' : '');
    el.innerHTML = `<span class="n">${i + 1}</span><b>${FACTS[id].title}</b><span class="b">${FACTS[id].body}</span>`;
    overlay.appendChild(el);
    labels[id] = {el, n: i + 1};
    if (legend) {
      const li = document.createElement('li');
      li.innerHTML = `<b>${FACTS[id].title}</b> ${FACTS[id].body}`;
      if (id === 'core') li.className = 'accent';
      legend.appendChild(li);
    }
  });

  const tmp = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  function anchors(cut, days) {
    const c = cut;
    const spotNow = s => { const lon = s.lon * deg - omegaDegPerDay(s.lat * deg) * deg * days; return new THREE.Vector3(Math.cos(s.lat * deg) * Math.cos(lon), Math.sin(s.lat * deg), Math.cos(s.lat * deg) * Math.sin(lon)); };
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    const limb = (deg_, rr) => right.clone().multiplyScalar(Math.cos(deg_ * deg) * rr).add(up.clone().multiplyScalar(Math.sin(deg_ * deg) * rr));
    const sA = spotNow(A), sB = spotNow(B);
    return {
      core: new THREE.Vector3(c + 0.09, c + 0.09, c + 0.001),
      radiative: new THREE.Vector3(0.5 * Math.cos(0.5), c + 0.001, 0.5 * Math.sin(0.5)),
      convective: new THREE.Vector3(c + 0.001, 0.86 * Math.sin(1.05), 0.86 * Math.cos(1.05)),
      photosphere: new THREE.Vector3(-0.42, 0.5, 0.76).normalize(),
      granules: new THREE.Vector3(0.12, -0.3, 0.95).normalize(),
      sunspot: sA,
      loops: sA.clone().add(sB).normalize().multiplyScalar(1.17),
      chromosphere: limb(200, 1.04),
      corona: limb(162, 1.75),
    };
  }
  const visible = (id, p, cut) => {
    if (['core', 'radiative', 'convective'].includes(id)) return cut < 0.12;
    if (id === 'chromosphere' || id === 'corona') return true;
    // on the near side, and not inside the removed wedge
    tmp.copy(camera.position).sub(p);
    const facing = p.clone().normalize().dot(tmp.normalize()) > 0.12;
    const inCut = p.x > cut && p.y > cut && p.z > cut;
    return facing && !inCut;
  };

  // ---------- Layout, input, loop ----------
  let W = 1, H = 1, narrow = false;
  function resize() {
    const r = plate.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    narrow = W < 560;
    plate.classList.toggle('narrow', narrow);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // Keep the disc at ~26% of the width on wide plates, larger on phones.
    const frac = narrow ? 0.34 : 0.235;
    const halfW = 1 / frac / 2;
    camera.fov = 2 * Math.atan(halfW / camera.aspect / DIST) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const id in labels) labels[id].h = 0;
  }

  const REST = {yaw: 0.72, pitch: 0.42};
  const view = {yaw: REST.yaw, pitch: REST.pitch};
  let dragging = null, lastInput = -1e9;
  canvas.addEventListener('pointerdown', e => { dragging = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); lastInput = performance.now(); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    view.yaw -= (e.clientX - dragging[0]) * 0.008; view.pitch = Math.max(-1.2, Math.min(1.2, view.pitch + (e.clientY - dragging[1]) * 0.006));
    dragging = [e.clientX, e.clientY]; lastInput = performance.now();
  });
  const stop = () => { dragging = null; lastInput = performance.now(); };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const fixedT = params.has('sunT') ? Number(params.get('sunT')) : null;
  const DAYS_PER_SEC = 0.35;
  let open = true, cutFrom = 1, cutTo = 0, cutT0 = performance.now() + 500;
  const btns = plate.parentElement.querySelectorAll('[data-sun]');
  btns.forEach(b => b.addEventListener('click', () => {
    const want = b.dataset.sun === 'open';
    if (want === open) return;
    open = want; cutFrom = common.uCut.value; cutTo = open ? 0 : 1; cutT0 = performance.now();
    btns.forEach(x => x.classList.toggle('on', (x.dataset.sun === 'open') === open));
    kick();
  }));
  btns.forEach(x => x.classList.toggle('on', (x.dataset.sun === 'open') === open));

  // Readouts under the plate, from the model.
  const lt = lightTime(new Date());
  const lightEl = plate.parentElement.querySelector('[data-sun-light]');
  if (lightEl) lightEl.textContent = `Light leaving the Sun now reaches Warsaw in ${lt.min} min ${String(lt.sec).padStart(2, '0')} s. Earth is ${lt.au.toFixed(4)} AU away today.`;
  const rotEl = plate.parentElement.querySelector('[data-sun-rot]');
  if (rotEl) rotEl.textContent = `The surface turns at its real rates, sped up: once in ${periodDays(0).toFixed(1)} days at the equator, ${periodDays(75 * deg).toFixed(0)} days near the poles.`;

  let start = performance.now(), running = true, raf = 0;
  function frame(now) {
    raf = 0;
    const sec = fixedT ?? (reduced ? 20 : (now - start) / 1000);
    const days = sec * DAYS_PER_SEC;
    // Cut animation
    let cut;
    if (fixedT != null) cut = params.get('closed') != null ? 1 : 0;
    else if (reduced) cut = cutTo;
    else { const k = Math.min(1, Math.max(0, (now - cutT0) / 1600)); cut = cutFrom + (cutTo - cutFrom) * ease(k); }
    // Ease the view back to rest after 8 s without input.
    if (!dragging && now - lastInput > 8000) { view.yaw += (REST.yaw - view.yaw) * 0.02; view.pitch += (REST.pitch - view.pitch) * 0.02; }
    camera.position.set(DIST * Math.sin(view.yaw) * Math.cos(view.pitch), DIST * Math.sin(view.pitch), DIST * Math.cos(view.yaw) * Math.cos(view.pitch));
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();

    common.uDays.value = days; common.uSec.value = sec; common.uCut.value = cut;
    corona.material.uniforms.uLimb.value = 1 / Math.sqrt(1 - 1 / (DIST * DIST));
    placeFaces(cut);
    faces.forEach(f => f.visible = cut < 0.995);
    walkLine.position.y = cut + 0.003; walkLine.visible = cut < 0.05;
    loops.rotation.y = omegaDegPerDay(pairLat * deg) * deg * days;
    const mid = A.lon * deg - omegaDegPerDay(pairLat * deg) * deg * days;
    const mp = dir(pairLat, mid / deg);
    loops.visible = !(mp.x > cut - 0.15 && mp.y > cut - 0.15 && mp.z > cut - 0.15);

    renderer.render(scene, camera);
    drawLabels(anchors(cut, days), cut);
    if (running && !reduced && fixedT == null) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function drawLabels(an, cut) {
    let s = '';
    const colW = Math.min(190, W * 0.24), gap = 10;
    const place = (ids, side) => {
      let y = 16;
      const slot = (H - 32) / ids.length;
      ids.forEach((id, i) => {
        const L = labels[id], p = an[id];
        const on = visible(id, p, cut) && (id !== 'loops' || loops.visible);
        tmp.copy(p).project(camera);
        const ax = (tmp.x * 0.5 + 0.5) * W, ay = (-tmp.y * 0.5 + 0.5) * H;
        const inner = ['core', 'radiative', 'convective'].includes(id);
        L.el.style.opacity = on ? 1 : inner ? 0 : 0.28;
        if (narrow) {
          // Numbered marker at the anchor; full text sits in the legend below.
          L.el.style.transform = `translate(${ax - 9}px, ${ay - 9}px)`;
          L.el.style.display = on ? 'block' : 'none';
          return;
        }
        L.el.style.display = 'block';
        L.el.style.width = colW + 'px';
        if (!L.h) L.h = L.el.offsetHeight;
        const ly = Math.min(H - L.h - 8, 16 + slot * i + (slot - L.h) / 2);
        const lx = side === 'L' ? 0 : W - colW;
        L.el.style.transform = `translate(${lx}px, ${ly}px)`;
        if (on) {
          const ex = side === 'L' ? lx + colW + gap : lx - gap, ey = ly + 9;
          s += `<polyline points="${ex},${ey} ${ex + (side === 'L' ? 14 : -14)},${ey} ${ax},${ay}" class="${id === 'core' ? 'accent' : ''}"/><circle cx="${ax}" cy="${ay}" r="3" class="${id === 'core' ? 'accent' : ''}"/>`;
        }
      });
    };
    place(ORDER_L, 'L'); place(ORDER_R, 'R');
    // Earth to scale, next to the disc's own measured radius.
    const rp = tmp.copy(right).multiplyScalar(1).project(camera);
    const rPx = Math.abs(rp.x) * 0.5 * W;
    const er = Math.max(0.6, rPx * EARTH_SCALE);
    const ex = W / 2 + rPx * (narrow ? 0.0 : 0.0), ey = H - 22;
    s += `<circle cx="${ex - 66}" cy="${ey}" r="${er}" class="earth"/><text x="${ex - 56}" y="${ey + 4}" class="earth-t">Earth, to scale</text>`;
    svg.innerHTML = s;
  }

  resize();
  new ResizeObserver(() => { resize(); kick(); }).observe(plate);
  new IntersectionObserver(es => { running = es[0].isIntersecting; if (running) kick(); }).observe(plate);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) kick(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    const t = readTokens();
    common.uPaper.value.set(t.paper); common.uInk.value.set(t.ink); common.uAccent.value.set(t.accent);
    lineMat.color.set(t.ink); walkLine.material.color.set(t.ink); kick();
  });
  canvas.addEventListener('pointermove', kick);
  kick();
  return {renderer};
}

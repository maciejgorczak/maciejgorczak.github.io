// The house in real time. With no input it plays film.js as a tour with a
// cursor; any click, drag, wheel or key hands control over, and 25 s of
// quiet hands it back. ?film turns the page into a pure render(t) for capture.
import {createStage, readTokens, TIERS} from './stage.js';
import {createConsole} from './console.js';
import {readings, dayTable, glassMidColumn, sunPos, DATES, dateById} from './sun.js';
import {tourAt, VIEWS, DURATION, blendCam, cutFor, VIEW_CALLOUTS, isCut, CUT_FADE} from './film.js';
import {EASE_MOVE, clamp} from './util.js';

const params = new URLSearchParams(location.search);
const FILM = params.has('film');
const IDLE_MS = 25000;
if (FILM || params.get('theme') === 'light') document.documentElement.dataset.theme = 'light';

const canvas = document.getElementById('scene');
const ui = createConsole();
const stage = await createStage(canvas, {tier: Number(params.get('tier') || 0), tokens: readTokens()});

// Day tables (PV kWh, hours of sun on the glass), integrated once per date.
for (const d of DATES) dayTable(d.day);

// ---------- One frame's state, from (date, hour, mode, cut, t) ----------
let cache = {key: null};
function sceneState({date, hour, mode, cut, t, view, captionText = '', captionK = 0, pressing = null, playing = false, touring = false}) {
  const d = dateById(date);
  const key = `${d.day}|${hour.toFixed(4)}`;
  if (cache.key !== key) {
    const r = readings(d.day, hour);
    cache = {key, r, mid: glassMidColumn(r.dir)};
  }
  return {date: d, hour, mode, cut, t, view, r: cache.r, mid: cache.mid, litCells: cache.r.cells, litKey: key,
          showSun: mode !== 'section' && (view === 'aerial' || view === 'roof'), showLit: true, sunAt: h => sunPos(d.day, h),
          captionText, captionK, pressing, playing, touring};
}

const tables = Object.fromEntries(DATES.map(d => [d.id, dayTable(d.day)]));
const captionCtx = {
  table: id => tables[id],
  noonAlt: id => sunPos(dateById(id).day, 12).alt,
  rain: null, kwp: null,
};
{
  const {rainCatch, PV_KWP} = await import('./house.js');
  captionCtx.rain = rainCatch(); captionCtx.kwp = PV_KWP;
}

// Portrait screens: wider field of view, scene pushed up above the panels.
function adaptCam(cam) {
  const L = ui.layout();
  if (!L.port) return cam;
  const f = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * 1.65) * 180 / Math.PI;
  return {...cam, fov: Math.min(f, 80)};
}

function layoutAll() {
  const w = window.innerWidth, h = window.innerHeight;
  const L = ui.setLayout(w, h);
  stage.resize(w, h, L.port ? 0.15 : 0);
}
window.addEventListener('resize', layoutAll);
layoutAll();

const fadeEl = document.getElementById('fade');
function draw(st, cam, tourBits) {
  stage.frame(st, adaptCam(cam));
  fadeEl.style.opacity = tourBits.fade || 0;
  ui.update(st, tables[st.date.id]);
  ui.callouts(tourBits.callouts, tourBits.calloutK, stage.project);
  ui.cursor(tourBits.cursor, tourBits.cursorOn);
}

function tourFrame(t) {
  const s = tourAt(t);
  const st = sceneState({date: s.date, hour: s.hour, mode: s.mode, cut: s.cut, t, view: s.view,
    captionText: s.caption ? s.caption(captionCtx) : '', captionK: s.captionK,
    pressing: s.cursor.click > 0.2 ? s.cursor.to : null, touring: true});
  return {st, cam: s.cam, bits: {callouts: s.callouts, calloutK: s.fade > 0 ? 0 : s.calloutK, cursor: s.cursor, cursorOn: true, fade: s.fade}, s};
}

await document.fonts.ready;

// ---------------- Film mode: render(t) is pure ----------------
if (FILM) {
  const f0 = tourFrame(0);
  await stage.warmUp(f0.st, f0.cam);
  window.__duration = DURATION;
  window.__render = t => { const f = tourFrame(t); draw(f.st, f.cam, f.bits); return true; };
  window.__render(0);
  document.getElementById('loading').remove();
  window.__ready = true;
} else {
  runLive();
}

// ---------------- Live ----------------
async function runLive() {
  const f0 = tourFrame(0);
  await stage.warmUp(f0.st, f0.cam);
  document.getElementById('loading').classList.add('done');

  const init = ['date', 'hour', 'view', 'mode'].some(k => params.has(k));
  let touring = !params.has('notour') && !init;
  let tourStart = performance.now(), lastInput = -1e9;
  let blendFrom = null;          // camera to ease from when the tour takes back over
  const user = {date: 'mar', hour: 12, mode: 'solid', view: 'aerial', playing: false,
                cam: {...VIEWS.aerial}, camFrom: null, camTo: null, camT0: 0, cut: 1e4, cutFrom: 16, modeT0: -1e9};
  let shown = null;              // what is on screen now (for hand-over)
  if (init) {
    if (DATES.some(d => d.id === params.get('date'))) user.date = params.get('date');
    if (params.has('hour')) user.hour = clamp(Number(params.get('hour')) || 12, 5, 19);
    const v = params.get('view'); if (VIEWS[v]) { user.view = v; user.cam = {...VIEWS[v]}; }
    const m = params.get('mode');
    if (m === 'section') { user.mode = 'section'; user.cut = 0.6; user.cutFrom = 0.6; user.view = 'section'; user.cam = {...VIEWS.section}; }
    if (m === 'xray') user.mode = 'xray';
    lastInput = performance.now();
  }

  function takeOver() {
    lastInput = performance.now();
    if (!touring) return;
    touring = false;
    const s = shown;
    user.date = s.date; user.hour = s.hour; user.mode = s.mode; user.view = s.view;
    user.cam = {...s.cam}; user.camTo = null; user.cut = s.cut; user.cutFrom = s.cut > 100 ? 16 : s.cut; user.modeT0 = -1e9;
    user.playing = false;
  }

  function goView(id, now) {
    user.fromView = user.view; user.camFrom = {...user.cam}; user.camTo = id; user.camT0 = now; user.view = id;
  }
  function setMode(id, now) {
    const k = clamp((now - user.modeT0) / 1400, 0, 1);
    const c = cutFor(user.mode, user.cutFrom, k); user.cutFrom = c > 100 ? 16 : c;
    user.mode = id; user.modeT0 = now;
    if (id === 'section') goView('section', now);
    else if (user.view === 'section') goView('aerial', now);
  }
  function press(p) {
    const now = performance.now();
    const [kind, id] = p.split(':');
    if (kind === 'date') user.date = id;
    if (kind === 'view') { if (user.mode === 'section') setMode('solid', now); goView(id, now); }
    if (kind === 'mode') setMode(id, now);
    if (kind === 'play') user.playing = !user.playing;
  }

  for (const b of ui.buttons) b.addEventListener('click', e => { takeOver(); press(b.dataset.press); e.stopPropagation(); });
  const hourInput = document.getElementById('hour');
  hourInput.addEventListener('input', () => { takeOver(); user.hour = Number(hourInput.value); user.playing = false; });

  // Orbit, zoom, pinch.
  const ptrs = new Map(); let pinch0 = null;
  canvas.addEventListener('pointerdown', e => { takeOver(); canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); canvas.classList.add('dragging'); user.camTo = null; });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    lastInput = performance.now();
    if (ptrs.size === 1) {
      user.cam.yaw -= (e.clientX - prev[0]) * 0.006;
      user.cam.pitch = clamp(user.cam.pitch + (e.clientY - prev[1]) * 0.004, -0.6, 1.45);
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch0) user.cam.dist = clamp(user.cam.dist * pinch0 / d, 5, 90);
      pinch0 = d;
    }
  });
  const up = e => { ptrs.delete(e.pointerId); pinch0 = null; if (!ptrs.size) canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); takeOver(); user.camTo = null; user.cam.dist = clamp(user.cam.dist * Math.exp(e.deltaY * 0.001), 5, 90); }, {passive: false});
  window.addEventListener('keydown', e => {
    const k = e.key;
    const map = {'1': 'view:aerial', '2': 'view:garden', '3': 'view:patio', '4': 'view:roof', 's': 'mode:section', 'x': 'mode:xray', 'o': 'mode:solid'};
    if (k === 'ArrowLeft' || k === 'ArrowRight') { takeOver(); user.playing = false; user.hour = clamp(user.hour + (k === 'ArrowRight' ? 0.25 : -0.25), 5, 19); e.preventDefault(); }
    else if (k === ' ') { takeOver(); press('play'); e.preventDefault(); }
    else if (map[k]) { takeOver(); press(map[k]); }
  });

  // Quality: step down a tier if frames are slow.
  let tier = Number(params.get('tier') || 0), frames = 0, acc = 0, settle = 0;
  let prev = performance.now(), clock = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now; clock += dt;
    if (!touring && now - lastInput > IDLE_MS && !params.has('notour')) {
      touring = true; tourStart = now; blendFrom = {...user.cam};
    }
    if (touring) {
      const t = ((now - tourStart) / 1000) % DURATION;
      const f = tourFrame(t);
      if (blendFrom) { const k = EASE_MOVE(clamp((now - tourStart) / 1800, 0, 1)); f.cam = blendCam(blendFrom, f.cam, k); if (k >= 1) blendFrom = null; }
      shown = {date: f.s.date, hour: f.s.hour, mode: f.s.mode, view: f.s.view, cam: f.cam, cut: f.s.cut};
      draw(f.st, f.cam, f.bits);
    } else {
      if (user.playing) { user.hour += dt * 0.45; if (user.hour > 19) user.hour = 5; }
      let fade = 0;
      if (user.camTo) {
        if (isCut(user.fromView, user.camTo)) {
          const raw = clamp((now - user.camT0) / (CUT_FADE * 1000), 0, 1);
          fade = Math.sin(Math.PI * raw);
          if (raw >= 0.5) user.cam = {...VIEWS[user.camTo]};
          if (raw >= 1) user.camTo = null;
        } else {
          const k = EASE_MOVE(clamp((now - user.camT0) / 1600, 0, 1));
          user.cam = blendCam(user.camFrom, VIEWS[user.camTo], k);
          if (k >= 1) user.camTo = null;
        }
      }
      const cut = cutFor(user.mode, user.cutFrom, (now - user.modeT0) / 1400);
      const st = sceneState({date: user.date, hour: user.hour, mode: user.mode, cut, t: clock, view: user.view, playing: user.playing});
      shown = {...user, cam: {...user.cam}, cut};
      const L = ui.layout();
      draw(st, user.cam, {callouts: (L.port ? null : (user.camTo ? null : calloutsFor(user.view))), calloutK: 1, cursor: null, cursorOn: false, fade});
    }
    // Tier check over ~2 s windows after the first second.
    if (now > 1500 + settle) {
      acc += dt; frames++;
      if (frames >= 120) {
        const ms = acc / frames * 1000; frames = 0; acc = 0;
        if (ms > 26 && tier < TIERS.length - 1) { tier++; stage.setTier(tier); settle = now; }
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

const calloutsFor = view => VIEW_CALLOUTS[view];

// Theme changes: re-read tokens for the canvases (3D backdrop keeps its first read).
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => ui.readColors());

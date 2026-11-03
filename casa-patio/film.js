// The operator's script. The film, the live page's auto tour and the score
// all read this one file. tourAt(t) is a pure function of time.
import {EASE_MOVE, EASE_IN, clamp, lerp} from './util.js';

export const VIEWS = {
  aerial:  {target: [0, 2.0, 0.5], yaw: 0.72, pitch: 0.5, dist: 56, fov: 30, drift: 0.008},
  garden:  {target: [0.4, 3.9, 7.0], yaw: 0.26, pitch: 0.1, dist: 38, fov: 32, drift: -0.004},
  patio:   {target: [-0.3, 4.2, -3.2], yaw: 0.347, pitch: -0.385, dist: 6.66, fov: 60, drift: 0.004},
  section: {target: [-0.5, 2.4, 0.6], yaw: Math.PI / 2, pitch: 0.08, dist: 33, fov: 32, drift: 0.0},
  roof:    {target: [1.0, 7.2, 3.6], yaw: -0.55, pitch: 0.55, dist: 19, fov: 38, drift: 0.006},
};
export const VIEW_IDS = ['aerial', 'garden', 'patio', 'section', 'roof'];
export const MODE_IDS = ['solid', 'section', 'xray'];
export const SECTION_CUT = 0.6;

// Which callouts each view shows.
export const VIEW_CALLOUTS = {
  aerial: ['overhang', 'celosia', 'pv'],
  garden: ['overhang', 'celosia', 'cantilever'],
  patio: ['jacaranda', 'bridge'],
  section: ['cistern', 'stair', 'patio'],
  roof: ['pv', 'greenroof'],
};

// Beats. `press` is a button the cursor goes to and clicks at time t.
// Captions are functions of the numbers so they cannot disagree with the panels.
export const SCRIPT = [
  {t: 0.0, set: {view: 'aerial', date: 'mar', mode: 'solid'},
   caption: () => 'A concrete house around a patio. Everything here follows the sun.'},
  {t: 5.0, press: 'view:garden',
   caption: () => 'The south glass sits 1.6 m behind the concrete frame.'},
  {t: 9.5,
   caption: k => `March 20: direct sun on that glass for about ${Math.round(k.table('mar').glassHours * 60)} minutes all day.`},
  {t: 14.0, press: 'date:jun',
   caption: k => `June 21: noon sun is ${(90 - k.noonAlt('jun')).toFixed(0)}° north of overhead. No direct sun on the south glass.`},
  {t: 20.0, press: 'date:dec',
   caption: k => `December 21: the sun stays low and gets under the frame. ${k.table('dec').glassHours.toFixed(1)} h of sun on the glass.`},
  {t: 27.0, press: 'mode:section',
   caption: k => `Section: patio, stair and a ${k.rain.tankM3.toFixed(0)} m³ cistern under the paving.`},
  {t: 33.5, press: 'mode:solid'},
  {t: 34.5, press: 'view:patio'},
  {t: 35.5, press: 'date:mar',
   caption: () => 'In the patio, March: the jacaranda in bloom, the bridge overhead.'},
  {t: 41.5, press: 'view:roof',
   caption: k => `${k.kwp} kWp on the roof. Clear-sky estimate for March 20: ${k.table('mar').kwh.toFixed(0)} kWh.`},
  {t: 47.5, press: 'view:aerial',
   caption: k => `Rain: ${k.rain.hardM2.toFixed(0)} m² of hard roof catches about ${(Math.round(k.rain.m3PerYear / 5) * 5)} m³ a year.`},
  {t: 53.5, end: true},
];
export const DURATION = 53.5;

// Solar hour over the tour. Pairs of [t, hour, ease]: linear unless 'move'.
// Two keys at the same t make a jump; 'move' eases into the key.
export const HOURS = [
  [0, 8.0], [5.0, 10.5], [14.0, 15.5],
  [14.0, 15.5], [15.0, 11.0, 'move'], [20.0, 13.0],
  [21.0, 9.0, 'move'], [27.0, 12.0],
  [28.2, 13.0, 'move'], [34.5, 14.5],
  [36.3, 10.5, 'move'], [41.5, 11.5],
  [47.5, 15.5], [53.5, 17.0],
];

export function hourAt(t) {
  if (t <= HOURS[0][0]) return HOURS[0][1];
  for (let i = 1; i < HOURS.length; i++) {
    const [t1, h1, e] = HOURS[i], [t0, h0] = HOURS[i - 1];
    if (t <= t1) {
      if (t1 === t0) return h1;
      const k = (t - t0) / (t1 - t0);
      return lerp(h0, h1, e === 'move' ? EASE_MOVE(k) : k);
    }
  }
  return HOURS[HOURS.length - 1][1];
}

const MOVE_T = 1.8, CUT_T = 1.4, CAP_IN = 0.45;
export const CUT_FADE = 1.0;
// Views inside the house are entered with a short fade, so the camera never flies through a wall.
export const isCut = (a, b) => a !== b && (a === 'patio' || b === 'patio');

export function viewAt(id, t0, t) {
  const v = VIEWS[id];
  return {...v, yaw: v.yaw + v.drift * Math.max(0, t - t0)};
}

export function blendCam(a, b, k) {
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  return {
    target: a.target.map((x, i) => lerp(x, b.target[i], k)),
    yaw: a.yaw + dy * k, pitch: lerp(a.pitch, b.pitch, k),
    dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), k)), fov: lerp(a.fov, b.fov, k),
  };
}

export function cutFor(mode, fromCut, k) {
  const to = mode === 'section' ? SECTION_CUT : 16;
  const c = lerp(fromCut, to, EASE_MOVE(clamp(k, 0, 1)));
  return c >= 15.9 ? 1e4 : c;
}

// The whole operator state at time t.
export function tourAt(t) {
  let view = 'aerial', viewT = 0, prevView = 'aerial', prevViewT = 0;
  let date = 'mar', mode = 'solid', modeT = -10, prevCut = 16;
  let caption = null, captionT = 0, lastPress = null, lastPressT = -10;
  for (const b of SCRIPT) {
    if (b.t > t) break;
    if (b.set) { view = b.set.view; date = b.set.date; mode = b.set.mode; viewT = prevViewT = b.t; prevView = view; }
    if (b.press) {
      const [kind, id] = b.press.split(':');
      if (kind === 'view') { prevView = view; prevViewT = viewT; view = id; viewT = b.t; }
      if (kind === 'date') date = id;
      if (kind === 'mode') {
        const k = clamp((b.t - modeT) / CUT_T, 0, 1);
        prevCut = cutFor(mode, prevCut, k); if (prevCut > 100) prevCut = 16;
        mode = id; modeT = b.t;
        if (id === 'section') { prevView = view; prevViewT = viewT; view = 'section'; viewT = b.t; }
      }
      lastPress = b.press; lastPressT = b.t;
    }
    if (b.caption) { caption = b.caption; captionT = b.t; }
  }
  // Camera: ease from the previous view (as it was drifting) to the current.
  let cam, fade = 0;
  if (isCut(prevView, view)) {
    const raw = clamp((t - viewT) / CUT_FADE, 0, 1);
    fade = raw < 1 ? Math.sin(Math.PI * raw) : 0;
    cam = raw < 0.5 ? viewAt(prevView, prevViewT, t) : viewAt(view, viewT, t);
  } else {
    const k = EASE_MOVE(clamp((t - viewT) / MOVE_T, 0, 1));
    cam = k >= 1 ? viewAt(view, viewT, t) : blendCam(viewAt(prevView, prevViewT, viewT), viewAt(view, viewT, t), k);
  }
  const cut = cutFor(mode, prevCut, (t - modeT) / CUT_T);
  // Cursor: travels to the next press, clicks, then rests.
  const next = SCRIPT.find(b => b.press && b.t > t - 0.0001);
  let cursor = {from: lastPress, to: lastPress, k: 1, click: clamp(1 - (t - lastPressT) / 0.45, 0, 1)};
  if (next && next.t - t < 1.1) cursor = {from: lastPress, to: next.press, k: EASE_IN(clamp(1 - (next.t - t - 0.15) / 0.95, 0, 1)), click: 0};
  const capK = EASE_IN(clamp((t - captionT) / CAP_IN, 0, 1));
  return {view, date, mode, hour: hourAt(t), cam, fade, cut, caption, captionK: capK, captionT, cursor,
          callouts: VIEW_CALLOUTS[view], calloutK: EASE_IN(clamp((t - viewT - 0.9) / 0.6, 0, 1))};
}

// Beats in seconds, for the score and the review sheets.
export function timeline() {
  return {duration: DURATION, beats: SCRIPT.map(b => ({t: b.t, press: b.press || null, end: !!b.end, caption: !!b.caption}))};
}

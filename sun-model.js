// The Sun as numbers. No three.js in here: the 3D plate and its labels both
// read from this file, so a label can't disagree with what is drawn.
// Radii are in solar radii (R = 696,000 km).

export const R_KM = 696000;

export const LAYERS = {
  core:       {r0: 0,    r1: 0.25},   // fusion happens here
  radiative:  {r0: 0.25, r1: 0.70},   // energy moves out as scattered light
  tachocline: {r: 0.70},              // shear layer between the two zones
  convective: {r0: 0.70, r1: 1.0},    // energy moves out by rising and sinking plasma
  chromosphere: {r1: 1.003},          // ~2,000 km thick
};

// Labels: one line each, with the numbers they rest on.
// Mass to light: L / c^2 = 3.828e26 W / (2.998e8 m/s)^2 = 4.26e9 kg/s.
export const FACTS = {
  core:        {title: 'Core', body: 'About 15 million K. Fusion turns ~4 million tonnes of mass into light every second.'},
  radiative:   {title: 'Radiative zone', body: 'Light is absorbed and re-emitted over and over. Estimates for the trip out run from about 10,000 to 170,000 years.'},
  convective:  {title: 'Convective zone', body: 'The outer 30%. Hot plasma rises, cools at the top and sinks again.'},
  photosphere: {title: 'Photosphere', body: 'The surface we see, about 5,800 K. Darker at the edge because we look through cooler layers there.'},
  granules:    {title: 'Granules', body: 'Tops of convection cells, about 1,000-1,500 km across. Each lasts minutes.'},
  sunspot:     {title: 'Sunspots', body: 'Cooler, so darker: around 3,500-4,500 K in the centre. Strong magnetic fields hold back the heat.'},
  loops:       {title: 'Coronal loops', body: 'Hot plasma traces the magnetic field arching between spots.'},
  chromosphere:{title: 'Chromosphere', body: 'A thin layer, about 2,000 km, with jets called spicules.'},
  corona:      {title: 'Corona', body: '1-3 million K, far hotter than the surface. Why is still an open question.'},
};

// Differential rotation (Snodgrass & Ulrich 1990, sidereal), degrees per day.
// Equator: 14.71 deg/day, ~24.5 days a turn. Near the poles: ~34 days.
export function omegaDegPerDay(latRad) {
  const s2 = Math.sin(latRad) ** 2;
  return 14.713 - 2.396 * s2 - 1.787 * s2 * s2;
}
export const periodDays = latRad => 360 / omegaDegPerDay(latRad);

// One active region: a leading and a following spot at the same latitude,
// in the sunspot belt (spots form between about 5 and 35 degrees).
export const SPOTS = [
  {lat: -14, lon: 92, r: 0.075},     // leader (ahead in the direction of rotation)
  {lat: -17, lon: 112, r: 0.06},     // follower
  {lat: -14, lon: 84, r: 0.022},
  {lat: 13, lon: 250, r: 0.05},
  {lat: 11, lon: 262, r: 0.03},
  {lat: -24, lon: 200, r: 0.04},
];

// Earth-Sun distance (AU) for a date, from the mean anomaly (USNO approximation).
export function sunDistanceAU(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const g = (357.529 + 0.98560028 * (jd - 2451545.0)) * Math.PI / 180;
  return 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
}
export const LIGHT_SECONDS_PER_AU = 499.004784;
export function lightTime(date = new Date()) {
  const s = sunDistanceAU(date) * LIGHT_SECONDS_PER_AU;
  return {seconds: s, min: Math.floor(s / 60), sec: Math.round(s % 60), au: sunDistanceAU(date)};
}

// Sun diameter over Earth diameter: 1,392,700 km / 12,742 km.
export const EARTH_SCALE = 12742 / 1392700;

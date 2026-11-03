# Patio house, Mexico City

An original design study: an eco-brutalist concrete house around a patio in
Mexico City (19.43° N, 2,240 m), built in three.js. Not a real building.

One input drives everything: the sun at a date and solar time. The shadows,
the "south glass in direct sun" share, the PV estimate and the captions all
come from the same functions, so the panels can't disagree with the picture.

| File | Job |
|---|---|
| `house.js` | The building as data: a parameter block and a list of boxes, in metres. Rain catch and areas are read off the boxes. |
| `sun.js` | Solar position, clear-sky irradiance (Meinel with altitude correction), ray casting against the boxes for the glass and the PV. |
| `model3d.js` | three.js geometry built from the same boxes, plus planting, the jacaranda, section caps. |
| `stage.js` | Renderer, light, shadows, AO, quality tiers. |
| `console.js` / `console.css` | The overlay: panels, charts, callouts, the tour cursor. |
| `film.js` | The tour script. `tourAt(t)` is a pure function of time. |
| `live.js` | The live page. Plays the tour until you touch it; 25 s of quiet hands it back. `?film` turns it into `render(t)` for capture. |
| `tools/` | `capture.mjs` (stills, sheets, video), `timeline.mjs`, `score.py`. |

URL options: `?date=dec&hour=10&view=garden&mode=xray`, `?notour`, `?tier=1`.

## Limits, said plainly

- Solar time, not clock time. Clear sky, no haze or cloud. Real Mexico City
  output will be lower, often a lot lower in the rainy season.
- PV shading is area-weighted; it ignores string and bypass-diode effects.
- Rain uses about 670 mm/yr, a citywide 1970-2000 average from a gridded
  dataset (WorldClim 2.1), and 80% runoff from the hard roofs. Local station
  totals differ.
- The jacaranda and planting are drawn, not ray-cast. The tree is kept below
  the PV and the balcony planting is bounded by a box the ray cast does see.

## Render the film

```bash
node casa-patio/tools/timeline.mjs
node casa-patio/tools/capture.mjs --stills beats --cols 3 --out teardown-out/beats.png
node casa-patio/tools/capture.mjs --fps 30 --dpr 1.2 --tier 1 --out teardown-out/silent.mp4
python3 casa-patio/tools/score.py teardown-out/score.wav
ffmpeg -y -i teardown-out/silent.mp4 -i teardown-out/score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart teardown-out/casa-patio.mp4
```

three.js r170 is vendored in `/vendor/three`, shared with the Sun page (MIT, see its LICENSE).

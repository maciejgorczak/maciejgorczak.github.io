// Render stills, contact sheets or a silent video of the tour.
// Serves the site root locally, opens casa-patio/?film, calls window.__render(t).
//
//   node casa-patio/tools/capture.mjs --still 12.5 --out out/still.png
//   node casa-patio/tools/capture.mjs --stills beats --cols 4 --out out/beats.png
//   node casa-patio/tools/capture.mjs --stills every:0.2 --from 4 --to 7 --out out/zoom.png
//   node casa-patio/tools/capture.mjs --fps 30 --out out/silent.mp4
//   node casa-patio/tools/capture.mjs --page "?notour" --still 0 --out out/live.png   (live page)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [W, H] = arg('size', '1600x900').split('x').map(Number);
const dpr = Number(arg('dpr', '1.2'));
const out = path.resolve(arg('out', 'teardown-out/frame.png'));
fs.mkdirSync(path.dirname(out), {recursive: true});

const types = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: dpr});
page.setDefaultTimeout(180000);
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const live = arg('page', null);
await page.goto(`http://localhost:${port}/casa-patio/${live ?? '?film' + (arg('tier') ? '&tier=' + arg('tier') : '')}`);
const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info');
  return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('GPU:', gpu);

if (live != null) {
  await page.waitForTimeout(Number(arg('wait', '4000')));
  await page.screenshot({path: out});
  console.log('wrote', out); await browser.close(); server.close(); process.exit(0);
}

await page.waitForFunction(() => window.__ready === true, null, {timeout: 120000});
const duration = await page.evaluate(() => window.__duration);
const render = async t => { await page.evaluate(t => window.__render(t), t); };

const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'casa-patio/film/timeline.json'), 'utf8'));

async function sheet(times, cols) {
  const tiles = [];
  for (const t of times) {
    await render(t);
    const buf = await page.screenshot({type: 'jpeg', quality: 82});
    tiles.push({t, b64: buf.toString('base64')});
    process.stdout.write('.');
  }
  // Compose the sheet in a second page.
  const tw = Math.round(W * 0.5), th = Math.round(H * 0.5);
  const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:4px;padding:4px;font:600 16px monospace">` +
    tiles.map(x => `<div style="position:relative"><img src="data:image/jpeg;base64,${x.b64}" style="width:${tw}px;height:${th}px;display:block"><span style="position:absolute;left:6px;top:6px;background:#000;color:#fff;padding:2px 6px">t=${x.t.toFixed(2)}</span></div>`).join('') + '</body>';
  const p2 = await browser.newPage({viewport: {width: cols * (tw + 4) + 4, height: 200}, deviceScaleFactor: 1});
  await p2.setContent(html);
  await p2.screenshot({path: out, fullPage: true});
  console.log('\nwrote', out);
}

const still = arg('still', null), stills = arg('stills', null);
if (still != null) {
  await render(Number(still));
  await page.screenshot({path: out});
  console.log('wrote', out);
} else if (stills) {
  let times;
  if (stills === 'beats') times = timeline.beats.filter(b => !b.end).map(b => Math.min(b.t + 0.3 + (b.press ? 2.0 : 0.6), duration - 0.05));
  else if (stills.startsWith('every:')) {
    const step = Number(stills.slice(6)), a = Number(arg('from', '0')), b = Number(arg('to', String(duration)));
    times = []; for (let t = a; t <= b + 1e-6; t += step) times.push(t);
  }
  await sheet(times, Number(arg('cols', '4')));
} else {
  // Video: pipe JPEG frames into ffmpeg.
  const fps = Number(arg('fps', '30')), N = Math.round(duration * fps);
  // --seg i/n renders one slice, so several processes can share the work.
  const [si, sn] = (arg('seg', '0/1')).split('/').map(Number);
  const f0 = Math.floor(N * si / sn), f1 = Math.floor(N * (si + 1) / sn), n = f1 - f0;
  const ff = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await render((f0 + i) / fps);
    const buf = await page.screenshot({type: 'jpeg', quality: 92});
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 30 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s/frame`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close(); server.close();

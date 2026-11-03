// Studio, lights, shadows, post. frame(state, cam) draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {buildModel} from './model3d.js';
import {clamp, lerp} from './util.js';

export const TIERS = [
  {name: 'high', dpr: 2, shadow: 4096, ao: true},
  {name: 'mid', dpr: 1.5, shadow: 2048, ao: false},
  {name: 'low', dpr: 1, shadow: 1024, ao: false},
];

export function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim() || null;
  return {bg: v('--bg') || '#e8e2d1', ink: v('--ink') || '#2b2a1e', accent: v('--accent') || '#5b6a26',
          ground: v('--scene-ground') || '#cfc6ad', dark: matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.dataset.light};
}

export async function createStage(canvas, {tier = 0, tokens = readTokens()} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false});
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const bg = new THREE.Color(tokens.bg);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 70, 190);

  // Soft environment for reflections: pale sky over sand.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(10, 32, 16);
  const cols = [], top = new THREE.Color(0xf4f1e8), hor = new THREE.Color(0xd9d2bf), bot = new THREE.Color(0x8c836d);
  const pa = envGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const y = pa.getY(i) / 10; const c = y > 0 ? hor.clone().lerp(top, y) : hor.clone().lerp(bot, -y * 2); cols.push(c.r, c.g, c.b); }
  envGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  envScene.add(new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide})));
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight(0xeeeadf, 0x8a8170, 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3); scene.add(sun); scene.add(sun.target);
  sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -21; sc.right = 21; sc.top = 21; sc.bottom = -21; sc.near = 1; sc.far = 110;
  sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 3, 0);

  const model = buildModel(tokens);
  scene.add(model.root);

  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 400);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const gtao = new GTAOPass(scene, camera, 16, 9);
  gtao.updateGtaoMaterial({radius: 0.9, distanceExponent: 1.6, thickness: 1.5, scale: 1.0, samples: 16});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  gtao.blendIntensity = 0.85;
  gtao.normalMaterial.clippingPlanes = model.planes;
  // Transparent and alpha-tested parts would print solid in the normal pass.
  const ro = gtao.renderOverride.bind(gtao);
  gtao.renderOverride = (...a) => { const v = model.noAO.map(o => o.visible); model.noAO.forEach(o => o.visible = false); ro(...a); model.noAO.forEach((o, i) => o.visible = v[i]); };
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  let T = TIERS[tier], size = [16, 9], viewY = 0;
  function setTier(i) {
    T = TIERS[clamp(i, 0, TIERS.length - 1)];
    if (sun.shadow.mapSize.x !== T.shadow) {
      sun.shadow.mapSize.set(T.shadow, T.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    gtao.enabled = T.ao;
    resize(...size);
  }
  function resize(w, h, vy = viewY) {
    size = [w, h]; viewY = vy;
    const dpr = Math.min(window.devicePixelRatio || 1, T.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Portrait: push the scene's centre up so the panels below don't cover it.
    if (vy) camera.setViewOffset(w, h, 0, vy * h, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  setTier(tier);

  const tmp = new THREE.Vector3(), warm = new THREE.Color(0xffc995), noon = new THREE.Color(0xfff4e2);
  function frame(st, cam) {
    // Camera from spherical params around a target.
    const {target, yaw, pitch, dist, fov} = cam;
    camera.position.set(target[0] + dist * Math.sin(yaw) * Math.cos(pitch), target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(tmp.set(...target));
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }

    // Sun light from the model's sun vector.
    const d = st.r.dir, alt = st.r.alt;
    const day = clamp((alt + 2) / 10, 0, 1);
    sun.position.set(d[0] * 50, 3 + d[1] * 50, d[2] * 50);
    sun.intensity = 3.1 * clamp(alt / 12, 0, 1);
    sun.color.copy(warm).lerp(noon, clamp((alt - 4) / 35, 0, 1));
    sun.castShadow = alt > 0;
    hemi.intensity = lerp(0.2, 0.62, day);
    scene.environmentIntensity = lerp(0.15, 0.4, day);

    gtao.enabled = T.ao && st.mode !== 'xray';
    model.update(st);
    composer.render();
  }

  // Project a world point to CSS pixels of the canvas.
  const pv = new THREE.Vector3();
  function project(p) {
    pv.set(p[0], p[1], p[2]).project(camera);
    return {x: (pv.x * 0.5 + 0.5) * size[0], y: (-pv.y * 0.5 + 0.5) * size[1], behind: pv.z > 1};
  }

  async function warmUp(st, cam) {
    frame(st, cam);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  }

  return {renderer, scene, camera, frame, resize, setTier, project, warmUp, tier: () => T, model};
}

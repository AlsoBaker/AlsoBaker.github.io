import * as THREE from 'three';
import { generateTree, buildBranchGeometry, buildBlossomData, mulberry32 } from './tree.js';
import {
  barkVert, barkFrag, blossomVert, blossomFrag,
  petalVert, petalFrag, groundVert, groundFrag,
} from './shaders.js';

// The page is a story with ten stops. Each array below gives the value of one
// scene property at each stop; scrolling interpolates between them.
//            hero  about about  work  dusk  proj  proj  wins skills contact
const STORY = {
  bloom:   [0.05, 0.22, 0.44, 0.78, 1.0,  1.0,  1.0,  1.0,  1.0,  1.0],
  fall:    [0.04, 0.05, 0.08, 0.12, 0.2,  0.3,  0.55, 1.0,  0.9,  0.7],
  shed:    [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.08, 0.35, 0.58, 0.78],
  carpet:  [0.0,  0.0,  0.0,  0.02, 0.05, 0.1,  0.25, 0.55, 0.85, 1.0],
  night:   [0.0,  0.0,  0.0,  0.06, 0.6,  1.0,  1.0,  1.0,  1.0,  1.0],
};

const CAM = [
  { p: [0.8, 2.4, 17.0],  t: [-2.6, 4.3, 0] },
  { p: [1.8, 3.2, 12.5],  t: [-5.2, 4.6, 0] },
  { p: [1.6, 3.8, 10.5],  t: [-5.8, 4.8, 0] },
  { p: [-1.8, 4.2, 11.5], t: [5.4, 4.9, 0] },
  { p: [1.2, 3.2, 15.5],  t: [-4.6, 4.9, 0] },
  { p: [2.5, 5.0, 10.0],  t: [0.0, 5.2, 0] },
  { p: [-6.5, 6.0, 6.5],  t: [0.0, 5.4, 0] },
  { p: [2.0, 1.2, 8.5],   t: [-4.2, 5.2, 0] },
  { p: [1.0, 2.4, 14.0],  t: [-5.2, 4.6, 0] },
  { p: [1.0, 1.6, 19.5],  t: [-6.4, 5.0, 0] },
];

const HERO_SHIFT = 1.2; // world units

// Colours at day, dusk and night.
const PALETTE = {
  skyTop: ['#BCD0F5', '#5C74D6', '#040824'],
  skyHor: ['#F2F5FB', '#C7D3F6', '#16236A'],
  bark:   ['#161C4A', '#10153C', '#070B22'],
  rim:    ['#5B7FE8', '#6F8FF0', '#55B0DE'],
  stamen: ['#FFE9B0', '#FFE9B0', '#E6F27A'],
  petalA: ['#2F55DC', '#2F56E0', '#345CF0'],
  petalB: ['#9DBBFF', '#A4BEFF', '#A9C4FF'],
  core:   ['#1B2F9E', '#1D33A8', '#2038B8'],
  fallA:  ['#5F86F2', '#6E92F6', '#7C9DFA'],
  fallB:  ['#B9CEFF', '#C2D4FF', '#D3E1FF'],
  ground: ['#DDE6F6', '#8FA2DD', '#0A1238'],
};

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const PAL = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, v.map(hex)]));

function tri(keys, n, out) {
  const a = n < 0.5 ? keys[0] : keys[1];
  const b = n < 0.5 ? keys[1] : keys[2];
  const f = n < 0.5 ? n * 2 : (n - 0.5) * 2;
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}
const css = (c) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

function sample(arr, t) {
  const max = arr.length - 1;
  const x = Math.min(max, Math.max(0, t));
  const i = Math.min(max - 1, Math.floor(x));
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
}

export function createStage(canvas, { mobile = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  let dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

  const counts = mobile
    ? { blossoms: 5500, fall: 1200, field: 500, carpet: 1800 }
    : { blossoms: 11000, fall: 2600, field: 1000, carpet: 4000 };

  // Uniforms shared by every material.
  const shared = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uFog: { value: new THREE.Color() },
    uFogNear: { value: 16 },
    uFogFar: { value: 70 },
    uGrow: { value: 0 },
    uBloom: { value: 0 },
    uShed: { value: 0 },
    uGlow: { value: 0 },
  };

  // --- tree
  const tree = generateTree(23);
  const barkMat = new THREE.ShaderMaterial({
    vertexShader: barkVert,
    fragmentShader: barkFrag,
    uniforms: { ...shared, uBark: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uRimAmt: { value: 0.15 } },
  });
  const bark = new THREE.Mesh(buildBranchGeometry(tree), barkMat);
  bark.frustumCulled = false;
  scene.add(bark);

  // --- blossoms
  const quad = new THREE.PlaneGeometry(1, 1);
  const bd = buildBlossomData(tree, counts.blossoms);
  const blossomGeo = new THREE.InstancedBufferGeometry();
  blossomGeo.index = quad.index;
  blossomGeo.setAttribute('position', quad.getAttribute('position'));
  blossomGeo.setAttribute('uv', quad.getAttribute('uv'));
  blossomGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(bd.iPos, 3));
  blossomGeo.setAttribute('iQuat', new THREE.InstancedBufferAttribute(bd.iQuat, 4));
  blossomGeo.setAttribute('iA', new THREE.InstancedBufferAttribute(bd.iA, 4));
  blossomGeo.setAttribute('iTint', new THREE.InstancedBufferAttribute(bd.iTint, 1));
  blossomGeo.instanceCount = counts.blossoms;
  const blossomMat = new THREE.ShaderMaterial({
    vertexShader: blossomVert,
    fragmentShader: blossomFrag,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    uniforms: {
      ...shared,
      uPetalA: { value: new THREE.Color() },
      uPetalB: { value: new THREE.Color() },
      uCore: { value: new THREE.Color() },
      uStamen: { value: new THREE.Color() },
    },
  });
  const blossoms = new THREE.Mesh(blossomGeo, blossomMat);
  blossoms.frustumCulled = false;
  scene.add(blossoms);

  // --- petals
  const rand = mulberry32(99);
  const petalUniforms = {
    ...shared,
    uFlow: { value: 0 },
    uFall: { value: 0 },
    uCarpet: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(16, 10, 16) },
    uWindDir: { value: new THREE.Vector2(0.75, 0.3) },
    uPetalA: { value: new THREE.Color() },
    uPetalB: { value: new THREE.Color() },
    // After dark a share of the loose petals pick up an oil-slick sheen.
    uIrid: { value: 0 },
    uIr0: { value: new THREE.Color('#E23BB4') },
    uIr1: { value: new THREE.Color('#8A4BE0') },
    uIr2: { value: new THREE.Color('#7BD2D3') },
    uIr3: { value: new THREE.Color('#F2D34B') },
  };
  function petalLayer(mode, n, originFn) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const seed = new Float32Array(n * 4);
    const origin = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seed[i * 4] = rand();
      seed[i * 4 + 1] = rand();
      seed[i * 4 + 2] = rand();
      seed[i * 4 + 3] = rand();
      originFn(origin, i);
    }
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: petalVert,
      fragmentShader: petalFrag,
      defines: { MODE: mode },
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      uniforms: petalUniforms,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }
  petalLayer(0, counts.fall, (o, i) => {
    const k = Math.floor(rand() * counts.blossoms);
    o[i * 3] = bd.iPos[k * 3];
    o[i * 3 + 1] = bd.iPos[k * 3 + 1];
    o[i * 3 + 2] = bd.iPos[k * 3 + 2];
  });
  petalLayer(1, counts.field, () => {});
  petalLayer(2, counts.carpet, (o, i) => {
    const r = 0.4 + Math.pow(rand(), 0.62) * 9;
    const a = rand() * Math.PI * 2;
    o[i * 3] = Math.cos(a) * r + 1.2;
    o[i * 3 + 1] = 0.03 + rand() * 0.02;
    o[i * 3 + 2] = Math.sin(a) * r * 0.9 + 0.4;
  });

  // --- ground
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: groundVert,
    fragmentShader: groundFrag,
    transparent: true,
    depthWrite: false,
    uniforms: { uGround: { value: new THREE.Color() }, uFog: shared.uFog, uShade: { value: 0.2 }, uAlpha: { value: 0.5 } },
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(32, 72), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // --- a soft halo behind the canopy once night falls
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  const hc = haloCanvas.getContext('2d');
  const grad = hc.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  hc.fillStyle = grad;
  hc.fillRect(0, 0, 128, 128);
  const haloMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(haloCanvas),
    color: new THREE.Color('#3FC4D4'),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    opacity: 0,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(0, 5, -1);
  halo.scale.set(20, 15, 1);
  halo.renderOrder = -5;
  scene.add(halo);

  // --- camera path
  let posCurve;
  let tgtCurve;
  function buildCurves(aspect) {
    const narrow = aspect < 0.8;
    const P = CAM.map(({ p }) => new THREE.Vector3(narrow ? p[0] * 0.25 : p[0], p[1], narrow ? p[2] * 1.3 : p[2]));
    // On wide screens the hero looks a little further left, which sets the
    // tree further right, clear of the name. Squarer windows get less of it,
    // or the canopy would run off the right edge.
    const heroShift = HERO_SHIFT * Math.min(1, Math.max(0, (aspect - 1.5) / 0.5));
    const T = CAM.map(({ t }, i) => new THREE.Vector3(
      narrow ? t[0] * 0.15 : t[0] - (i === 0 ? heroShift : 0),
      narrow ? t[1] + 0.9 : t[1],
      t[2],
    ));
    posCurve = new THREE.CatmullRomCurve3(P, false, 'catmullrom', 0.35);
    tgtCurve = new THREE.CatmullRomCurve3(T, false, 'catmullrom', 0.35);
    camera.fov = narrow ? 50 : 40;
  }

  const state = { grow: 0, story: 0, night: 0 };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const tmp = [0, 0, 0];
  const pos = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const sky = { top: '', hor: '' };
  const setCol = (u, key, n) => {
    tri(PAL[key], n, tmp);
    u.value.setRGB(tmp[0], tmp[1], tmp[2], THREE.SRGBColorSpace);
  };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    buildCurves(camera.aspect);
    camera.updateProjectionMatrix();
  }
  resize();

  function setPointer(x, y) {
    pointer.x = x;
    pointer.y = y;
  }

  // If frames run slow, step the render resolution down. Frames longer than
  // 200 ms mean the tab is in the background, so they are ignored.
  let slow = 0;
  let sampled = 0;
  let onLite = null;
  function watchSpeed(dt) {
    if (dt > 0.2) return;
    sampled++;
    if (dt > 0.024) slow++;
    if (sampled < 120) return;
    if (slow > 72) {
      if (dpr > 0.8) {
        dpr = Math.max(0.75, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        resize();
      } else if (onLite) {
        onLite();
        onLite = null;
      }
    }
    slow = 0;
    sampled = 0;
  }

  /** dt in seconds, vel = scroll velocity (px per frame, signed). */
  function render(dt, vel = 0) {
    watchSpeed(dt);
    dt = Math.min(dt, 0.06);
    const t = state.story;
    const speed = Math.abs(vel);
    const gust = Math.min(speed / 12, 6);
    shared.uTime.value += dt * (1 + gust * 0.25);
    petalUniforms.uFlow.value += dt * (1 + gust);
    shared.uWind.value += ((1 + Math.min(speed / 40, 2.5)) - shared.uWind.value) * 0.08;

    const night = sample(STORY.night, t);
    state.night = night;
    shared.uGrow.value = state.grow;
    shared.uBloom.value = sample(STORY.bloom, t);
    shared.uShed.value = sample(STORY.shed, t);
    shared.uGlow.value = night;
    petalUniforms.uFall.value = sample(STORY.fall, t) * Math.min(1, state.grow * 1.2);
    petalUniforms.uCarpet.value = sample(STORY.carpet, t);

    setCol(shared.uFog, 'skyHor', night);
    setCol(barkMat.uniforms.uBark, 'bark', night);
    setCol(barkMat.uniforms.uRim, 'rim', night);
    setCol(blossomMat.uniforms.uPetalA, 'petalA', night);
    setCol(blossomMat.uniforms.uPetalB, 'petalB', night);
    setCol(blossomMat.uniforms.uCore, 'core', night);
    setCol(blossomMat.uniforms.uStamen, 'stamen', night);
    petalUniforms.uIrid.value = Math.max(0, (night - 0.5) / 0.5); // starts as the page theme turns to night
    setCol(petalUniforms.uPetalA, 'fallA', night);
    setCol(petalUniforms.uPetalB, 'fallB', night);
    setCol(groundMat.uniforms.uGround, 'ground', night);
    groundMat.uniforms.uShade.value = 0.2 - night * 0.08;
    groundMat.uniforms.uAlpha.value = 0.45 + night * 0.4;
    barkMat.uniforms.uRimAmt.value = 0.12 + night * 0.28;
    haloMat.opacity = night * 0.2 * state.grow;

    sky.top = css(tri(PAL.skyTop, night, tmp));
    sky.hor = css(tri(PAL.skyHor, night, tmp));

    const u = Math.min(1, Math.max(0, t / (CAM.length - 1)));
    posCurve.getPoint(u, pos);
    tgtCurve.getPoint(u, tgt);
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    camera.position.set(pos.x + pointer.sx * 0.6, pos.y - pointer.sy * 0.3, pos.z);
    camera.lookAt(tgt.x + pointer.sx * 0.15, tgt.y, tgt.z);
    petalUniforms.uCam.value.copy(camera.position);

    renderer.render(scene, camera);
  }

  return { state, sky, render, resize, setPointer, stops: CAM.length, set onLite(fn) { onLite = fn; } };
}

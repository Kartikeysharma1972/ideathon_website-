// Scroll-driven 3D classroom. The camera walks a fixed path through the room
// (door → back bench → rows → blackboard → mentor desk → notebook → hands up)
// and every animation is keyed to one continuous "story clock" derived from scroll.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const root = document.documentElement;
const section = document.getElementById('classroom');
const canvas = section.querySelector('.cr-canvas');
const panels = [...section.querySelectorAll('.cr-panel')];
const railLinks = [...section.querySelectorAll('.cr-rail a')];
const chapterLabel = section.querySelector('.cr-chapter-label');
const finePointer = matchMedia('(pointer: fine)');
const LAST = panels.length - 1;
const HOLD = 0.2;
const SNAP = new URLSearchParams(location.search).has('snap'); // screenshot/debug: no camera easing

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bell = (c, center, width) => smooth(clamp(1 - Math.abs(c - center) / width));
const ramp = (c, from, to) => smooth(clamp((c - from) / (to - from)));
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = rng(2026);
const pick = list => list[Math.floor(rand() * list.length)];

function fail() {
  root.classList.remove('cr-pending');
  root.classList.add('cr-fallback');
}

// CC0 characters by Quaternius (poly.pizza), recoloured and posed in code
const MODEL_FILES = { boy: 'student-boy', boySweater: 'student-boy-sweater', girl: 'student-girl', teacher: 'teacher' };

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const loader = new GLTFLoader();
  const entries = await Promise.all(Object.entries(MODEL_FILES).map(async ([key, file]) => [key, await loader.loadAsync(`assets/models/${file}.glb`)]));
  build(Object.fromEntries(entries));
} catch (error) {
  console.error(error);
  fail();
}

function build(models) {
  const isSmall = () => innerWidth < 760;
  // resolution cap, lowered automatically if a device can't hold a smooth frame rate
  const dprCap = () => Math.min(devicePixelRatio || 1, isSmall() ? 1.25 : 1.25);
  let dpr = dprCap();
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // the sun and the room never move, so the shadow map is drawn once instead of every frame
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const C = {
    wall: '#f3f6fa', dado: '#cfe3f8', skirting: '#399aff', floor: '#c99c6e', ceiling: '#f8f4ea',
    wood: '#d9a670', woodDark: '#8f5d3a', metal: '#4b4c44', lime: '#d8ebff', purple: '#399aff',
    ink: '#25251f', board: '#2d3b33', frame: '#8a5a35', paper: '#fbf8ef', white: '#f6f5ef'
  };
  scene.background = new THREE.Color(C.wall);
  scene.fog = new THREE.Fog(C.wall, 16, 30);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);

  // soft sky/floor bounce, warm sun through the windows with real (baked once) shadows
  scene.add(new THREE.HemisphereLight('#fbfcff', '#c9b9a4', 2.1));
  const sunDir = new THREE.Vector3(1, -0.92, 0.26).normalize();
  const sun = new THREE.DirectionalLight('#ffe2b8', 3.4);
  sun.position.copy(sunDir).multiplyScalar(-16);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(innerWidth < 760 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 2, far: 34 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#e8e4ff', 0.55);
  fill.position.set(6, 5, -5);
  scene.add(fill);

  // ---------- materials ----------
  const materials = new Map();
  // everything in the room is matte, so cheap Lambert shading looks the same as PBR at a fraction of the cost
  const surface = ({ roughness, metalness, envMapIntensity, ...extra } = {}) => new THREE.MeshLambertMaterial(extra);
  const mat = color => {
    if (!materials.has(color)) materials.set(color, surface({ color }));
    return materials.get(color);
  };
  const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // ---------- static geometry is merged per material ----------
  const buckets = new Map();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  function addStatic(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const g = geometry.applyMatrix4(tmpM);
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(g);
  }
  const box = (material, w, h, d, x, y, z, ry = 0) => addStatic(new THREE.BoxGeometry(w, h, d), material, x, y, z, 0, ry, 0);
  const cyl = (material, rt, rb, h, x, y, z, seg = 16, rx = 0, rz = 0) => addStatic(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z, rx, 0, rz);
  function flushStatic() {
    const thinMetal = new Set([mat(C.metal), mat('#5b5c52')]);
    buckets.forEach((list, material) => {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), material);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = material !== blobM;
      mesh.receiveShadow = !thinMetal.has(material);
      scene.add(mesh);
    });
    buckets.clear();
  }

  // ---------- the room: 12m wide, 14m deep, 4.2m tall ----------
  const W = 6, D = 7, H = 4.2;
  const floorTex = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = C.floor; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let y = 0; y < h; y += 64) {
      for (let x = (y / 64 % 2) * -170; x < w; x += 340) {
        const shade = 0.88 + r() * 0.2;
        g.fillStyle = `rgb(${201 * shade | 0},${156 * shade | 0},${110 * shade | 0})`;
        g.fillRect(x + 2, y + 2, 336, 60);
        g.strokeStyle = 'rgba(120,80,45,.12)';
        for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + 10, y + 12 + k * 12 + r() * 4); g.bezierCurveTo(x + 120, y + 8 + k * 12 + r() * 8, x + 220, y + 16 + k * 12, x + 330, y + 10 + k * 12 + r() * 4); g.stroke(); }
      }
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 3.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), surface({ map: floorTex, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallM = mat(C.wall), dadoM = mat(C.dado), skirtM = mat(C.skirting);
  box(basic('#edf1f6'), W * 2, 0.1, D * 2, 0, H + 0.05, 0);
  // walls: upper paint + lilac dado + purple trim line
  [[0, -D - 0.05, W * 2, 0], [0, D + 0.05, W * 2, 0], [-W - 0.05, 0, D * 2, Math.PI / 2], [W + 0.05, 0, D * 2, Math.PI / 2]].forEach(([x, z, len, ry]) => {
    if (x < 0) {
      box(wallM, len, 0.17, 0.1, x, 1.185, z, ry);
      box(wallM, len, H - 3.03, 0.1, x, 3.03 + (H - 3.03) / 2, z, ry);
      [[-D, -4.35], [-2.45, -0.85], [1.05, 2.65], [4.55, D]].forEach(([a, b]) => box(wallM, b - a, 1.76, 0.1, x, 2.15, (a + b) / 2, ry));
    } else box(wallM, len, H - 1.1, 0.1, x, 1.1 + (H - 1.1) / 2, z, ry);
    box(dadoM, len, 1.1, 0.1, x, 0.55, z, ry);
    const ix = x === 0 ? 0 : Math.sign(x) * -0.04, iz = z === 0 || x !== 0 ? 0 : Math.sign(z) * -0.04;
    box(skirtM, len, 0.05, 0.04, x + ix, 1.12, z + iz, ry);
    box(mat(C.woodDark), len, 0.12, 0.04, x + ix, 0.06, z + iz, ry);
  });

  // dais for the teacher
  const daisM = mat('#b98a5c');
  box(daisM, W * 2, 0.18, 2.1, 0, 0.09, -D + 1.05);
  box(mat('#9c7048'), W * 2, 0.04, 0.06, 0, 0.17, -D + 2.1);

  // windows on the left wall with grills, and a painted sky behind them
  const skyTex = canvasTexture(256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#9fd3f2'); grd.addColorStop(0.62, '#e8f5f4'); grd.addColorStop(1, '#fff6dc');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9cc86a';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(i * 34 + 6, h - 18 + (i % 3) * 8, 26 + (i % 4) * 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#b6d886';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(i * 42 + 20, h - 4, 22 + (i % 2) * 10, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.85)';
    [[60, 60, 26], [86, 54, 30], [112, 64, 22], [190, 40, 18], [208, 36, 22]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  });
  const skyM = basic('#ffffff', { map: skyTex, toneMapped: false });
  const windowZ = [-3.4, 0.1, 3.6];
  const frameM = mat('#f6f1e4'), grillM = mat('#5b5c52');
  windowZ.forEach(z => {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.65), skyM);
    glass.position.set(-W + 0.02, 2.15, z); glass.rotation.y = Math.PI / 2;
    scene.add(glass);
    box(frameM, 0.08, 0.1, 2.0, -W + 0.06, 3.03, z); box(frameM, 0.14, 0.1, 2.0, -W + 0.09, 1.27, z);
    box(frameM, 0.08, 1.85, 0.1, -W + 0.06, 2.15, z - 0.95); box(frameM, 0.08, 1.85, 0.1, -W + 0.06, 2.15, z + 0.95);
    box(frameM, 0.06, 1.7, 0.06, -W + 0.06, 2.15, z);
    for (let k = -3; k <= 3; k++) cyl(grillM, 0.012, 0.012, 1.65, -W + 0.12, 2.15, z + k * 0.24, 6);
    box(grillM, 0.03, 0.03, 1.85, -W + 0.12, 2.6, z); box(grillM, 0.03, 0.03, 1.85, -W + 0.12, 1.7, z);
  });

  // light shafts from the windows (gradient volumes, additive)
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uStrength: { value: 0.11 } },
    vertexShader: 'attribute float aFade; varying float vFade; void main(){ vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uStrength; varying float vFade; void main(){ gl_FragColor = vec4(vec3(1.0,0.93,0.74) * vFade * uStrength, 1.0); }'
  });
  const shaftGeos = [];
  windowZ.forEach(z => {
    const corners = [[1.32, z - 0.88], [2.98, z - 0.88], [2.98, z + 0.88], [1.32, z + 0.88]].map(([y, zz]) => new THREE.Vector3(-W + 0.05, y, zz));
    const floorPts = corners.map(p => p.clone().addScaledVector(sunDir, p.y / -sunDir.y - 0.01));
    const pos = [], fade = [], idx = [];
    corners.forEach(p => { pos.push(p.x, p.y, p.z); fade.push(1); });
    floorPts.forEach(p => { pos.push(p.x, p.y, p.z); fade.push(0); });
    [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(([a, b]) => idx.push(a, b, b + 4, a, b + 4, a + 4));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    g.setIndex(idx);
    shaftGeos.push(g);
  });
  scene.add(new THREE.Mesh(mergeGeometries(shaftGeos), shaftMat));
  // soft contact shadows
  const blobTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(60,40,25,.55)'); grd.addColorStop(1, 'rgba(60,40,25,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const blobM = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.3 });
  const blob = (x, z, sx, sz, y = 0.01) => addStatic(new THREE.PlaneGeometry(sx, sz), blobM, x, y, z, -Math.PI / 2);

  // ---------- blackboard ----------
  const BOARD = { x: 0.4, y: 2.15, w: 5.0, h: 2.0 };
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 2048; boardCanvas.height = 820;
  const boardCtx = boardCanvas.getContext('2d');
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), surface({ map: boardTex, roughness: 0.92, envMapIntensity: 0.2 }));
  boardMesh.receiveShadow = true;
  boardMesh.position.set(BOARD.x, BOARD.y, -D + 0.04);
  scene.add(boardMesh);
  const frame = mat(C.frame);
  box(frame, BOARD.w + 0.24, 0.12, 0.08, BOARD.x, BOARD.y + BOARD.h / 2 + 0.06, -D + 0.04);
  box(frame, BOARD.w + 0.24, 0.12, 0.08, BOARD.x, BOARD.y - BOARD.h / 2 - 0.06, -D + 0.04);
  box(frame, 0.12, BOARD.h, 0.08, BOARD.x - BOARD.w / 2 - 0.06, BOARD.y, -D + 0.04);
  box(frame, 0.12, BOARD.h, 0.08, BOARD.x + BOARD.w / 2 + 0.06, BOARD.y, -D + 0.04);
  box(frame, BOARD.w, 0.04, 0.16, BOARD.x, BOARD.y - BOARD.h / 2 - 0.1, -D + 0.12);
  [[-1.4, '#ffffff'], [-1.25, '#f4c8de'], [-1.12, '#d2e7ff'], [1.6, '#ffffff']].forEach(([dx, color]) => addStatic(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), mat(color), BOARD.x + dx, BOARD.y - BOARD.h / 2 - 0.065, -D + 0.12, 0, 0.3, Math.PI / 2));
  box(mat('#6b4a2f'), 0.22, 0.05, 0.08, BOARD.x + 1.95, BOARD.y - BOARD.h / 2 - 0.055, -D + 0.12);
  box(mat('#f1efe6'), 0.2, 0.02, 0.07, BOARD.x + 1.95, BOARD.y - BOARD.h / 2 - 0.085, -D + 0.12);

  // bunting above the board
  const flagColors = [C.purple, C.lime, '#0063c9', '#ffffff', '#9fd3f2'];
  for (let i = 0; i < 17; i++) {
    const t = i / 16, x = lerp(-3.6, 4.4, t), y = 3.68 - Math.sin(t * Math.PI) * 0.22;
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0); shape.lineTo(0.15, 0); shape.lineTo(0, -0.28); shape.closePath();
    addStatic(new THREE.ShapeGeometry(shape), mat(flagColors[i % flagColors.length]), x, y, -D + 0.09);
  }
  // sign above bunting
  const signTex = canvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#25251f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d2e7ff'; g.font = '700 58px "Space Grotesk", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MIIC × CODEVIDHYA · IDEATHON 2026', w / 2, h / 2 + 3);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.35), basic('#ffffff', { map: signTex }));
  sign.position.set(BOARD.x, 3.98, -D + 0.06);
  scene.add(sign);

  // ---------- posters & noticeboards ----------
  function poster(w, h, px, draw, x, y, z, ry) {
    const t = canvasTexture(px, Math.round(px * h / w), draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), surface({ map: t, roughness: 0.9 }));
    m.receiveShadow = true;
    m.position.set(x, y, z); m.rotation.y = ry;
    scene.add(m);
    return m;
  }
  const hand = (g, size, weight = 600) => { g.font = `${weight} ${size}px Caveat, "Comic Sans MS", cursive`; };
  // back wall: "our big ideas" pin board full of sticky notes
  poster(4.4, 1.7, 1024, (g, w, h) => {
    g.fillStyle = '#c9a77c'; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(110,70,30,${r() * .18})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = '#25251f'; g.fillRect(w / 2 - 230, 18, 460, 62);
    g.fillStyle = '#d2e7ff'; g.font = '700 40px "Space Grotesk", sans-serif'; g.textAlign = 'center'; g.fillText('OUR BIG IDEAS ✳', w / 2, 63);
    const notes = ['solar bus stop', 'smart dustbin', 'app for lost pets', 'rain saver', 'quiz buddy', 'plant doctor', 'safe crossing', 'water alert', 'book swap', 'clean air map', 'kind canteen', 'what if…?'];
    const colors = ['#fff3a3', '#d2e7ff', '#d6e9ff', '#ffd1df', '#bfe6ff', '#ffffff'];
    notes.forEach((n, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      const x = 40 + col * 162 + r() * 14, y = 110 + row * 150 + r() * 16;
      g.save(); g.translate(x + 66, y + 60); g.rotate((r() - .5) * .16);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(-62, -52, 132, 118);
      g.fillStyle = colors[(i * 5) % 6]; g.fillRect(-66, -58, 132, 118);
      g.fillStyle = '#d24b4b'; g.beginPath(); g.arc(0, -48, 7, 0, 7); g.fill();
      g.fillStyle = '#2b2b28'; hand(g, 30); g.textAlign = 'center';
      const words = n.split(' ');
      words.forEach((wd, k) => g.fillText(wd, 0, -8 + k * 28 - (words.length - 1) * 8));
      g.restore();
    });
  }, -0.6, 2.25, D - 0.01, Math.PI);
  box(frame, 4.5, 0.08, 0.06, -0.6, 3.14, D - 0.02); box(frame, 4.5, 0.08, 0.06, -0.6, 1.36, D - 0.02);

  // right wall posters
  poster(1.2, 1.6, 512, (g, w, h) => {
    g.fillStyle = '#399aff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d2e7ff'; g.font = '700 74px "Space Grotesk", sans-serif'; g.textAlign = 'left';
    ['THINK.', 'BUILD.', 'PITCH.'].forEach((t, i) => g.fillText(t, 40, 150 + i * 96));
    g.fillStyle = '#ffffff'; hand(g, 46); g.fillText('little ideas,', 40, 520); g.fillText('big possibilities ✳', 40, 566);
    g.strokeStyle = '#d2e7ff'; g.lineWidth = 5; g.beginPath(); g.arc(380, 410, 44, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(366, 456); g.lineTo(394, 456); g.moveTo(368, 470); g.lineTo(392, 470); g.stroke();
  }, W - 0.01, 2.2, -3.2, -Math.PI / 2);
  poster(1.5, 1.1, 512, (g, w, h) => {
    g.fillStyle = '#fbf8ef'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#25251f'; g.font = '700 36px "Space Grotesk", sans-serif'; g.fillText('OUR SOLAR SYSTEM', 30, 58);
    const planets = [['#f6c445', 42], ['#b9a3ef', 12], ['#e8a56b', 16], ['#6fb6e9', 17], ['#e46f53', 13], ['#d9b37f', 30], ['#e8d49b', 25], ['#9ddbe6', 20], ['#6d8de6', 19]];
    let x = 40;
    planets.forEach(([c, r], i) => { g.fillStyle = c; g.beginPath(); g.arc(x + r, 200, r, 0, 7); g.fill(); if (i === 6) { g.strokeStyle = '#c9a85f'; g.lineWidth = 4; g.beginPath(); g.ellipse(x + r, 200, r + 16, 6, -.3, 0, 7); g.stroke(); } x += r * 2 + 12; });
    g.strokeStyle = '#ddd8c6'; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 290); g.lineTo(w - 30, 290); g.stroke();
  }, W - 0.01, 2.25, 0.9, -Math.PI / 2);
  // door
  box(mat('#a4704a'), 0.06, 2.3, 1.1, W - 0.04, 1.15, 4.7);
  box(frameM, 0.08, 0.1, 1.3, W - 0.03, 2.35, 4.7);
  box(frameM, 0.08, 2.35, 0.1, W - 0.03, 1.18, 4.1); box(frameM, 0.08, 2.35, 0.1, W - 0.03, 1.18, 5.3);
  addStatic(new THREE.SphereGeometry(0.04, 10, 8), mat('#d9c27a'), W - 0.1, 1.05, 4.28);
  poster(0.55, 0.75, 256, (g, w, h) => {
    g.fillStyle = '#d2e7ff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#25251f'; g.font = '700 30px "Space Grotesk", sans-serif'; g.fillText('IDEATHON', 24, 66); g.fillText('2026', 24, 100);
    g.font = '700 120px "Space Grotesk", sans-serif'; g.fillStyle = '#399aff'; g.fillText('✳', 70, 270);
    hand(g, 30); g.fillStyle = '#25251f'; g.fillText('come in, curious', 22, 330);
  }, W - 0.08, 1.7, 4.7, -Math.PI / 2);

  // clock (hands advance with the story)
  const clock = new THREE.Group();
  clock.position.set(W - 0.06, 3.15, -1.3);
  clock.rotation.y = -Math.PI / 2;
  scene.add(clock);
  const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 40), mat('#fffdf6'));
  clockFace.rotation.x = Math.PI / 2;
  const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 8, 40), mat(C.purple));
  clock.add(clockFace, clockRim);
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.015, i % 3 ? 0.03 : 0.06, 0.01), mat(C.ink));
    const a = i / 12 * Math.PI * 2;
    tick.position.set(Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0.025); tick.rotation.z = -a;
    clock.add(tick);
  }
  const hourHand = new THREE.Group(), minuteHand = new THREE.Group();
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.14, 0.01), mat(C.ink)); hh.position.y = 0.06; hourHand.add(hh);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.21, 0.01), mat(C.ink)); mh.position.y = 0.09; minuteHand.add(mh);
  hourHand.position.z = minuteHand.position.z = 0.03;
  clock.add(hourHand, minuteHand);

  // bookshelf in the back left corner
  box(mat('#a87a52'), 0.45, 2.0, 1.6, -W + 0.25, 1.0, D - 1.3);
  const bookColors = [C.purple, '#e46f53', C.lime, '#6fb6e9', '#f6c445', '#0063c9'];
  for (let s = 0; s < 4; s++) {
    box(mat('#7d5434'), 0.42, 0.03, 1.55, -W + 0.28, 0.35 + s * 0.45, D - 1.3);
    let z = D - 2.02;
    while (z < D - 0.6) {
      const t = 0.05 + rand() * 0.05, hgt = 0.26 + rand() * 0.12;
      box(mat(pick(bookColors)), 0.3, hgt, t, -W + 0.34, 0.37 + s * 0.45 + hgt / 2, z + t / 2);
      z += t + 0.008;
    }
  }
  // plant
  cyl(mat('#d27b52'), 0.2, 0.15, 0.36, W - 0.5, 0.18, -D + 2.5, 18);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    addStatic(new THREE.SphereGeometry(0.17, 10, 8), mat(i % 2 ? '#8dbb5a' : '#6fa246'), W - 0.5 + Math.cos(a) * 0.14, 0.55 + (i % 3) * 0.12, -D + 2.5 + Math.sin(a) * 0.14);
  }
  // tube lights
  [-3.2, 3.2].forEach(z => {
    [-1, 1].forEach(side => {
      box(basic('#fffef6'), 0.05, 0.05, 1.2, side * (W - 0.06), 3.55, z);
      box(mat('#ebe6d6'), 0.08, 0.03, 1.3, side * (W - 0.07), 3.5, z);
    });
  });

  // ---------- teacher's desk ----------
  const TD = { x: -3.3, z: -5.55 };
  box(mat(C.wood), 1.6, 0.06, 0.75, TD.x, 0.97, TD.z);
  box(mat('#b98a5c'), 1.56, 0.62, 0.05, TD.x, 0.63, TD.z + 0.34);
  box(mat('#b98a5c'), 0.05, 0.78, 0.7, TD.x - 0.76, 0.57, TD.z); box(mat('#b98a5c'), 0.05, 0.78, 0.7, TD.x + 0.76, 0.57, TD.z);
  blob(TD.x, TD.z, 2.0, 1.2, 0.19);
  [[C.purple, 0.05], ['#e46f53', 0.04], ['#f6c445', 0.05]].reduce((y, [c, t]) => { box(mat(c), 0.34, t, 0.25, TD.x - 0.45, y + t / 2, TD.z - 0.05, 0.2); return y + t; }, 1.0);
  addStatic(new THREE.SphereGeometry(0.06, 14, 12), mat('#d94a3a'), TD.x + 0.1, 1.06, TD.z + 0.1);
  cyl(mat('#5b8a3a'), 0.004, 0.004, 0.04, TD.x + 0.1, 1.13, TD.z + 0.1, 5);
  // globe
  const globeTex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#6fb6e9'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9ccc65';
    [[40, 40, 30, 22], [70, 80, 18, 26], [140, 46, 40, 20], [150, 86, 20, 18], [210, 90, 22, 12], [190, 36, 18, 14]].forEach(([x, y, a, b]) => { g.beginPath(); g.ellipse(x, y, a, b, 0, 0, 7); g.fill(); });
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 24), surface({ map: globeTex, roughness: 0.35 }));
  globe.position.set(TD.x + 0.5, 1.25, TD.z - 0.05);
  globe.rotation.z = 0.4;
  scene.add(globe);
  cyl(mat(C.metal), 0.08, 0.1, 0.03, TD.x + 0.5, 1.015, TD.z - 0.05, 16);
  cyl(mat(C.metal), 0.01, 0.01, 0.12, TD.x + 0.5, 1.07, TD.z - 0.05, 6);
  // teacher's chair
  box(mat(C.metal), 0.5, 0.05, 0.5, TD.x, 0.62, TD.z - 0.65);
  box(mat(C.metal), 0.5, 0.5, 0.05, TD.x, 0.88, TD.z - 0.92);

  // ---------- ceiling fans ----------
  const fans = [];
  [[-2.4, -1.0], [2.6, 2.6]].forEach(([x, z]) => {
    cyl(mat('#e9e4d4'), 0.02, 0.02, 0.5, x, H - 0.25, z, 8);
    const fan = new THREE.Group();
    fan.position.set(x, H - 0.52, z);
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 18), mat('#e9e4d4')));
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.13), mat('#f5f1e5'));
      const a = i / 3 * Math.PI * 2;
      blade.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      blade.rotation.y = -a; blade.rotation.x = 0.12;
      fan.add(blade);
    }
    scene.add(fan);
    fans.push(fan);
  });

  // ---------- student desks & benches ----------
  const COLS = [-4.3, -1.9, 1.9, 4.3];
  const ROWS = [-3.2, -1.3, 0.6, 2.5];
  const deskTop = mat(C.wood), deskSide = mat('#c0905e'), legs = mat(C.metal), benchM = mat('#c99665');
  COLS.forEach(cx => ROWS.forEach(z => {
    box(deskTop, 1.5, 0.05, 0.56, cx, 0.74, z);
    box(deskSide, 1.46, 0.3, 0.03, cx, 0.57, z - 0.26);
    box(deskSide, 1.4, 0.02, 0.4, cx, 0.6, z - 0.04);
    [-0.7, 0.7].forEach(dx => {
      box(legs, 0.04, 0.72, 0.04, cx + dx, 0.36, z - 0.24); box(legs, 0.04, 0.72, 0.04, cx + dx, 0.36, z + 0.24);
      box(legs, 0.04, 0.42, 0.04, cx + dx, 0.21, z + 0.66);
      box(legs, 0.03, 0.03, 0.9, cx + dx, 0.08, z + 0.2);
    });
    box(benchM, 1.5, 0.05, 0.3, cx, 0.43, z + 0.5);
    box(benchM, 1.5, 0.16, 0.03, cx, 0.72, z + 0.69);
    box(legs, 0.03, 0.3, 0.03, cx - 0.7, 0.58, z + 0.69); box(legs, 0.03, 0.3, 0.03, cx + 0.7, 0.58, z + 0.69);
    blob(cx, z + 0.22, 2.0, 1.5);
    // a few things on each desk (the mentored student's desk stays clear for the notebook)
    const n = cx === COLS[1] && z === ROWS[2] ? 0 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const bx = cx + (rand() - .5) * 1.1;
      box(mat(pick(bookColors)), 0.22, 0.025, 0.3, bx, 0.78 + i * 0.001, z + (rand() - .5) * 0.15, (rand() - .5) * 0.6);
    }
    if (n && rand() > .4) box(mat(pick(['#399aff', '#e46f53', '#6fb6e9'])), 0.18, 0.035, 0.06, cx + (rand() - .5), 0.785, z - 0.15, (rand() - .5));
  }));

  // ---------- characters: rigged humans posed in code ----------
  const SKIN = ['#b07a52', '#9a653f', '#c08a60', '#8a5a3a', '#c99a70', '#a46e48'];
  const HAIR = ['#17110d', '#21160f', '#100c0a', '#2b1c14'];
  const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
  const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0), IDQ = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _hq = new THREE.Quaternion();

  // the low-poly sources are flat shaded; welding vertices rounds the bodies (heads keep crisp hair)
  Object.values(models).forEach(gltf => gltf.scene.traverse(o => {
    if (!o.isSkinnedMesh || /head/i.test(o.name) || /head/i.test(o.parent?.name || '')) return;
    const g = o.geometry.clone();
    g.deleteAttribute('normal');
    o.geometry = mergeVertices(g, 1e-4);
    o.geometry.computeVertexNormals();
  }));

  function setWorldRotation(bone, q) {
    bone.getWorldQuaternion(_wq);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(q.multiply(_wq)));
    bone.updateMatrixWorld(true);
  }
  // swing `bone` so it points at `dir` (character space: -z forward, +y up)
  function aim(holder, bone, child, dir, weight = 1) {
    bone.getWorldPosition(_a);
    child.getWorldPosition(_b);
    _b.sub(_a).normalize();
    holder.getWorldQuaternion(_hq);
    _dir.copy(dir).applyQuaternion(_hq);
    _q2.setFromUnitVectors(_b, _dir);
    _q.slerpQuaternions(IDQ, _q2, weight);
    setWorldRotation(bone, _q);
  }
  // rotate `bone` about an axis given in character space
  function turn(holder, bone, axis, angle) {
    holder.getWorldQuaternion(_hq);
    _q.setFromAxisAngle(_dir.copy(axis).applyQuaternion(_hq), angle);
    setWorldRotation(bone, _q);
  }
  const blendDir = (out, a, b, t) => out.copy(a).lerp(b, t).normalize();

  const dressed = new Map();
  function makeCharacter(gltf, palette, height) {
    const model = cloneSkinned(gltf.scene);
    // the body parts of one character share a single skeleton (cloning gives each part its own copy)
    let shared = null;
    model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      if (!shared) { shared = o.skeleton; return; }
      if (o.skeleton.bones.length === shared.bones.length && o.skeleton.bones.every((b, i) => b === shared.bones[i])) o.bind(shared, o.bindMatrix);
    });
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = true;
      const color = palette[o.material.name];
      const key = o.material.uuid + (color || '');
      if (!dressed.has(key)) {
        const m = new THREE.MeshLambertMaterial({ color: color || o.material.color, map: o.material.map });
        dressed.set(key, m);
      }
      o.material = dressed.get(key);
    });
    model.rotation.y = Math.PI; // the sources face +z; our characters face the board (-z)
    model.scale.setScalar(height / 1.82);
    const holder = new THREE.Group();
    holder.add(model);
    holder.updateMatrixWorld(true);
    const bones = {};
    model.traverse(o => { if (o.isBone) bones[o.name] = o; });
    const side = {};
    ['L', 'R'].forEach(sd => { side[sd] = Math.sign(holder.worldToLocal(bones[`UpperArm${sd}`].getWorldPosition(new THREE.Vector3())).x) || 1; });
    // bones are recomputed and uploaded only after the pose changes (most students sit still most of the time)
    const ch = { holder, model, bones, side, skeleton: shared, dirty: true };
    const update = shared.update.bind(shared);
    shared.update = () => { if (ch.dirty) { update(); ch.dirty = false; } };
    return ch;
  }

  // seated pose targets
  const LEG_UP = s => V(s * 0.12, -0.08, -1), LEG_DOWN = V(0, -1, -0.04);
  const ARM_REST = s => V(s * 0.2, -0.8, -0.56), FORE_REST = s => V(-s * 0.45, -0.06, -0.89);
  const ARM_UP = s => V(s * 0.22, 1, -0.05), FORE_UP = s => V(s * 0.06, 1, -0.03);

  const kids = [];
  const seatFor = (cx, z, side) => ({ x: cx + side * 0.38, z: z + 0.48 });
  const HERO = seatFor(COLS[1], ROWS[2], 1);   // mentored student, aisle seat
  const BULB = seatFor(COLS[2], ROWS[1], -1);  // "aha" student, aisle seat
  const LOOKBACK = [seatFor(COLS[1], ROWS[3], 1), seatFor(COLS[2], ROWS[3], -1), seatFor(COLS[2], ROWS[2], -1)];
  const EAGER = [seatFor(COLS[1], ROWS[0], 1), seatFor(COLS[2], ROWS[0], 1), seatFor(COLS[0], ROWS[1], 1)];
  const same = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
  const reserved = [HERO, BULB, ...LOOKBACK, ...EAGER];
  const UNIFORM = ['#2c3660', '#6b2234', '#3a4458'];
  COLS.forEach(cx => ROWS.forEach(z => [-1, 1].forEach(sideOfDesk => {
    const seat = seatFor(cx, z, sideOfDesk);
    if (!reserved.some(r => same(r, seat)) && rand() < 0.14) return;
    const skin = pick(SKIN), hair = pick(HAIR), roll = rand();
    const base = { Skin: skin, Skin_Darker: shade(skin, 0.85), Hair: hair, Eyebrows: '#120d0a' };
    let gltf, palette;
    if (roll < 0.42) {
      gltf = models.girl;
      palette = { ...base, Red: hair, LimeGreen: pick(UNIFORM), Gold: '#f1efe8', Brown: '#1d1715' };
    } else if (roll < 0.72) {
      gltf = models.boy;
      palette = { ...base, LightBrown: pick(['#f2f1ea', '#dce7f3', '#f2f1ea']), LightBlue: pick(['#262f4d', '#3b4050']), Red_Dark: '#19191b' };
    } else {
      gltf = models.boySweater;
      palette = { ...base, Purple: pick(UNIFORM), LightBlue: '#454b57', White: '#f2f1ea' };
    }
    const ch = makeCharacter(gltf, palette, 1.4 + rand() * 0.16);
    const { holder, bones: b, side } = ch;
    // sit: thighs forward, shins down, forearms resting on the desk
    ['L', 'R'].forEach(sd => {
      const s = side[sd];
      aim(holder, b[`UpperLeg${sd}`], b[`LowerLeg${sd}`], LEG_UP(s));
      if (b[`Foot${sd}`]) aim(holder, b[`LowerLeg${sd}`], b[`Foot${sd}`], LEG_DOWN);
      aim(holder, b[`UpperArm${sd}`], b[`LowerArm${sd}`], ARM_REST(s));
      aim(holder, b[`LowerArm${sd}`], b[`Wrist${sd}`], FORE_REST(s));
    });
    holder.updateMatrixWorld(true);
    b.Hips.getWorldPosition(_a);
    holder.position.set(seat.x - _a.x, 0.54 - _a.y, seat.z + 0.04 - _a.z);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const posed = ['Chest', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'].map(n => [b[n], b[n].quaternion.clone()]);
    const raiseSide = rand() < 0.75 ? 'R' : 'L';
    // keep the same object: its skeleton.update() reads ch.dirty
    kids.push(Object.assign(ch, {
      seat, posed, raiseSide, phase: rand() * 10,
      spare: rand(), delay: rand() * 0.35, // spare keeps the seeded seating identical
      hero: same(seat, HERO), bulb: same(seat, BULB),
      lookBack: LOOKBACK.some(r => same(r, seat)), eager: EAGER.some(r => same(r, seat)),
      tmpU: new THREE.Vector3(), tmpL: new THREE.Vector3(), poseKey: ''
    }));
  })));

  function poseKid(k, headYaw, bodyYaw, pitch, raise) {
    k.posed.forEach(([bone, q]) => bone.quaternion.copy(q));
    k.holder.updateMatrixWorld(true);
    const b = k.bones, h = k.holder;
    if (Math.abs(bodyYaw) > 0.002) turn(h, b.Chest, UP, bodyYaw * 0.3);
    if (Math.abs(headYaw) > 0.002) {
      turn(h, b.Neck, UP, headYaw * 0.4);
      turn(h, b.Head, UP, headYaw * 0.3);
    }
    if (Math.abs(pitch) > 0.002) turn(h, b.Head, RIGHT, pitch);
    if (raise > 0.002) {
      const sd = k.raiseSide, s = k.side[sd];
      aim(h, b[`UpperArm${sd}`], b[`LowerArm${sd}`], blendDir(k.tmpU, ARM_REST(s), ARM_UP(s), raise));
      aim(h, b[`LowerArm${sd}`], b[`Wrist${sd}`], blendDir(k.tmpL, FORE_REST(s), FORE_UP(s), raise));
    }
  }

  // teacher: real walk / idle / wave clips, with posed arms for writing, pointing and helping
  const T = makeCharacter(models.teacher, { Black: '#1f5fae', White: '#f6f2ea', Skin: '#a87450', Hair_Blond: '#17110d', Hair_Brown: '#17110d', Brown: '#2a1d16' }, 1.66);
  const teacher = T.holder, tb = T.bones, sR = T.side.R;
  scene.add(teacher);
  const teacherShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobM);
  teacherShadow.rotation.x = -Math.PI / 2;
  scene.add(teacherShadow);
  const mixer = new THREE.AnimationMixer(T.model);
  const action = name => {
    const a = mixer.clipAction(THREE.AnimationClip.findByName(models.teacher.animations, `CharacterArmature|${name}`));
    a.play();
    a.setEffectiveWeight(0);
    return a;
  };
  const idleA = action('Idle'), walkA = action('Walk'), waveA = action('Wave');
  // bones we bend by hand are reset each frame so the bends never accumulate
  const teacherRest = ['Abdomen', 'Torso', 'Head', 'UpperArmR', 'LowerArmR'].map(n => [tb[n], tb[n].quaternion.clone()]);
  idleA.setEffectiveWeight(1);
  const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.075, 8), mat('#ffffff'));
  tb['WristR'].add(chalk);
  chalk.scale.setScalar(1 / tb['WristR'].getWorldScale(new THREE.Vector3()).x);
  chalk.position.set(0, 0.09 / tb['WristR'].getWorldScale(new THREE.Vector3()).x, 0);
  const WRITE_U = V(sR * 0.28, 0.7, -0.66), WRITE_L = V(sR * 0.08, 0.86, -0.5);
  const POINT_U = V(sR * 0.92, 0.28, -0.26), POINT_L = V(sR * 0.9, 0.42, -0.1);
  const LEAN_U = V(sR * 0.12, -0.5, -0.86), LEAN_L = V(-sR * 0.05, -0.55, -0.83);
  const armU = new THREE.Vector3(), armL = new THREE.Vector3();

  // teacher keyframes per chapter: position, facing (radians, 0 = toward the board), pose
  const TK = [
    { p: [-1.05, 0.18, -6.42], r: 0.15, pose: 'write' },
    { p: [-0.75, 0.18, -6.42], r: 0.1, pose: 'write' },
    { p: [-0.35, 0.18, -6.42], r: 0.05, pose: 'write' },
    { p: [3.35, 0.18, -6.1], r: Math.PI - 0.55, pose: 'point' },
    { p: [-0.6, 0, 0.38], r: Math.PI / 2 - 0.05, pose: 'lean', via: [0.15, 0, -4.6] },
    { p: [-0.64, 0, 0.44], r: Math.PI / 2 + 0.15, pose: 'lean' },
    { p: [-2.7, 0.18, -5.35], r: Math.PI + 0.35, pose: 'cheer', via: [0.1, 0, -4.4] }
  ];

  // ---------- idea bulbs ----------
  const haloTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,246,190,1)'); grd.addColorStop(0.35, 'rgba(255,244,200,.45)'); grd.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  function makeBulb() {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), basic('#fff6c4'));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.07, 12), mat('#9d9b90'));
    neck.position.y = -0.1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.42);
    g.add(glass, neck, halo);
    g.scale.setScalar(0.001);
    scene.add(g);
    return g;
  }
  const bulbKid = kids.find(k => k.bulb);
  const mainBulb = makeBulb();
  const finaleBulbs = kids.filter((k, i) => !k.bulb && i % 5 === 2).slice(0, 7).map(k => ({ kid: k, bulb: makeBulb(), delay: rand() * 0.3 }));
  const bulbLight = new THREE.PointLight('#fff2b0', 0, 3.2, 1.6);
  scene.add(bulbLight);

  // paper plane drifting over the class
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.22, -0.13, 0.02, 0.12, 0, -0.04, 0.12, 0, 0, -0.22, 0, -0.04, 0.12, 0.13, 0.02, 0.12], 3));
  planeGeo.computeVertexNormals();
  const paperPlane = new THREE.Mesh(planeGeo, surface({ color: '#ffffff', side: THREE.DoubleSide }));
  scene.add(paperPlane);

  // dust in the sunbeams
  const DUST = 260;
  const dustPos = new Float32Array(DUST * 3), dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const z = pick(windowZ) + (rand() - .5) * 1.8, y = 0.3 + rand() * 2.7;
    dustPos.set([-W + 0.2 + (2.95 - y) * 0.95 * rand() + rand() * 0.6, y, z], i * 3);
    dustSeed[i] = rand() * 100;
  }
  const dustBase = dustPos.slice();
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#fff3c9', size: 0.022, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // ---------- the notebook on the mentored student's desk ----------
  const nbCanvas = document.createElement('canvas');
  nbCanvas.width = 1024; nbCanvas.height = 640;
  const nbCtx = nbCanvas.getContext('2d');
  const nbTex = new THREE.CanvasTexture(nbCanvas);
  nbTex.colorSpace = THREE.SRGBColorSpace;
  nbTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const notebook = new THREE.Group();
  notebook.position.set(HERO.x - 0.06, 0.77, ROWS[2] - 0.02);
  notebook.rotation.y = Math.PI + 0.3;
  const nbCover = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.012, 0.36), mat(C.purple));
  const nbPage = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.338), surface({ map: nbTex, roughness: 0.95 }));
  nbPage.receiveShadow = true;
  nbPage.rotation.x = -Math.PI / 2; nbPage.position.y = 0.0065;
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.19, 6), mat(C.lime));
  pencil.rotation.set(Math.PI / 2, 0, 0.9); pencil.position.set(0.2, 0.014, 0.05);
  notebook.add(nbCover, nbPage, pencil);
  scene.add(notebook);
  let nbDrawn = -1;
  function drawNotebook(ticks) {
    const q = Math.round(ticks * 40);
    if (q === nbDrawn) return;
    nbDrawn = q;
    const g = nbCtx, w = 1024, h = 640;
    g.fillStyle = '#fbf8ef'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(111,182,233,.45)'; g.lineWidth = 2;
    for (let y = 92; y < h; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(228,111,83,.6)';
    [70, 582].forEach(x => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
    const spine = g.createLinearGradient(w / 2 - 30, 0, w / 2 + 30, 0);
    spine.addColorStop(0, 'rgba(0,0,0,0)'); spine.addColorStop(0.5, 'rgba(60,40,20,.22)'); spine.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = spine; g.fillRect(w / 2 - 30, 0, 60, h);
    g.fillStyle = '#399aff'; hand(g, 54, 700); g.fillText('my big idea ✎', 90, 70);
    // bulb doodle
    g.strokeStyle = '#25251f'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(250, 260, 70, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    g.beginPath(); g.moveTo(205, 312); g.quadraticCurveTo(222, 350, 224, 372); g.lineTo(276, 372); g.quadraticCurveTo(278, 350, 295, 312); g.stroke();
    g.beginPath(); g.moveTo(226, 392); g.lineTo(274, 392); g.moveTo(232, 410); g.lineTo(268, 410); g.stroke();
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.95 + i * 0.32; g.beginPath(); g.moveTo(250 + Math.cos(a) * 92, 260 + Math.sin(a) * 92); g.lineTo(250 + Math.cos(a) * 118, 260 + Math.sin(a) * 118); g.stroke(); }
    g.fillStyle = 'rgba(178,214,255,.65)'; g.beginPath(); g.arc(250, 260, 52, 0, 7); g.fill();
    g.fillStyle = '#3c3c36'; hand(g, 38);
    g.fillText('what if our school', 90, 498); g.fillText('could save rainwater?', 90, 540);
    g.fillText('ask: who needs it most?', 90, 582);
    // right page: starter kit checklist, ticks appear with the story
    g.fillStyle = '#25251f'; hand(g, 50, 700); g.fillText('idea starter kit', 600, 70);
    ['a curious crew', 'a real problem', 'a fresh perspective', 'a story worth sharing'].forEach((item, i) => {
      const y = 160 + i * 112;
      g.strokeStyle = '#25251f'; g.lineWidth = 3; g.strokeRect(604, y - 38, 44, 44);
      g.fillStyle = '#3c3c36'; hand(g, 46); g.fillText(item, 670, y);
      const t = clamp(ticks * 4 - i);
      if (t > 0) {
        g.strokeStyle = '#399aff'; g.lineWidth = 7; g.beginPath(); g.moveTo(610, y - 18);
        const mid = [622, y - 2], end = [662, y - 52];
        if (t < 0.4) g.lineTo(lerp(610, mid[0], t / 0.4), lerp(y - 18, mid[1], t / 0.4));
        else { g.lineTo(mid[0], mid[1]); g.lineTo(lerp(mid[0], end[0], (t - 0.4) / 0.6), lerp(mid[1], end[1], (t - 0.4) / 0.6)); }
        g.stroke();
      }
    });
    nbTex.needsUpdate = true;
  }

  // ---------- chalk scenes for the blackboard ----------
  const CHALK = '#f4f6f8', CHALK_LIME = '#bfe0ff', CHALK_PINK = '#8fc8ff', CHALK_LILAC = '#d2e7ff';
  const boardBase = document.createElement('canvas');
  boardBase.width = 2048; boardBase.height = 820;
  (() => {
    const g = boardBase.getContext('2d');
    g.fillStyle = C.board; g.fillRect(0, 0, 2048, 820);
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      grd.addColorStop(0, 'rgba(255,255,255,.05)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(r() * 2048, r() * 820); g.scale(140 + r() * 260, 50 + r() * 90); g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    }
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(255,255,255,${r() * .035})`; g.fillRect(r() * 2048, r() * 820, 2, 2); }
  })();
  const text = (t, x, y, size, color = CHALK, weight = 600) => ({ kind: 'text', t, x, y, size, color, weight });
  const doodle = (x, y, w, h, draw) => ({ kind: 'doodle', x, y, w, h, draw });
  const scenes = [
    [
      text("Today's lesson —", 130, 150, 76),
      text('Little ideas.', 130, 345, 190, CHALK, 700),
      text('Big possibilities.', 130, 545, 190, CHALK_LIME, 700),
      doodle(1560, 120, 340, 420, g => {
        g.beginPath(); g.arc(1730, 300, 95, Math.PI * 0.78, Math.PI * 2.22); g.stroke();
        g.beginPath(); g.moveTo(1668, 372); g.quadraticCurveTo(1690, 420, 1692, 452); g.lineTo(1768, 452); g.quadraticCurveTo(1770, 420, 1792, 372); g.stroke();
        g.beginPath(); g.moveTo(1694, 482); g.lineTo(1766, 482); g.moveTo(1702, 508); g.lineTo(1758, 508); g.stroke();
        for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.95 + i * 0.32; g.beginPath(); g.moveTo(1730 + Math.cos(a) * 125, 300 + Math.sin(a) * 125); g.lineTo(1730 + Math.cos(a) * 160, 300 + Math.sin(a) * 160); g.stroke(); }
      }),
      text('MIIC × Codevidhya · 2026', 1240, 735, 66, CHALK_LILAC)
    ],
    [
      text('3 rounds. 1 big leap.', 120, 140, 112, CHALK, 700),
      text('01', 130, 300, 120, CHALK_LIME, 700), text('Think', 130, 410, 96), text('aptitude test', 130, 490, 62), text('online · month 1', 130, 560, 52, CHALK_LILAC),
      doodle(560, 330, 150, 60, g => { g.beginPath(); g.moveTo(570, 360); g.lineTo(690, 360); g.moveTo(660, 335); g.lineTo(692, 360); g.lineTo(660, 385); g.stroke(); }),
      text('02', 760, 300, 120, CHALK_LIME, 700), text('Build', 760, 410, 96), text('idea report + pitch', 760, 490, 62), text('online · month 2', 760, 560, 52, CHALK_LILAC),
      doodle(1240, 330, 150, 60, g => { g.beginPath(); g.moveTo(1250, 360); g.lineTo(1370, 360); g.moveTo(1340, 335); g.lineTo(1372, 360); g.lineTo(1340, 385); g.stroke(); }),
      text('03', 1440, 300, 120, CHALK_PINK, 700), text('Pitch', 1440, 410, 96), text('live campus final', 1440, 490, 62), text('MNIT Jaipur · month 3', 1440, 560, 52, CHALK_LILAC),
      doodle(1410, 190, 200, 150, g => { g.beginPath(); g.ellipse(1500, 262, 92, 70, -0.08, 0, Math.PI * 2); g.stroke(); }),
      text('* proposed schedule — dates to be announced', 130, 730, 50, 'rgba(244,242,232,.7)')
    ],
    [
      text('Got a', 130, 250, 150),
      text('“what if?”', 130, 470, 230, CHALK_LIME, 700),
      text('hands up! ✋', 1290, 300, 120, CHALK_PINK, 700),
      doodle(1240, 560, 700, 120, g => { g.beginPath(); g.moveTo(1260, 650); g.bezierCurveTo(1450, 600, 1700, 690, 1920, 610); g.stroke(); }),
      text('count us in →', 1300, 610, 92, CHALK_LILAC),
      text('teams of 3–4 · classes 6–12', 130, 720, 64)
    ]
  ];
  const sceneCanvases = scenes.map(items => {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 820;
    return { canvas: c, items };
  });
  function renderScenes() {
    sceneCanvases.forEach(({ canvas: c, items }) => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.lineCap = 'round'; g.lineJoin = 'round';
      items.forEach(item => {
        if (item.kind === 'text') {
          g.font = `${item.weight} ${item.size}px Caveat, "Comic Sans MS", cursive`;
          g.fillStyle = item.color;
          g.fillText(item.t, item.x, item.y);
          item.w = g.measureText(item.t).width + 8;
          item.bx = item.x - 4; item.by = item.y - item.size * 0.92; item.bh = item.size * 1.25;
        } else {
          g.strokeStyle = CHALK; g.lineWidth = 9;
          item.draw(g);
          item.bx = item.x; item.by = item.y; item.bh = item.h;
        }
      });
      // chalk grain
      g.globalCompositeOperation = 'destination-out';
      const r = rng(3);
      for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`; g.fillRect(r() * 2048, r() * 820, 1 + r() * 2.5, 1 + r() * 2.5); }
      g.globalCompositeOperation = 'source-over';
      const total = items.reduce((s, it) => s + it.w, 0);
      items.forEach(it => { it.share = it.w / total; });
    });
    boardKey = '';
  }
  let boardKey = '';
  function drawBoard(sceneIndex, reveal) {
    const key = sceneIndex + ':' + Math.round(reveal * 300);
    if (key === boardKey) return;
    boardKey = key;
    boardCtx.drawImage(boardBase, 0, 0);
    const { canvas: src, items } = sceneCanvases[sceneIndex];
    let left = reveal;
    for (const it of items) {
      if (left <= 0) break;
      const f = clamp(left / it.share);
      const w = it.w * f;
      if (w > 1) boardCtx.drawImage(src, it.bx, it.by, w, it.bh, it.bx, it.by, w, it.bh);
      left -= it.share;
    }
    boardTex.needsUpdate = true;
  }
  renderScenes();
  drawNotebook(0);
  if (document.fonts) {
    Promise.all(['600 80px Caveat', '700 80px Caveat', '700 40px "Space Grotesk"'].map(f => document.fonts.load(f))).then(() => {
      renderScenes(); nbDrawn = -1;
    }).catch(() => {});
  }

  flushStatic();

  // ---------- camera path ----------
  // each chapter: camera position, look target; the same order as the HTML panels
  const SHOTS = [
    { pos: [5.0, 1.85, 6.05], look: [-1.6, 1.15, -3.2] },
    { pos: [-0.35, 1.38, 4.45], look: [-0.15, 1.05, -4.5] },
    { pos: [0.3, 1.45, -2.1], look: [1.92, 1.1, -0.83] },
    { pos: [2.25, 2.02, -0.35], look: [2.2, 2.0, -7] },
    { pos: [-1.5, 1.8, -2.0], look: [-0.59, 1.0, 0.33] },
    { pos: [-1.2, 1.78, -0.12], look: [-1.56, 0.76, 0.6] },
    { pos: [0.4, 2.3, -5.55], look: [-0.2, 0.95, 3.2] }
  ];
  const PORTRAIT = [
    { pos: [5.2, 2.05, 6.4], look: [-0.6, 1.75, -3.2] },
    { pos: [-0.25, 1.5, 5.3], look: [-0.15, 1.05, -4.5] },
    { pos: [0.2, 1.5, -2.5], look: [1.52, 1.12, -0.75] },
    { pos: [0.45, 2.05, 0.4], look: [0.4, 2.0, -7] },
    { pos: [-1.3, 1.95, -2.4], look: [-1.05, 1.0, 0.7] },
    { pos: [-1.3, 2.05, -0.3], look: [-1.56, 0.76, 0.62] },
    { pos: [0.3, 2.45, -6.2], look: [-0.1, 0.95, 3.2] }
  ];
  let posCurve, lookCurve;
  function buildCurves() {
    const shots = camera.aspect < 0.85 ? PORTRAIT : SHOTS;
    posCurve = new THREE.CatmullRomCurve3(shots.map(s => new THREE.Vector3(...s.pos)), false, 'centripetal');
    lookCurve = new THREE.CatmullRomCurve3(shots.map(s => new THREE.Vector3(...s.look)), false, 'centripetal');
  }

  // ---------- resize ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    dpr = dprCap();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.85 ? 62 : camera.aspect < 1.3 ? 52 : 42;
    camera.updateProjectionMatrix();
    buildCurves();
    readScroll();
  }
  new ResizeObserver(resize).observe(canvas);

  // ---------- scroll → story clock ----------
  let target = 0, progress = 0, lastActive = -1;
  function readScroll() {
    const rect = section.getBoundingClientRect();
    const total = rect.height - innerHeight;
    target = total > 0 ? clamp(-rect.top / total) : 0;
  }
  addEventListener('scroll', () => { readScroll(); wake(); }, { passive: true });

  function story(p) {
    const s = p * LAST;
    const i = Math.min(LAST - 1, Math.floor(s));
    const f = s - i;
    return { s, c: i + ease(clamp((f - HOLD) / (1 - 2 * HOLD))) };
  }

  function setActive(k) {
    if (k === lastActive) return;
    lastActive = k;
    panels.forEach((p, i) => {
      p.classList.toggle('is-active', i === k);
      p.classList.toggle('is-past', i < k);
    });
    railLinks.forEach((a, i) => a.toggleAttribute('aria-current', i === k));
    if (chapterLabel) chapterLabel.textContent = `${String(k + 1).padStart(2, '0')} / ${String(LAST + 1).padStart(2, '0')} · ${panels[k].dataset.title}`;
    section.dataset.chapter = String(k);
    if (k === 2) countUp();
  }
  let counted = false;
  function countUp() {
    if (counted) return;
    counted = true;
    section.querySelectorAll('[data-cr-count]').forEach(el => {
      const end = Number(el.dataset.crCount);
      const start = performance.now();
      const stepCount = now => {
        const t = clamp((now - start) / 1300);
        el.textContent = Math.round(end * (1 - Math.pow(1 - t, 3))).toLocaleString('en-IN');
        if (t < 1) requestAnimationFrame(stepCount);
      };
      requestAnimationFrame(stepCount);
    });
  }

  // rail and keyboard: jump to a chapter
  const chapterTop = k => {
    const top = section.getBoundingClientRect().top + scrollY;
    const total = section.offsetHeight - innerHeight;
    const s = k === 0 ? 0 : k === LAST ? 1 : k / LAST;
    return top + s * total;
  };
  railLinks.forEach((a, k) => a.addEventListener('click', e => {
    e.preventDefault();
    scrollTo({ top: chapterTop(k), behavior: 'smooth' });
  }));
  panels.forEach((p, k) => p.addEventListener('focusin', () => {
    if (lastActive !== k) scrollTo({ top: chapterTop(k), behavior: 'auto' });
  }));

  // subtle pointer parallax
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    if (!finePointer.matches) return;
    pointer.tx = e.clientX / innerWidth - 0.5;
    pointer.ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  // ---------- frame ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tPos = new THREE.Vector3(), tmp = new THREE.Vector3();
  let time = 0, last = 0, running = false, visible = true, raf = 0, firstFrame = true, intro = 0;

  function teacherAt(c) {
    const i = Math.min(LAST - 1, Math.floor(c));
    const f = c - i;
    const a = TK[i], b = TK[i + 1];
    let p;
    if (b.via && f > 0) {
      const leg = f < 0.5 ? [a.p, b.via, f / 0.5] : [b.via, b.p, (f - 0.5) / 0.5];
      p = [0, 1, 2].map(n => lerp(leg[0][n], leg[1][n], smooth(leg[2])));
    } else p = [0, 1, 2].map(n => lerp(a.p[n], b.p[n], smooth(f)));
    let dr = b.r - a.r;
    return { p, r: a.r + dr * smooth(clamp(f * 1.6)), a, b, f };
  }

  let prevTeacher = new THREE.Vector3(-1.05, 0.18, -6.42), moving = 0, heading = 0;
  const frustum = new THREE.Frustum(), viewProj = new THREE.Matrix4(), kidSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
  // adaptive resolution: if frames stay slow, step the pixel ratio down (never back up mid-visit)
  let slowFrames = 0, sampled = 0;
  const PERF = new URLSearchParams(location.search).has('perf');
  const perf = (window.__perf = { frames: 0, updateMs: 0, renderMs: 0, dpr: 0 });
  function renderFrame(now) {
    const now0 = performance.now();
    raf = 0;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / 1.8);

    progress = SNAP ? target : progress + (target - progress) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - progress) < 0.00005) progress = target;

    const { s, c } = story(progress);
    setActive(Math.round(s));

    // camera
    const u = c / LAST;
    posCurve.getPoint(u, camPos);
    lookCurve.getPoint(u, camLook);
    if (intro < 1) {
      const k = 1 - ease(intro);
      camPos.x += k * 0.8; camPos.y += k * 0.5; camPos.z += k * 1.2;
    }
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    right.subVectors(camLook, camPos).cross(up).normalize();
    camPos.addScaledVector(right, pointer.x * 0.14).addScaledVector(up, -pointer.y * 0.08);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // blackboard: scene 0 written on arrival, rewrites itself as the story moves
    let boardScene, reveal;
    if (c < 2.25) { boardScene = 0; reveal = c < 2.0 ? clamp(intro * 1.4 - 0.15) : 1 - ramp(c, 2.0, 2.25); }
    else if (c < 5.3) { boardScene = 1; reveal = c < 5.05 ? ramp(c, 2.3, 2.95) : 1 - ramp(c, 5.05, 5.3); }
    else { boardScene = 2; reveal = ramp(c, 5.35, 5.95); }
    drawBoard(boardScene, reveal);
    drawNotebook(ramp(c, 4.35, 5.0));

    // teacher: walks the path facing where she goes, then settles into each chapter's pose
    const TT = teacherAt(c);
    tPos.set(...TT.p);
    const vx = tPos.x - prevTeacher.x, vz = tPos.z - prevTeacher.z;
    const speed = Math.hypot(vx, vz) / Math.max(dt, 0.001);
    prevTeacher.copy(tPos);
    moving += (clamp(speed / 0.6) - moving) * (1 - Math.exp(-dt * 8));
    if (speed > 0.05) heading = Math.atan2(-vx, -vz);
    let facing = TT.r + (((heading - TT.r + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * moving;
    teacher.position.copy(tPos);
    teacher.rotation.y = facing;
    teacherShadow.position.set(tPos.x, tPos.y + 0.012, tPos.z);
    const pose = w => (TT.a.pose === w ? 1 - smooth(TT.f) : 0) + (TT.b.pose === w ? smooth(TT.f) : 0);
    const still = 1 - moving;
    const wWrite = pose('write') * still, wPoint = pose('point') * still, wLean = pose('lean') * still, wCheer = pose('cheer') * still;
    walkA.setEffectiveWeight(moving);
    walkA.timeScale = clamp(speed / 1.1, 0.7, 1.8);
    waveA.setEffectiveWeight(wCheer);
    idleA.setEffectiveWeight(Math.max(0, 1 - moving - wCheer));
    teacherRest.forEach(([bone, q]) => bone.quaternion.copy(q));
    mixer.update(dt);
    teacher.updateMatrixWorld(true);
    if (wLean > 0.002) { turn(teacher, tb.Abdomen, RIGHT, -0.16 * wLean); turn(teacher, tb.Torso, RIGHT, -0.14 * wLean); turn(teacher, tb.Head, RIGHT, -0.28 * wLean); }
    const armW = Math.min(1, wWrite + wPoint + wLean);
    if (armW > 0.002) {
      const wig = Math.sin(time * 5) * 0.12 * wWrite;
      armU.set(0, 0, 0).addScaledVector(WRITE_U, wWrite).addScaledVector(POINT_U, wPoint).addScaledVector(LEAN_U, wLean);
      armU.x += wig;
      armL.set(0, 0, 0).addScaledVector(WRITE_L, wWrite).addScaledVector(POINT_L, wPoint).addScaledVector(LEAN_L, wLean);
      aim(teacher, tb['UpperArmR'], tb['LowerArmR'], armU.normalize(), armW);
      aim(teacher, tb['LowerArmR'], tb['WristR'], armL.normalize(), armW);
    }
    chalk.visible = c < 3.6;

    // students (only the ones in view are re-posed)
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    const handsUp = c > 5.2;
    kids.forEach(k => {
      kidSphere.center.set(k.seat.x, 0.95, k.seat.z);
      if (!frustum.intersectsSphere(kidSphere)) return;
      let yaw = 0, bodyYaw = 0, pitch = 0;
      // back benchers turn round to look at the camera
      if (k.lookBack) {
        const w = bell(c, 1, 0.75);
        const toCam = clamp(Math.atan2(-(camPos.x - k.seat.x), -(camPos.z - k.seat.z)), -2.1, 2.1);
        yaw = lerp(yaw, toCam, w);
        bodyYaw = toCam * w;
      }
      // near the mentor, heads turn toward the teacher
      const dT = Math.hypot(tPos.x - k.seat.x, tPos.z - k.seat.z);
      if (dT < 2.4 && c > 3.4 && c < 5.6) {
        const w = bell(c, 4.5, 1.15) * (k.hero ? 1 : 0.7);
        const toT = clamp(Math.atan2(-(tPos.x - k.seat.x), -(tPos.z - k.seat.z)), -1.6, 1.6);
        yaw = lerp(yaw, toT, w);
        bodyYaw = lerp(bodyYaw, toT, w);
      }
      if (k.hero) pitch = lerp(pitch, -0.5, bell(c, 5, 0.6));
      if (k.bulb) pitch = lerp(pitch, 0.18, bell(c, 2, 0.7));

      let raise = 0;
      if (k.eager) raise = Math.max(raise, bell(c, 3, 0.75));
      if (k.bulb) raise = Math.max(raise, bell(c, 2, 0.6) * 0.85);
      if (handsUp) raise = Math.max(raise, ramp(c, 5.3 + k.delay, 5.75 + k.delay));
      raise = clamp(raise);
      const key = `${yaw.toFixed(3)} ${bodyYaw.toFixed(3)} ${pitch.toFixed(3)} ${raise.toFixed(3)}`;
      if (key === k.poseKey) return;
      k.poseKey = key;
      poseKid(k, yaw, bodyYaw, pitch, raise);
      k.dirty = true;
    });

    // idea bulbs
    const bulbW = bell(c, 2, 0.7);
    mainBulb.scale.setScalar(Math.max(0.001, bulbW * 0.8 * (1 + Math.sin(time * 3) * 0.05)));
    bulbKid.bones.Head.getWorldPosition(_b);
    mainBulb.position.set(_b.x, _b.y + 0.34 + Math.sin(time * 2) * 0.03, _b.z);
    bulbLight.position.copy(mainBulb.position);
    bulbLight.intensity = bulbW * 2.2;
    finaleBulbs.forEach(b => {
      const w = ramp(c, 5.45 + b.delay, 5.9 + b.delay);
      b.bulb.scale.setScalar(Math.max(0.001, w * 0.8));
      if (w > 0.01) {
        b.kid.bones.Head.getWorldPosition(_b);
        b.bulb.position.set(_b.x, _b.y + 0.36 + Math.sin(time * 2 + b.delay * 9) * 0.03, _b.z);
      }
    });

    // ambient life
    {
      fans.forEach((f, i) => { f.rotation.y += dt * (5.5 + i); });
      const pt = time * 0.22;
      paperPlane.position.set(Math.sin(pt) * 3.4, 2.55 + Math.sin(pt * 2.3) * 0.25, 0.8 + Math.cos(pt) * 2.6);
      tmp.set(Math.cos(pt) * 3.4, Math.cos(pt * 2.3) * 0.58, -Math.sin(pt) * 2.6).normalize();
      paperPlane.lookAt(tmp.multiplyScalar(-1).add(paperPlane.position));
      paperPlane.rotateZ(Math.sin(pt) * 0.4);
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST; i++) {
        const sd = dustSeed[i];
        arr[i * 3] = dustBase[i * 3] + Math.sin(time * 0.3 + sd) * 0.08;
        arr[i * 3 + 1] = dustBase[i * 3 + 1] + Math.sin(time * 0.2 + sd * 1.3) * 0.12;
        arr[i * 3 + 2] = dustBase[i * 3 + 2] + Math.cos(time * 0.25 + sd) * 0.08;
      }
      dustGeo.attributes.position.needsUpdate = true;
      globe.rotation.y += dt * 0.3;
    }
    minuteHand.rotation.z = -(c / LAST) * Math.PI * 2 * 1.5 - 0.6;
    hourHand.rotation.z = -(c / LAST) * Math.PI * 0.25 - 2.6;

    const tRender = performance.now();
    renderer.render(scene, camera);
    if (PERF) {
      perf.frames++;
      perf.updateMs += tRender - now0;
      perf.renderMs += performance.now() - tRender;
      perf.dpr = dpr;
    }
    if ((!SNAP || PERF) && last && dt < 0.1) {
      sampled++;
      if (dt > 1 / 40) slowFrames++;
      if (sampled >= 90) {
        if (slowFrames > 45 && dpr > 0.75) {
          dpr = Math.max(0.75, dpr - 0.25);
          renderer.setPixelRatio(dpr);
          renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        }
        sampled = slowFrames = 0;
      }
    }
    if (firstFrame) {
      firstFrame = false;
      root.classList.remove('cr-pending');
      root.classList.add('cr-live');
    }
    if (running) raf = requestAnimationFrame(renderFrame);
  }

  function wake() {
    if (!visible || document.hidden) return;
    running = true;
    if (!raf) { last = 0; raf = requestAnimationFrame(renderFrame); }
  }
  function sleep() { running = false; cancelAnimationFrame(raf); raf = 0; }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? wake() : sleep();
  }, { rootMargin: '120px' }).observe(section);
  document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));
  new MutationObserver(wake).observe(root, { attributes: true, attributeFilter: ['class'] });

  renderer.shadowMap.needsUpdate = true;
  resize();
  readScroll();
  progress = target;
  wake();
}

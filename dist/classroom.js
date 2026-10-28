// Scroll-driven 3D classroom. The camera walks a fixed path through the room
// (door → back bench → rows → blackboard → mentor desk → notebook → hands up)
// and every animation is keyed to one continuous "story clock" derived from scroll.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const root = document.documentElement;
const section = document.getElementById('classroom');
const canvas = section.querySelector('.cr-canvas');
const panels = [...section.querySelectorAll('.cr-panel')];
const railLinks = [...section.querySelectorAll('.cr-rail a')];
const chapterLabel = section.querySelector('.cr-chapter-label');
const chapterBar = section.querySelector('.cr-chapter-bar i');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const LAST = panels.length - 1;
const HOLD = 0.2;

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

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  fail();
}
if (renderer) build();

function build() {
  const isSmall = () => innerWidth < 760;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const C = {
    wall: '#f3ecdb', dado: '#c7b8f0', skirting: '#7850ce', floor: '#c99c6e', ceiling: '#f8f4ea',
    wood: '#d9a670', woodDark: '#8f5d3a', metal: '#4b4c44', lime: '#cfe97a', purple: '#7850ce',
    ink: '#25251f', board: '#2d3b33', frame: '#8a5a35', paper: '#fbf8ef', white: '#f6f5ef'
  };
  scene.background = new THREE.Color(C.wall);
  scene.fog = new THREE.Fog(C.wall, 16, 30);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);

  scene.add(new THREE.HemisphereLight('#fff9ec', '#b9a58e', 1.55));
  const sun = new THREE.DirectionalLight('#fff1d6', 1.5);
  sun.position.set(-9, 8, 2);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#e6ddff', 0.45);
  fill.position.set(6, 4, -6);
  scene.add(fill);

  // ---------- materials ----------
  const ramp3 = new THREE.DataTexture(new Uint8Array([140, 140, 140, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp3.minFilter = ramp3.magFilter = THREE.NearestFilter;
  ramp3.needsUpdate = true;
  const materials = new Map();
  const mat = color => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshToonMaterial({ color, gradientMap: ramp3 }));
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
    buckets.forEach((list, material) => {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), material);
      mesh.matrixAutoUpdate = false;
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshToonMaterial({ map: floorTex, gradientMap: ramp3 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallM = mat(C.wall), dadoM = mat(C.dado), skirtM = mat(C.skirting);
  box(basic('#efe8d8'), W * 2, 0.1, D * 2, 0, H + 0.05, 0);
  // walls: upper paint + lilac dado + purple trim line
  [[0, -D - 0.05, W * 2, 0], [0, D + 0.05, W * 2, 0], [-W - 0.05, 0, D * 2, Math.PI / 2], [W + 0.05, 0, D * 2, Math.PI / 2]].forEach(([x, z, len, ry]) => {
    box(wallM, len, H - 1.1, 0.1, x, 1.1 + (H - 1.1) / 2, z, ry);
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
  const skyM = basic('#ffffff', { map: skyTex });
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
  const sunDir = new THREE.Vector3(1, -1.05, 0.28);
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
    // sunlit patch on the floor
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), sunPatchMat());
    const a = floorPts[0], b = floorPts[2];
    patch.position.set((a.x + b.x) / 2, 0.012, (a.z + b.z) / 2);
    patch.scale.set(Math.abs(b.x - a.x) + 0.3, Math.abs(b.z - a.z) + 0.2, 1);
    patch.rotation.x = -Math.PI / 2;
    scene.add(patch);
  });
  scene.add(new THREE.Mesh(mergeGeometries(shaftGeos), shaftMat));
  function sunPatchMat() {
    if (sunPatchMat.m) return sunPatchMat.m;
    const t = canvasTexture(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,240,200,.55)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    return (sunPatchMat.m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  // soft contact shadows
  const blobTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(60,40,25,.55)'); grd.addColorStop(1, 'rgba(60,40,25,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const blobM = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55 });
  const blob = (x, z, sx, sz, y = 0.01) => addStatic(new THREE.PlaneGeometry(sx, sz), blobM, x, y, z, -Math.PI / 2);

  // ---------- blackboard ----------
  const BOARD = { x: 0.4, y: 2.15, w: 5.0, h: 2.0 };
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 2048; boardCanvas.height = 820;
  const boardCtx = boardCanvas.getContext('2d');
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: boardTex, color: '#e9e9e2' }));
  boardMesh.position.set(BOARD.x, BOARD.y, -D + 0.04);
  scene.add(boardMesh);
  const frame = mat(C.frame);
  box(frame, BOARD.w + 0.24, 0.12, 0.08, BOARD.x, BOARD.y + BOARD.h / 2 + 0.06, -D + 0.04);
  box(frame, BOARD.w + 0.24, 0.12, 0.08, BOARD.x, BOARD.y - BOARD.h / 2 - 0.06, -D + 0.04);
  box(frame, 0.12, BOARD.h, 0.08, BOARD.x - BOARD.w / 2 - 0.06, BOARD.y, -D + 0.04);
  box(frame, 0.12, BOARD.h, 0.08, BOARD.x + BOARD.w / 2 + 0.06, BOARD.y, -D + 0.04);
  box(frame, BOARD.w, 0.04, 0.16, BOARD.x, BOARD.y - BOARD.h / 2 - 0.1, -D + 0.12);
  [[-1.4, '#ffffff'], [-1.25, '#f4c8de'], [-1.12, '#dcf68d'], [1.6, '#ffffff']].forEach(([dx, color]) => addStatic(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), mat(color), BOARD.x + dx, BOARD.y - BOARD.h / 2 - 0.065, -D + 0.12, 0, 0.3, Math.PI / 2));
  box(mat('#6b4a2f'), 0.22, 0.05, 0.08, BOARD.x + 1.95, BOARD.y - BOARD.h / 2 - 0.055, -D + 0.12);
  box(mat('#f1efe6'), 0.2, 0.02, 0.07, BOARD.x + 1.95, BOARD.y - BOARD.h / 2 - 0.085, -D + 0.12);

  // bunting above the board
  const flagColors = [C.purple, C.lime, '#f2b8d0', '#ffffff', '#9fd3f2'];
  for (let i = 0; i < 17; i++) {
    const t = i / 16, x = lerp(-3.6, 4.4, t), y = 3.68 - Math.sin(t * Math.PI) * 0.22;
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0); shape.lineTo(0.15, 0); shape.lineTo(0, -0.28); shape.closePath();
    addStatic(new THREE.ShapeGeometry(shape), mat(flagColors[i % flagColors.length]), x, y, -D + 0.09);
  }
  // sign above bunting
  const signTex = canvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = '#25251f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dcf68d'; g.font = '700 58px "Space Grotesk", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MNIT × CODEVIDHYA · IDEATHON 2026', w / 2, h / 2 + 3);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.35), basic('#ffffff', { map: signTex }));
  sign.position.set(BOARD.x, 3.98, -D + 0.06);
  scene.add(sign);

  // ---------- posters & noticeboards ----------
  function poster(w, h, px, draw, x, y, z, ry) {
    const t = canvasTexture(px, Math.round(px * h / w), draw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshToonMaterial({ map: t, gradientMap: ramp3 }));
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
    g.fillStyle = '#dcf68d'; g.font = '700 40px "Space Grotesk", sans-serif'; g.textAlign = 'center'; g.fillText('OUR BIG IDEAS ✳', w / 2, 63);
    const notes = ['solar bus stop', 'smart dustbin', 'app for lost pets', 'rain saver', 'quiz buddy', 'plant doctor', 'safe crossing', 'water alert', 'book swap', 'clean air map', 'kind canteen', 'what if…?'];
    const colors = ['#fff3a3', '#dcf68d', '#e2d5ff', '#ffd1df', '#bfe6ff', '#ffffff'];
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
    g.fillStyle = '#7850ce'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dcf68d'; g.font = '700 74px "Space Grotesk", sans-serif'; g.textAlign = 'left';
    ['THINK.', 'BUILD.', 'PITCH.'].forEach((t, i) => g.fillText(t, 40, 150 + i * 96));
    g.fillStyle = '#ffffff'; hand(g, 46); g.fillText('little ideas,', 40, 520); g.fillText('big possibilities ✳', 40, 566);
    g.strokeStyle = '#dcf68d'; g.lineWidth = 5; g.beginPath(); g.arc(380, 410, 44, 0, 7); g.stroke();
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
    g.fillStyle = '#dcf68d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#25251f'; g.font = '700 30px "Space Grotesk", sans-serif'; g.fillText('IDEATHON', 24, 66); g.fillText('2026', 24, 100);
    g.font = '700 120px "Space Grotesk", sans-serif'; g.fillStyle = '#7850ce'; g.fillText('✳', 70, 270);
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
  const bookColors = [C.purple, '#e46f53', C.lime, '#6fb6e9', '#f6c445', '#f2b8d0'];
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
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), new THREE.MeshToonMaterial({ map: globeTex, gradientMap: ramp3 }));
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
    if (n && rand() > .4) box(mat(pick(['#7850ce', '#e46f53', '#6fb6e9'])), 0.18, 0.035, 0.06, cx + (rand() - .5), 0.785, z - 0.15, (rand() - .5));
  }));

  // ---------- characters ----------
  const SKIN = ['#c98e66', '#b67a55', '#d9a27c', '#a86d4b', '#e0b08a', '#c4875f'];
  const HAIR = ['#2a1d17', '#3b2a20', '#1e1a18', '#4a3226'];
  const SHIRT = ['#f6f5ef', '#d6e5f6', '#f6f5ef', '#d6e5f6', '#ece4ff'];
  const TIE = ['#7850ce', '#2f3a6b', '#8d2f3c'];
  const eyeM = mat('#1d1b18'), cheekM = mat('#ea8f86');
  const geo = {
    torso: new THREE.CapsuleGeometry(0.15, 0.22, 4, 12),
    head: new THREE.SphereGeometry(0.15, 22, 16),
    hair: new THREE.SphereGeometry(0.162, 22, 14, 0, Math.PI * 2, 0, 1.75),
    eye: new THREE.SphereGeometry(0.019, 8, 6),
    cheek: new THREE.SphereGeometry(0.026, 8, 6),
    arm: new THREE.CapsuleGeometry(0.048, 0.22, 4, 8),
    hand: new THREE.SphereGeometry(0.052, 10, 8),
    tie: new THREE.BoxGeometry(0.05, 0.18, 0.02),
    braid: new THREE.CapsuleGeometry(0.04, 0.18, 4, 8),
    bun: new THREE.SphereGeometry(0.075, 12, 10)
  };

  function makeArm(color, skin, len = 0.22) {
    const pivot = new THREE.Group();
    const arm = new THREE.Mesh(len === 0.22 ? geo.arm : new THREE.CapsuleGeometry(0.05, len, 4, 8), mat(color));
    arm.position.y = -(len / 2 + 0.04);
    const handM = new THREE.Mesh(geo.hand, mat(skin));
    handM.position.y = -(len + 0.1);
    pivot.add(arm, handM);
    return pivot;
  }
  function makeFace(head, skin, hairColor, girl) {
    const headMesh = new THREE.Mesh(geo.head, mat(skin));
    const hair = new THREE.Mesh(geo.hair, mat(hairColor));
    hair.rotation.x = 0.42; hair.position.set(0, 0.012, 0.008);
    head.add(headMesh, hair);
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(geo.eye, eyeM); eye.position.set(s * 0.055, 0.02, -0.138); head.add(eye);
      const cheek = new THREE.Mesh(geo.cheek, cheekM); cheek.position.set(s * 0.088, -0.035, -0.118); cheek.scale.set(1, 0.6, 0.5); head.add(cheek);
    });
    if (girl) {
      [-1, 1].forEach(s => {
        const braid = new THREE.Mesh(geo.braid, mat(hairColor));
        braid.position.set(s * 0.11, -0.13, 0.08); braid.rotation.z = s * 0.15;
        head.add(braid);
        const ribbon = new THREE.Mesh(geo.cheek, mat(C.purple)); ribbon.position.set(s * 0.12, -0.25, 0.085); head.add(ribbon);
      });
    }
  }

  const kids = [];
  const seatFor = (cx, z, side) => ({ x: cx + side * 0.38, z: z + 0.48 });
  const HERO = seatFor(COLS[1], ROWS[2], 1);   // mentored student, aisle seat
  const BULB = seatFor(COLS[2], ROWS[1], -1);  // "aha" student, aisle seat
  const LOOKBACK = [seatFor(COLS[1], ROWS[3], 1), seatFor(COLS[2], ROWS[3], -1), seatFor(COLS[2], ROWS[2], -1)];
  const EAGER = [seatFor(COLS[1], ROWS[0], 1), seatFor(COLS[2], ROWS[0], 1), seatFor(COLS[0], ROWS[1], 1)];
  const same = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
  const reserved = [HERO, BULB, ...LOOKBACK, ...EAGER];
  COLS.forEach(cx => ROWS.forEach(z => [-1, 1].forEach(side => {
    const seat = seatFor(cx, z, side);
    if (!reserved.some(r => same(r, seat)) && rand() < 0.14) return;
    const girl = rand() < 0.5, skin = pick(SKIN), hairColor = pick(HAIR), shirt = pick(SHIRT);
    const kid = new THREE.Group();
    kid.position.set(seat.x, 0.455, seat.z);
    const body = new THREE.Group();
    kid.add(body);
    const torso = new THREE.Mesh(geo.torso, mat(shirt)); torso.position.y = 0.27; body.add(torso);
    const tie = new THREE.Mesh(geo.tie, mat(pick(TIE))); tie.position.set(0, 0.33, -0.148); body.add(tie);
    const head = new THREE.Group(); head.position.y = 0.66; body.add(head);
    makeFace(head, skin, hairColor, girl);
    const arms = [-1, 1].map(s => {
      const a = makeArm(shirt, skin);
      a.position.set(s * 0.19, 0.42, 0);
      body.add(a);
      return a;
    });
    scene.add(kid);
    const k = {
      group: kid, body, head, arms, seat, phase: rand() * 10,
      writer: rand() < 0.35, delay: rand() * 0.35, raiseSide: rand() < 0.75 ? 1 : 0,
      hero: same(seat, HERO), bulb: same(seat, BULB),
      lookBack: LOOKBACK.some(r => same(r, seat)), eager: EAGER.some(r => same(r, seat))
    };
    kids.push(k);
  })));
  const heroKid = kids.find(k => k.hero);

  // teacher: saree, blouse, bun, chalk
  const teacher = new THREE.Group();
  scene.add(teacher);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.29, 0.98, 20), mat('#8e6ad9'));
  skirt.position.y = 0.49;
  const border = new THREE.Mesh(new THREE.CylinderGeometry(0.292, 0.3, 0.07, 20), mat(C.lime));
  border.position.y = 0.035;
  teacher.add(skirt, border);
  const upper = new THREE.Group(); upper.position.y = 0.95; teacher.add(upper);
  const tTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), mat('#f1e3c8')); tTorso.position.y = 0.24; upper.add(tTorso);
  const pallu = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.355), mat('#7850ce'));
  pallu.position.set(-0.05, 0.27, 0); pallu.rotation.z = 0.55; upper.add(pallu);
  const tHead = new THREE.Group(); tHead.position.y = 0.66; upper.add(tHead);
  makeFace(tHead, '#c18762', '#1f1915', false);
  const bun = new THREE.Mesh(geo.bun, mat('#1f1915')); bun.position.set(0, 0.06, 0.15); tHead.add(bun);
  const bindi = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), mat('#c8283c')); bindi.position.set(0, 0.075, -0.147); tHead.add(bindi);
  const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 16), mat(C.ink));
  [-1, 1].forEach(s => { const gl = glasses.clone(); gl.position.set(s * 0.056, 0.02, -0.15); tHead.add(gl); });
  const tArms = [-1, 1].map(s => {
    const a = makeArm('#f1e3c8', '#c18762', 0.34);
    a.position.set(s * 0.22, 0.44, 0);
    upper.add(a);
    return a;
  });
  const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), mat('#ffffff'));
  chalk.position.set(0, -0.48, -0.03); chalk.rotation.x = 1.2;
  tArms[1].add(chalk);
  const tShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobM);
  tShadow.rotation.x = -Math.PI / 2;
  scene.add(tShadow);

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
    grd.addColorStop(0, 'rgba(255,246,190,1)'); grd.addColorStop(0.35, 'rgba(240,250,170,.45)'); grd.addColorStop(1, 'rgba(220,246,141,0)');
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
  const paperPlane = new THREE.Mesh(planeGeo, new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: ramp3, side: THREE.DoubleSide }));
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
  const nbPage = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.338), new THREE.MeshBasicMaterial({ map: nbTex, color: '#f4f1e6' }));
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
    g.fillStyle = '#7850ce'; hand(g, 54, 700); g.fillText('my big idea ✎', 90, 70);
    // bulb doodle
    g.strokeStyle = '#25251f'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(250, 260, 70, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
    g.beginPath(); g.moveTo(205, 312); g.quadraticCurveTo(222, 350, 224, 372); g.lineTo(276, 372); g.quadraticCurveTo(278, 350, 295, 312); g.stroke();
    g.beginPath(); g.moveTo(226, 392); g.lineTo(274, 392); g.moveTo(232, 410); g.lineTo(268, 410); g.stroke();
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.95 + i * 0.32; g.beginPath(); g.moveTo(250 + Math.cos(a) * 92, 260 + Math.sin(a) * 92); g.lineTo(250 + Math.cos(a) * 118, 260 + Math.sin(a) * 118); g.stroke(); }
    g.fillStyle = 'rgba(220,246,141,.6)'; g.beginPath(); g.arc(250, 260, 52, 0, 7); g.fill();
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
        g.strokeStyle = '#7850ce'; g.lineWidth = 7; g.beginPath(); g.moveTo(610, y - 18);
        const mid = [622, y - 2], end = [662, y - 52];
        if (t < 0.4) g.lineTo(lerp(610, mid[0], t / 0.4), lerp(y - 18, mid[1], t / 0.4));
        else { g.lineTo(mid[0], mid[1]); g.lineTo(lerp(mid[0], end[0], (t - 0.4) / 0.6), lerp(mid[1], end[1], (t - 0.4) / 0.6)); }
        g.stroke();
      }
    });
    nbTex.needsUpdate = true;
  }

  // ---------- chalk scenes for the blackboard ----------
  const CHALK = '#f4f2e8', CHALK_LIME = '#e1f7a0', CHALK_PINK = '#f4c8de', CHALK_LILAC = '#d9cbff';
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
      text('MNIT × Codevidhya · 2026', 1240, 735, 66, CHALK_LILAC)
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
    { pos: [5.2, 2.05, 6.4], look: [-0.6, 1.1, -3.2] },
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
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
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
  const calm = () => reduce.matches || root.classList.contains('motion-paused');

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
      if (calm()) { el.textContent = end.toLocaleString('en-IN'); return; }
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
    scrollTo({ top: chapterTop(k), behavior: calm() ? 'auto' : 'smooth' });
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

  let prevTeacher = new THREE.Vector3(-1.05, 0.18, -6.42), walk = 0;
  function renderFrame(now) {
    raf = 0;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    const still = calm();
    if (!still) time += dt;
    intro = still ? 1 : Math.min(1, intro + dt / 1.8);

    if (still) progress = Math.round(target * LAST) / LAST;
    else progress += (target - progress) * (1 - Math.exp(-dt * 5.5));
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
    if (!still) {
      right.subVectors(camLook, camPos).cross(up).normalize();
      camPos.addScaledVector(right, pointer.x * 0.14).addScaledVector(up, -pointer.y * 0.08);
      camPos.y += Math.sin(time * 0.6) * 0.012;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // blackboard: scene 0 written on arrival, rewrites itself as the story moves
    let boardScene, reveal;
    if (c < 2.25) { boardScene = 0; reveal = c < 2.0 ? (still ? 1 : clamp(intro * 1.4 - 0.15)) : 1 - ramp(c, 2.0, 2.25); }
    else if (c < 5.3) { boardScene = 1; reveal = c < 5.05 ? ramp(c, 2.3, 2.95) : 1 - ramp(c, 5.05, 5.3); }
    else { boardScene = 2; reveal = ramp(c, 5.35, 5.95); }
    drawBoard(boardScene, still ? Math.round(reveal) : reveal);
    drawNotebook(still ? (c > 4.5 ? 1 : 0) : ramp(c, 4.35, 5.0));

    // teacher
    const T = teacherAt(c);
    tPos.set(...T.p);
    teacher.position.copy(tPos);
    teacher.rotation.y = T.r;
    const speed = tmp.subVectors(tPos, prevTeacher).length() / Math.max(dt, 0.001);
    prevTeacher.copy(tPos);
    walk += Math.min(speed, 3) * dt * 7;
    const moving = clamp(speed / 0.8);
    teacher.position.y += Math.abs(Math.sin(walk)) * 0.03 * moving;
    skirt.rotation.z = Math.sin(walk) * 0.05 * moving;
    tShadow.position.set(tPos.x, T.p[1] + 0.012, tPos.z);
    const pose = w => (T.a.pose === w ? 1 - smooth(T.f) : 0) + (T.b.pose === w ? smooth(T.f) : 0);
    const wWrite = pose('write'), wPoint = pose('point'), wLean = pose('lean'), wCheer = pose('cheer');
    upper.rotation.x = -0.32 * wLean;
    tHead.rotation.x = -0.25 * wLean;
    tHead.rotation.y = Math.sin(time * 0.7) * 0.12 * (1 - wWrite);
    const writeWiggle = Math.sin(time * 5) * 0.12;
    tArms[1].rotation.x = 2.55 * wWrite + writeWiggle * wWrite + 1.5 * wPoint + 0.75 * wLean + 2.75 * wCheer + Math.sin(time * 4) * 0.1 * wCheer;
    tArms[1].rotation.z = 0.1 + 0.4 * wWrite + 0.85 * wPoint + 0.1 * wLean + 0.35 * wCheer + Math.sin(time * 5) * 0.08 * wWrite;
    tArms[0].rotation.x = 0.15 + 0.55 * wLean + 2.75 * wCheer + Math.sin(time * 4 + 1) * 0.1 * wCheer;
    tArms[0].rotation.z = -0.12 - 0.35 * wCheer;
    chalk.visible = wCheer < 0.5;

    // students
    const handsUp = c > 5.2;
    kids.forEach(k => {
      const t = time + k.phase;
      let yaw = Math.sin(t * 0.35) * 0.18, pitch = 0, lean = Math.sin(t * 0.8) * 0.02;
      // back benchers turn round to look at the camera
      if (k.lookBack) {
        const w = bell(c, 1, 0.75);
        const toCam = Math.atan2(-(camPos.x - k.seat.x), -(camPos.z - k.seat.z));
        yaw = lerp(yaw, clamp(toCam, -2.1, 2.1), w);
      }
      // near the mentor, heads turn toward the teacher
      const dT = Math.hypot(tPos.x - k.seat.x, tPos.z - k.seat.z);
      if (dT < 2.4 && c > 3.4 && c < 5.6) {
        const w = bell(c, 4.5, 1.15) * (k.hero ? 1 : 0.7);
        const toT = Math.atan2(-(tPos.x - k.seat.x), -(tPos.z - k.seat.z));
        yaw = lerp(yaw, clamp(toT, -1.6, 1.6), w);
      }
      if (k.hero) pitch = -0.42 * bell(c, 5, 0.6);
      if (k.bulb) { pitch = 0.12 * bell(c, 2, 0.7); }
      k.body.rotation.y = yaw * 0.38;
      k.head.rotation.y = yaw * 0.62;
      k.head.rotation.x = pitch;
      k.body.rotation.x = lean;

      let raise = 0;
      if (k.eager) raise = Math.max(raise, bell(c, 3, 0.75));
      if (k.bulb) raise = Math.max(raise, bell(c, 2, 0.6) * 0.75);
      if (handsUp) raise = Math.max(raise, ramp(c, 5.3 + k.delay, 5.75 + k.delay));
      const writing = k.writer && raise < 0.1 ? Math.sin(t * 9) * 0.06 : 0;
      k.arms.forEach((a, i) => {
        const isRaiser = (i === 1) === Boolean(k.raiseSide);
        const r = isRaiser ? raise : 0;
        const wave = r > 0.6 ? Math.sin(t * 6) * 0.14 * r : 0;
        a.rotation.x = lerp(1.15 + (i === 1 ? writing : 0), 3.05, r) + wave;
        a.rotation.z = lerp(i ? -0.18 : 0.18, i ? 0.32 : -0.32, r);
        a.scale.y = lerp(1, 1.4, r);
      });
      if (raise > 0.5) k.group.position.y = 0.455 + Math.sin(t * 7) * 0.012 * raise;
      else k.group.position.y = 0.455;
    });

    // idea bulbs
    const bulbW = bell(c, 2, 0.7);
    mainBulb.scale.setScalar(Math.max(0.001, bulbW * 0.8 * (1 + Math.sin(time * 3) * 0.05)));
    mainBulb.position.set(bulbKid.seat.x, 1.62 + Math.sin(time * 2) * 0.03, bulbKid.seat.z);
    bulbLight.position.copy(mainBulb.position);
    bulbLight.intensity = bulbW * 2.2;
    finaleBulbs.forEach(b => {
      const w = ramp(c, 5.45 + b.delay, 5.9 + b.delay);
      b.bulb.scale.setScalar(Math.max(0.001, w * 0.8));
      b.bulb.position.set(b.kid.seat.x, 1.66 + Math.sin(time * 2 + b.delay * 9) * 0.03, b.kid.seat.z);
    });

    // ambient life
    if (!still) {
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

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      root.classList.remove('cr-pending');
      root.classList.add('cr-live');
    }
    // with motion off, only draw while the camera is still catching up
    if (still && progress === target) running = false;
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
  reduce.addEventListener('change', wake);

  resize();
  readScroll();
  progress = target;
  wake();
}

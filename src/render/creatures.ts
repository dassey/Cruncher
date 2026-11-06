import {
  BackSide,
  ShaderMaterial,
  BufferAttribute,
  BufferGeometry as BG,
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type BufferGeometry,
  type Object3D,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from '@iwsdk/core';
import { CanvasPanel, FONT_DISPLAY, css, neonText } from './text.js';

/**
 * Original absurd-hybrid "Bugz" (see docs/RESEARCH.md §2). Procedural
 * placeholders built from primitives: readable silhouettes, big googly eyes.
 * Each creature exposes the parts its animation needs.
 */
export type BugType = 'sockodile' | 'blendingo' | 'wifido' | 'duckuum';
export const BUG_TYPES: BugType[] = ['wifido', 'sockodile', 'blendingo', 'duckuum'];
export const BUG_NAMES: Record<BugType, string> = {
  sockodile: 'SOCKODILE',
  blendingo: 'BLENDINGO',
  wifido: 'WI-FIDO',
  duckuum: 'DUCKUUM',
};

export const BUG_TELLS: Record<BugType, string> = {
  wifido: 'BUMPS YOUR HANDS. PUNCH IT.',
  sockodile: 'SHAKES, THEN LUNGES. PUNCH FIRST!',
  blendingo: 'SCRAMBLES NUMBERS. READ AGAIN.',
  duckuum: 'SWEEPS THE ROWS. BONK IT.',
};

export interface Creature {
  type: BugType | 'boss';
  root: Group;
  /** Moves for "talk"/"lunge" animations. */
  jaw: Object3D | null;
  spinner: Object3D | null;
  eyes: Object3D[];
  legs: Object3D[];
  /** Base scale of the model (m). */
  size: number;
}

const geo = {
  sphere: new SphereGeometry(0.5, 16, 12),
  sphereLo: new SphereGeometry(0.5, 10, 8),
  box: new BoxGeometry(1, 1, 1),
  cyl: new CylinderGeometry(0.5, 0.5, 1, 16),
  cone: new ConeGeometry(0.5, 1, 12),
  torus: new TorusGeometry(0.5, 0.12, 8, 20),
};

const matCache = new Map<string, MeshLambertMaterial | MeshBasicMaterial>();
function lambert(color: number, emissive = 0x000000): MeshLambertMaterial {
  const key = `l${color}:${emissive}`;
  let m = matCache.get(key) as MeshLambertMaterial | undefined;
  if (!m) {
    m = new MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.6 });
    matCache.set(key, m);
  }
  return m;
}
function basic(color: number): MeshBasicMaterial {
  const key = `b${color}`;
  let m = matCache.get(key) as MeshBasicMaterial | undefined;
  if (!m) {
    m = new MeshBasicMaterial({ color, toneMapped: false });
    matCache.set(key, m);
  }
  return m;
}

function part(g: BufferGeometry, mat: MeshLambertMaterial | MeshBasicMaterial, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(g, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

/** Googly eye: white ball + black pupil that will wobble. */
function googly(size: number, x: number, y: number, z: number): Group {
  const g = new Group();
  g.add(part(geo.sphereLo, basic(0xffffff), size, size, size * 0.7));
  const pupil = part(geo.sphereLo, basic(0x050008), size * 0.45, size * 0.45, size * 0.3, 0, -size * 0.08, size * 0.3);
  pupil.name = 'pupil';
  g.add(pupil);
  g.position.set(x, y, z);
  return g;
}

function stripeTexture(a: number, b: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = css(i % 2 ? a : b);
    g.fillRect(0, i * 8, 64, 8);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

let sockMat: MeshLambertMaterial | null = null;

const mergedLit = new MeshLambertMaterial({ vertexColors: true });

/** Neon toon outline: back-faces pushed out along normals, flat colour. */
function outlineMaterial(color: number, width: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uWidth: { value: width } },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        vec3 p = position + normalize(normal) * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: BackSide,
    toneMapped: false,
  });
}

export const BUG_OUTLINE: Record<string, number> = {
  wifido: 0x00f0ff,
  sockodile: 0x39ff88,
  blendingo: 0xff2bd6,
  duckuum: 0xffe14d,
  boss: 0xff2bd6,
};
const mergedUnlit = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/**
 * Draw-call diet: bake the creature's static, opaque, untextured direct-child
 * meshes into one lit + one unlit mesh with vertex colours. Animated parts
 * (jaw, eyes, legs, spinners) are groups and stay separate.
 */
export function mergeStatic(root: Group, outline?: { color: number; width: number }): void {
  const lit: Mesh[] = [];
  const unlit: Mesh[] = [];
  for (const c of root.children) {
    const m = c as Mesh;
    if (!m.isMesh || m.userData.keep) continue;
    const mat = m.material as MeshLambertMaterial | MeshBasicMaterial;
    if (!Array.isArray(mat) && mat.map && !mat.transparent && outline) {
      // Textured parts stay separate but still get the outline shell.
      const sc = (m.scale.x + m.scale.y + m.scale.z) / 3;
      const o = new Mesh(m.geometry, outlineMaterial(outline.color, outline.width / Math.max(1e-3, sc)));
      o.renderOrder = -1;
      m.add(o);
    }
    if (Array.isArray(mat) || mat.transparent || mat.map || (m as unknown as InstancedMesh).isInstancedMesh) continue;
    ((mat as MeshLambertMaterial).isMeshLambertMaterial ? lit : unlit).push(m);
  }
  const bake = (parts: Mesh[], material: MeshLambertMaterial | MeshBasicMaterial) => {
    if (parts.length < 2) return;
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    for (const m of parts) {
      m.updateMatrix();
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      const mat = m.material as MeshLambertMaterial;
      const c = mat.color.clone();
      if (mat.emissive) c.add(mat.emissive.clone().multiplyScalar(0.5));
      const pa = g.getAttribute('position');
      const na = g.getAttribute('normal');
      for (let i = 0; i < pa.count; i++) {
        pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
        nor.push(na.getX(i), na.getY(i), na.getZ(i));
        col.push(c.r, c.g, c.b);
      }
      g.dispose();
      root.remove(m);
    }
    const merged = new BG();
    merged.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    merged.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    merged.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    merged.computeBoundingSphere();
    root.add(new Mesh(merged, material));
    if (outline && material === mergedLit) {
      const o = new Mesh(merged, outlineMaterial(outline.color, outline.width));
      o.renderOrder = -1;
      root.add(o);
    }
  };
  bake(lit, mergedLit);
  bake(unlit, mergedUnlit);
}

export function buildCreature(type: BugType): Creature {
  const root = new Group();
  root.name = `Bug_${type}`;
  const c: Creature = { type, root, jaw: null, spinner: null, eyes: [], legs: [], size: 0.16 };
  switch (type) {
    case 'sockodile': {
      // Striped sock-puppet crocodile with huge googly eyes.
      if (!sockMat) sockMat = new MeshLambertMaterial({ map: stripeTexture(0x39ff88, 0xff2bd6), emissive: 0x102010 });
      const body = part(geo.cyl, sockMat, 0.09, 0.2, 0.09);
      body.rotation.x = Math.PI / 2;
      root.add(body);
      const snout = part(geo.box, sockMat, 0.1, 0.035, 0.12, 0, 0.02, 0.13);
      root.add(snout);
      // Nostrils on the snout tip so it reads as a croc from the front.
      for (const sx of [-0.025, 0.025]) root.add(part(geo.sphereLo, lambert(0x1a7a3a), 0.018, 0.012, 0.018, sx, 0.04, 0.18));
      const jaw = new Group();
      jaw.position.set(0, -0.01, 0.1);
      jaw.add(part(geo.box, lambert(0xff3a7a, 0x400010), 0.095, 0.025, 0.12, 0, -0.012, 0.05));
      // Felt teeth along the front edge, pointing up — visible head-on.
      for (let i = -2; i <= 2; i++) jaw.add(part(geo.cone, basic(0xffffff), 0.014, 0.026, 0.014, i * 0.018, 0.012, 0.105));
      root.add(jaw);
      c.jaw = jaw;
      c.eyes.push(googly(0.05, -0.03, 0.06, 0.05), googly(0.055, 0.03, 0.065, 0.05));
      c.eyes.forEach((e) => root.add(e));
      break;
    }
    case 'blendingo': {
      // Kitchen blender on flamingo legs; spinning blade re-rolls numbers.
      const jar = part(geo.cyl, new MeshLambertMaterial({ color: 0x9df7ff, transparent: true, opacity: 0.55, emissive: 0x0a4050 }), 0.09, 0.13, 0.09, 0, 0.05, 0);
      root.add(jar);
      root.add(part(geo.cyl, lambert(0xff2bd6, 0x300020), 0.1, 0.035, 0.1, 0, -0.03, 0));
      root.add(part(geo.cyl, lambert(0x222233), 0.095, 0.02, 0.095, 0, 0.125, 0));
      const blade = new Group();
      blade.position.set(0, 0.0, 0);
      blade.add(part(geo.box, basic(0xffe14d), 0.08, 0.006, 0.012));
      blade.add(part(geo.box, basic(0xffe14d), 0.012, 0.006, 0.08));
      root.add(blade);
      c.spinner = blade;
      for (const s of [-1, 1]) {
        const leg = new Group();
        leg.position.set(s * 0.025, -0.05, 0);
        leg.add(part(geo.cyl, lambert(0xff6fb5), 0.008, 0.12, 0.008, 0, -0.06, 0));
        leg.add(part(geo.sphereLo, lambert(0xff6fb5), 0.018, 0.018, 0.018, 0, -0.06, 0));
        root.add(leg);
        c.legs.push(leg);
      }
      c.eyes.push(googly(0.04, -0.025, 0.07, 0.05), googly(0.04, 0.025, 0.07, 0.05));
      c.eyes.forEach((e) => root.add(e));
      break;
    }
    case 'wifido': {
      // Puppy made of a router; antenna ears wobble.
      root.add(part(geo.box, lambert(0xdde3ff, 0x101830), 0.16, 0.07, 0.12));
      root.add(part(geo.box, lambert(0x2a2f55), 0.17, 0.012, 0.13, 0, -0.04, 0));
      // Status LEDs.
      for (let i = 0; i < 4; i++) root.add(part(geo.sphereLo, basic(i % 2 ? 0x39ff88 : 0x00f0ff), 0.012, 0.012, 0.012, -0.045 + i * 0.03, -0.012, 0.061));
      for (const s of [-1, 1]) {
        const ear = new Group();
        ear.position.set(s * 0.06, 0.035, -0.02);
        ear.add(part(geo.cyl, lambert(0x2a2f55), 0.01, 0.11, 0.01, 0, 0.055, 0));
        ear.add(part(geo.sphereLo, basic(0xff2bd6), 0.022, 0.022, 0.022, 0, 0.11, 0));
        ear.rotation.z = s * -0.35;
        root.add(ear);
        c.legs.push(ear);
      }
      root.add(part(geo.sphereLo, basic(0x111111), 0.03, 0.022, 0.02, 0, 0.0, 0.065)); // nose
      const tongue = part(geo.box, lambert(0xff5fa0), 0.025, 0.006, 0.03, 0, -0.03, 0.07);
      root.add(tongue);
      c.jaw = tongue;
      c.eyes.push(googly(0.042, -0.04, 0.02, 0.06), googly(0.042, 0.04, 0.02, 0.06));
      c.eyes.forEach((e) => root.add(e));
      break;
    }
    case 'duckuum': {
      // Rubber duck fused with a robot vacuum.
      root.add(part(geo.cyl, lambert(0x2b2b3a, 0x05050a), 0.2, 0.04, 0.2, 0, -0.05, 0));
      const ring = part(geo.torus, basic(0x00f0ff), 0.2, 0.2, 0.2, 0, -0.05, 0);
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
      c.spinner = ring;
      root.add(part(geo.sphere, lambert(0xffd400, 0x302000), 0.13, 0.11, 0.13, 0, 0.02, 0));
      root.add(part(geo.sphere, lambert(0xffd400, 0x302000), 0.09, 0.09, 0.09, 0, 0.1, 0.03));
      const beak = part(geo.box, lambert(0xff7a00, 0x301000), 0.06, 0.02, 0.05, 0, 0.09, 0.085);
      root.add(beak);
      c.jaw = beak;
      c.eyes.push(googly(0.03, -0.025, 0.12, 0.065), googly(0.03, 0.025, 0.12, 0.065));
      c.eyes.forEach((e) => root.add(e));
      break;
    }
  }
  if (c.jaw) c.jaw.userData.keep = true;
  if (c.spinner) c.spinner.userData.keep = true;
  mergeStatic(root, { color: BUG_OUTLINE[type] ?? 0xffffff, width: 0.004 });
  return c;
}

export interface Boss extends Creature {
  /** Where the fact screen goes (systems own the panel, skins only place it). */
  screenAnchor: Object3D;
  shades: Object3D;
}

/** BOSS: Calcu-Llama — a llama whose torso is a giant retro calculator. */
export function buildBoss(): Boss {
  const root = new Group();
  root.name = 'Boss_CalcuLlama';
  const fur = lambert(0xf4e6d0, 0x1a1208);
  const shell = lambert(0x2d2a3e, 0x0a0816);
  // Calculator torso.
  root.add(part(geo.box, shell, 0.9, 0.75, 0.35, 0, 0, 0));
  const screenAnchor = new Group();
  screenAnchor.name = 'screen';
  screenAnchor.position.set(0, 0.2, 0.181);
  root.add(screenAnchor);
  // Keypad buttons: one instanced draw.
  const keys = new InstancedMesh(geo.box, new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 12);
  const km = new Matrix4();
  const kc = new Color();
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 4; k++) {
      const i = r * 4 + k;
      km.makeScale(0.13, 0.08, 0.04);
      km.setPosition(-0.27 + k * 0.18, -0.06 - r * 0.11, 0.18);
      keys.setMatrixAt(i, km);
      keys.setColorAt(i, kc.setHex(k === 3 ? 0xff2bd6 : 0x00f0ff));
    }
  }
  root.add(keys);
  // Neck + head.
  const neck = part(geo.cyl, fur, 0.16, 0.6, 0.16, 0, 0.62, 0.02);
  root.add(neck);
  const head = new Group();
  head.position.set(0, 0.98, 0.06);
  head.add(part(geo.box, fur, 0.3, 0.24, 0.32));
  head.add(part(geo.box, fur, 0.2, 0.15, 0.2, 0, -0.04, 0.2));
  const jaw = part(geo.box, lambert(0xe8d4b8, 0x100a04), 0.18, 0.05, 0.18, 0, -0.12, 0.2);
  head.add(jaw);
  for (const s of [-1, 1]) {
    const ear = part(geo.cone, fur, 0.07, 0.18, 0.07, s * 0.1, 0.2, -0.04);
    ear.rotation.z = s * -0.25;
    head.add(ear);
  }
  // Fluffy top.
  head.add(part(geo.sphereLo, lambert(0xffffff), 0.22, 0.12, 0.22, 0, 0.12, 0));
  // Sunglasses.
  const shades = new Group();
  shades.position.set(0, 0.03, 0.165);
  shades.add(part(geo.box, basic(0x050008), 0.32, 0.075, 0.02));
  shades.add(part(geo.box, basic(0xff2bd6), 0.33, 0.01, 0.022, 0, 0.04, 0));
  head.add(shades);
  root.add(head);
  // Legs.
  const legs: Object3D[] = [];
  for (const [x, z] of [
    [-0.3, 0.1],
    [0.3, 0.1],
  ] as const) {
    const leg = part(geo.cyl, fur, 0.1, 0.5, 0.1, x, -0.6, z);
    root.add(leg);
    legs.push(leg);
  }
  mergeStatic(root, { color: BUG_OUTLINE.boss as number, width: 0.012 });
  return { type: 'boss', root, jaw, spinner: head, eyes: [], legs, size: 1, screenAnchor, shades };
}

/** Draw the boss calculator screen. */
export function drawBossScreen(panel: CanvasPanel, text: string, sub: string): void {
  panel.draw(`${text}|${sub}`, (g, w, h) => {
    g.fillStyle = '#0c2a12';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(57,255,136,0.08)';
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    neonText(g, text, w / 2, h * 0.47, { size: 110, color: 0x7dff9e, family: FONT_DISPLAY, maxWidth: w - 30 });
    if (sub) neonText(g, sub, w / 2, h * 0.86, { size: 30, color: 0x39ff88, maxWidth: w - 30 });
  });
}

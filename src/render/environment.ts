import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  HemisphereLight,
  DirectionalLight,
} from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { Rng } from '../logic/rng.js';
import { createFloorMaterial, createSkyMaterial } from './shaders.js';

export interface Environment {
  root: Group;
  sky: ShaderMaterial;
  floor: ShaderMaterial;
  towers: ShaderMaterial;
}

/** Corrupted-server synthwave world. ~6 draw calls. Static (no vection). */
export function buildEnvironment(): Environment {
  const root = new Group();
  root.name = 'Environment';
  const rng = new Rng(1337);

  const sky = createSkyMaterial();
  const skyMesh = new Mesh(new SphereGeometry(80, 32, 16), sky);
  skyMesh.name = 'Sky';
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -10;
  root.add(skyMesh);

  const floor = createFloorMaterial(CONFIG.colors.grid);
  const floorMesh = new Mesh(new PlaneGeometry(120, 120, 1, 1), floor);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.name = 'GridFloor';
  root.add(floorMesh);

  // Neon mountain ridge on the horizon (dark fill + glowing outline).
  const ridge = new Group();
  const pts: number[] = [];
  const fill: number[] = [];
  const R = 55;
  const segs = 90;
  let prevX = 0;
  let prevZ = 0;
  let prevY = 0;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.sin(a) * R;
    const z = -Math.cos(a) * R;
    // Lower the ridge right behind the sun so it peeks above.
    const sunGap = Math.max(0, 1 - Math.abs(Math.atan2(x, -z)) / 0.5);
    const y = (i % 2 === 0 ? rng.range(3, 9) : rng.range(0.5, 3)) * (1 - 0.75 * sunGap);
    if (i > 0) {
      pts.push(prevX, prevY, prevZ, x, y, z);
      fill.push(prevX, 0, prevZ, x, 0, z, x, y, z, prevX, 0, prevZ, x, y, z, prevX, prevY, prevZ);
    }
    prevX = x;
    prevZ = z;
    prevY = y;
  }
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  ridge.add(new LineSegments(lineGeo, new LineBasicMaterial({ color: CONFIG.colors.cyan, toneMapped: false })));
  const fillGeo = new BufferGeometry();
  fillGeo.setAttribute('position', new BufferAttribute(new Float32Array(fill), 3));
  ridge.add(new Mesh(fillGeo, new MeshBasicMaterial({ color: 0x0a0016, toneMapped: false, side: 2 })));
  ridge.name = 'Ridge';
  root.add(ridge);

  // Server towers: instanced boxes with blinking-light shader.
  const towerMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying float vId;
      void main() {
        vLocal = position;
        vId = float(gl_InstanceID);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vLocal;
      varying float vId;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 base = vec3(0.02, 0.0, 0.05);
        vec2 cell = floor(vec2(vLocal.x * 6.0 + vLocal.z * 6.0, vLocal.y * 20.0));
        float on = step(0.72, hash(cell + vId));
        // Slow random blink (< 1 Hz) – small, far, low contrast.
        float blink = 0.5 + 0.5 * sin(uTime * (0.4 + hash(cell) * 0.6) + hash(cell + 7.0) * 6.28);
        vec2 f = fract(vec2(vLocal.x * 6.0 + vLocal.z * 6.0, vLocal.y * 20.0));
        float dotMask = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.6);
        vec3 led = mix(vec3(0.0, 0.94, 1.0), vec3(1.0, 0.17, 0.84), step(0.5, hash(cell + 2.0)));
        vec3 col = base + led * on * dotMask * (0.35 + 0.65 * blink);
        // Neon only on the vertical corner edges.
        float corner = step(0.46, abs(vLocal.x)) * step(0.46, abs(vLocal.z));
        col += vec3(0.55, 0.12, 0.9) * corner * 0.8;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
  const towerCount = 28;
  const towers = new InstancedMesh(new BoxGeometry(1, 1, 1), towerMat, towerCount);
  const m = new Matrix4();
  for (let i = 0; i < towerCount; i++) {
    const a = (i / towerCount) * Math.PI * 2 + rng.range(-0.08, 0.08);
    // Keep the sun corridor clear.
    const behindSun = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35;
    const dist = behindSun ? rng.range(26, 32) : rng.range(9, 16);
    const h = rng.range(3, 9);
    const w = rng.range(1.2, 2.2);
    m.makeScale(w, h, w);
    m.setPosition(Math.sin(a) * dist, h / 2, -Math.cos(a) * dist);
    towers.setMatrixAt(i, m);
  }
  towers.name = 'ServerTowers';
  root.add(towers);

  // Floating data motes: very slow, sparse, far from the face.
  const moteGeo = new BufferGeometry();
  const motes: number[] = [];
  for (let i = 0; i < 160; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(3, 14);
    motes.push(Math.sin(a) * d, rng.range(0.3, 6), -Math.cos(a) * d);
  }
  moteGeo.setAttribute('position', new BufferAttribute(new Float32Array(motes), 3));
  // Short vertical dashes instead of Points: one cheap line draw.
  const dashes: number[] = [];
  for (let i = 0; i < motes.length; i += 3) {
    const x = motes[i] as number;
    const y = motes[i + 1] as number;
    const z = motes[i + 2] as number;
    dashes.push(x, y, z, x, y + 0.12, z);
  }
  const dashGeo = new BufferGeometry();
  dashGeo.setAttribute('position', new BufferAttribute(new Float32Array(dashes), 3));
  const dashLines = new LineSegments(
    dashGeo,
    new LineBasicMaterial({ color: CONFIG.colors.magenta, transparent: true, opacity: 0.6, blending: AdditiveBlending, toneMapped: false }),
  );
  dashLines.name = 'DataMotes';
  root.add(dashLines);

  // One hemisphere + one key light for the creatures (Lambert). Blocks are unlit.
  root.add(new HemisphereLight(0xb18cff, 0x200030, 1.6));
  const key = new DirectionalLight(0xffd6f5, 1.4);
  key.position.set(1, 3, 2);
  root.add(key);

  return { root, sky, floor, towers: towerMat };
}

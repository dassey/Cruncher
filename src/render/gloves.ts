import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, BoxGeometry, CanvasTexture, type Material } from '@iwsdk/core';

/** Chunky neon cyber-gauntlet. Same model for controllers and tracked hands. */
export interface Glove {
  root: Group;
  body: MeshLambertMaterial;
  accent: MeshBasicMaterial;
  halo: Mesh;
  haloMat: MeshBasicMaterial;
}

let haloTex: CanvasTexture | null = null;
function haloTexture(): CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new CanvasTexture(c);
  return haloTex;
}

const fistGeo = new SphereGeometry(0.5, 14, 10);
const boxGeo = new BoxGeometry(1, 1, 1);
const cuffGeo = new TorusGeometry(0.5, 0.18, 8, 18);
const haloGeo = new PlaneGeometry(1, 1);

/** Bake same-material parts into one mesh (keeps the material so skins can tint it). */
function mergeParts(parts: Mesh[], material: Material): Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const m of parts) {
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
    }
    g.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.computeBoundingSphere();
  return new Mesh(geo, material);
}

export function buildGlove(side: 'left' | 'right'): Glove {
  const root = new Group();
  root.name = `Glove_${side}`;
  const body = new MeshLambertMaterial({ color: 0x00f0ff, emissive: new Color(0x003844), emissiveIntensity: 1 });
  const accent = new MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false });
  // Grip space: -Z forward along the controller, +Y up. Fist sits slightly forward.
  const fist = new Mesh(fistGeo, body);
  fist.scale.set(0.085, 0.075, 0.1);
  fist.position.set(0, -0.01, -0.03);
  const knuckles = new Mesh(boxGeo, accent);
  knuckles.scale.set(0.075, 0.022, 0.03);
  knuckles.position.set(0, 0.012, -0.075);
  const thumb = new Mesh(fistGeo, body);
  thumb.scale.set(0.03, 0.03, 0.05);
  thumb.position.set(side === 'left' ? 0.04 : -0.04, -0.01, -0.04);
  const cuff = new Mesh(cuffGeo, accent);
  cuff.scale.set(0.07, 0.07, 0.07);
  cuff.position.set(0, -0.005, 0.03);
  // 2 draws instead of 4: one body mesh, one accent mesh.
  root.add(mergeParts([fist, thumb], body), mergeParts([knuckles, cuff], accent));
  const haloMat = new MeshBasicMaterial({ map: haloTexture(), color: 0x00f0ff, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new Mesh(haloGeo, haloMat);
  halo.scale.setScalar(0.22);
  halo.position.set(0, 0, -0.04);
  root.add(halo);
  return { root, body, accent, halo, haloMat };
}

export function tintGlove(g: Glove, color: number, accent: number): void {
  g.body.color.setHex(color);
  g.body.emissive.setHex(color).multiplyScalar(0.35);
  g.accent.color.setHex(accent);
  g.haloMat.color.setHex(color);
}

export { haloTexture };

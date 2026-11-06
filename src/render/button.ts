import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial } from '@iwsdk/core';
import { CanvasPanel, FONT_DISPLAY, FONT_UI, neonText } from './text.js';

const boxGeo = new BoxGeometry(1, 1, 1);
const edgeGeo = new EdgesGeometry(boxGeo);
const faceMat = new MeshBasicMaterial({ color: 0x0d0420, toneMapped: false });

/**
 * A big punchable neon block used for menus, shop items and perk cards.
 * Menus are punched, not pointed at: same verb as the game.
 */
export class PunchButton {
  readonly root = new Group();
  readonly label: CanvasPanel;
  private edgeMat: LineBasicMaterial;
  private body: Mesh;
  title = '';
  sub = '';
  color = 0x00f0ff;
  dim = false;
  /** Punch animation 1 → 0. */
  kick = 0;
  hover = 0;

  constructor(
    readonly width = 0.16,
    readonly height = 0.12,
    readonly depth = 0.08,
  ) {
    this.body = new Mesh(boxGeo, faceMat);
    this.body.scale.set(width, height, depth);
    this.root.add(this.body);
    this.edgeMat = new LineBasicMaterial({ color: this.color, toneMapped: false });
    const edges = new LineSegments(edgeGeo, this.edgeMat);
    edges.scale.set(width * 1.002, height * 1.002, depth * 1.002);
    this.root.add(edges);
    this.label = new CanvasPanel(256, Math.round((256 * height) / width), width * 0.96);
    this.label.mesh.position.z = depth / 2 + 0.002;
    this.root.add(this.label.mesh);
  }

  set(title: string, sub: string, color: number, dim = false): void {
    this.title = title;
    this.sub = sub;
    this.color = color;
    this.dim = dim;
    this.edgeMat.color.setHex(dim ? 0x443355 : color);
    this.label.draw(`${title}|${sub}|${color}|${dim}`, (g, w, h) => {
      const c = dim ? 0x776688 : color;
      const hasSub = sub.length > 0;
      neonText(g, title, w / 2, hasSub ? h * 0.38 : h * 0.5, { size: Math.min(h * 0.36, 64), color: c, family: FONT_DISPLAY, maxWidth: w * 0.9 });
      if (hasSub) neonText(g, sub, w / 2, h * 0.75, { size: Math.min(h * 0.17, 30), color: 0xffffff, family: FONT_UI, glow: 4, maxWidth: w * 0.92 });
    });
  }

  /** Per-frame animation (no allocation). */
  animate(dt: number, time: number): void {
    this.kick = Math.max(0, this.kick - dt * 4);
    const pulse = 1 + 0.02 * Math.sin(time * 3 + this.root.id) + this.hover * 0.06;
    const squash = 1 - this.kick * 0.18;
    this.root.scale.set(pulse, pulse, pulse * squash);
    this.edgeMat.color.setHex(this.kick > 0.5 ? 0xffffff : this.dim ? 0x443355 : this.color);
  }
}

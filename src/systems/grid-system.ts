import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { CONFIG } from '../config.js';
import { game, type Target } from '../game/context.js';
import { cellPose, type LocalPose } from '../game/layout.js';
import type { Block } from '../logic/grid.js';
import { createBlockMaterial, createHaloMaterial } from '../render/shaders.js';
import { FONT_DISPLAY, css } from '../render/text.js';

const MAX = 48;
const CELL = 128;
const G = CONFIG.grid;

/**
 * GRID: renders every number block as ONE instanced draw call (plus one for
 * halos), lays them out on an arc in arm's reach, animates spawn/bob/smash,
 * and turns punches into session.hitBlock().
 */
export class GridSystem extends createSystem({}) {
  private root = new Group();
  private mesh!: InstancedMesh;
  private halos!: InstancedMesh;
  private atlasCanvas!: HTMLCanvasElement;
  private atlasG!: CanvasRenderingContext2D;
  private atlas!: CanvasTexture;
  private material!: ReturnType<typeof createBlockMaterial>;
  private aCell!: InstancedBufferAttribute;
  private aState!: InstancedBufferAttribute;
  private targets: Target[] = [];
  private base: Vector3[] = [];
  private yaw: number[] = [];
  private pitch: number[] = [];
  private spawnT = new Float32Array(MAX);
  private deadT = new Float32Array(MAX).fill(1);
  private wrongT = new Float32Array(MAX);
  private hitT = new Float32Array(MAX);
  private lockT = new Float32Array(MAX);
  private shake = new Float32Array(MAX);
  private count = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler(0, 0, 0, 'YXZ');
  private s = new Vector3();
  private p = new Vector3();
  private color = new Color();
  private pose: LocalPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private readonly cyan = new Color(CONFIG.colors.block);
  private readonly purple = new Color(CONFIG.colors.blockAlt);
  private readonly gold = new Color(0xffc83d);

  init(): void {
    const ctx = game();
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = this.atlasCanvas.height = CELL * 8;
    this.atlasG = this.atlasCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.atlas = new CanvasTexture(this.atlasCanvas);
    this.atlas.colorSpace = SRGBColorSpace;
    this.atlas.anisotropy = 4;
    this.material = createBlockMaterial(this.atlas);

    const geo = new BoxGeometry(1, 1, 1);
    this.aCell = new InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.aState = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aCell.setUsage(DynamicDrawUsage);
    this.aState.setUsage(DynamicDrawUsage);
    geo.setAttribute('aCell', this.aCell);
    geo.setAttribute('aState', this.aState);
    this.mesh = new InstancedMesh(geo, this.material, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'NumberBlocks';
    this.halos = new InstancedMesh(new PlaneGeometry(1, 1), createHaloMaterial(), MAX);
    this.halos.instanceMatrix.setUsage(DynamicDrawUsage);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 5;
    this.halos.name = 'BlockHalos';
    for (let i = 0; i < MAX; i++) {
      this.mesh.setColorAt(i, this.cyan);
      this.halos.setColorAt(i, this.cyan);
      this.base.push(new Vector3());
      this.yaw.push(0);
      this.pitch.push(0);
      this.targets.push(
        ctx.addTarget({ kind: 'block', id: i, radius: G.blockSize * 0.55, enabled: false, onHit: (t, _h, _s, blast) => this.onPunch(t.id, blast) }),
      );
    }
    this.mesh.count = 0;
    this.halos.count = 0;
    this.root.add(this.halos, this.mesh);
    this.root.name = 'Grid';
    this.world.createTransformEntity(this.root, { persistent: true });

    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ev.on('roundStart', () => this.layout()),
      ev.on('blockChanged', ({ block }) => {
        this.drawCell(block);
        this.atlas.needsUpdate = true;
        this.hitT[block.id] = 0.6; // zap flash
      }),
      ev.on('hitWrong', ({ block }) => {
        this.wrongT[block.id] = 1;
        this.shake[block.id] = 1;
        this.lockT[block.id] = 0.5;
      }),
      ev.on('hitCorrect', ({ block }) => {
        this.hitT[block.id] = 1;
      }),
    );
  }

  /** Bot/debug: world position of block id. */
  blockWorld(id: number): Vector3 | null {
    return id < this.count ? (this.targets[id]?.pos ?? null) : null;
  }

  private onPunch(id: number, blast: boolean): void {
    if (this.lockT[id]! > 0) return;
    game().session.hitBlock(id, blast);
  }

  private layout(): void {
    const ctx = game();
    const s = ctx.session;
    const blocks = s.blocks;
    this.count = Math.min(MAX, blocks.length);
    this.atlasG.clearRect(0, 0, this.atlasCanvas.width, this.atlasCanvas.height);
    for (let i = 0; i < this.count; i++) {
      const b = blocks[i] as Block;
      cellPose(this.pose, b.col, b.row, s.params.cols, s.params.rows, ctx.settings.seated);
      ctx.playPoint(this.base[i] as Vector3, this.pose.x, this.pose.y, this.pose.z);
      this.yaw[i] = this.pose.yaw + ctx.anchorYaw;
      this.pitch[i] = this.pose.pitch;
      // Staggered pop-in: sweep from the centre outwards.
      const dc = Math.abs(b.col - (s.params.cols - 1) / 2) + Math.abs(b.row - (s.params.rows - 1) / 2);
      this.spawnT[i] = -dc * 0.06;
      this.deadT[i] = 0;
      this.wrongT[i] = 0;
      this.hitT[i] = 0;
      this.lockT[i] = 0;
      this.shake[i] = 0;
      this.aCell.setX(i, i);
      const checker = (b.col + b.row) % 2 === 0;
      this.color.copy(b.golden ? this.gold : checker ? this.cyan : this.purple);
      this.mesh.setColorAt(i, this.color);
      this.halos.setColorAt(i, this.color);
      this.drawCell(b);
    }
    this.atlas.needsUpdate = true;
    this.aCell.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
    this.mesh.count = this.count;
    this.halos.count = this.count;
    for (let i = this.count; i < MAX; i++) (this.targets[i] as Target).enabled = false;
  }

  private drawCell(b: Block): void {
    const g = this.atlasG;
    const cx = (b.id % 8) * CELL;
    const cy = Math.floor(b.id / 8) * CELL;
    g.clearRect(cx, cy, CELL, CELL);
    const label = b.label;
    const size = label.length <= 2 ? 78 : label.length === 3 ? 62 : label.length === 4 ? 44 : 38;
    g.save();
    g.font = `${size}px "${FONT_DISPLAY}", "Arial Black", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,1)';
    g.strokeText(label, cx + CELL / 2, cy + CELL / 2 + 4);
    g.fillStyle = css(0xffffff);
    g.fillText(label, cx + CELL / 2, cy + CELL / 2 + 4);
    g.restore();
  }

  update(delta: number, time: number): void {
    const ctx = game();
    const s = ctx.session;
    const show = ctx.screen === 'game' && !ctx.userPaused && !s.isBossRound && (s.phase === 'intro' || s.phase === 'playing' || s.phase === 'clear');
    this.root.visible = show;
    this.material.uniforms.uTime!.value = time;
    this.material.uniforms.uBeat!.value = ctx.beat;
    if (!show) {
      for (let i = 0; i < this.count; i++) (this.targets[i] as Target).enabled = false;
      return;
    }
    const assist = s.assistActive ? 1 : 0;
    const playing = s.phase === 'playing' && !ctx.paused;
    const clearing = s.phase === 'clear';
    for (let i = 0; i < this.count; i++) {
      const b = s.blocks[i] as Block;
      this.spawnT[i] = Math.min(1, this.spawnT[i]! + delta * 3);
      if (!b.alive || clearing) this.deadT[i] = Math.min(1, this.deadT[i]! + delta * (clearing && b.alive ? 2.5 : 7));
      this.wrongT[i] = Math.max(0, this.wrongT[i]! - delta * 2.2);
      this.hitT[i] = Math.max(0, this.hitT[i]! - delta * 6);
      this.lockT[i] = Math.max(0, this.lockT[i]! - delta);
      this.shake[i] = Math.max(0, this.shake[i]! - delta * 5);
      const t = this.targets[i] as Target;
      const spawn = Math.max(0, this.spawnT[i]!);
      const pop = spawn < 1 ? easeOutBack(spawn) : 1;
      const dead = this.deadT[i]!;
      const scale = G.blockSize * pop * (1 - dead) * (1 + this.hitT[i]! * 0.35);
      const bob = Math.sin(time * Math.PI * 2 * G.bobHz + i * 1.7) * G.bobAmp;
      const sh = this.shake[i]! * 0.012 * Math.sin(time * 70 + i);
      const base = this.base[i] as Vector3;
      this.p.set(base.x + sh, base.y + bob, base.z);
      this.e.set(this.pitch[i]!, this.yaw[i]! + this.shake[i]! * 0.2 * Math.sin(time * 50), 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(Math.max(0.0001, scale));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.s.setScalar(Math.max(0.0001, scale * 2.1));
      this.m.compose(this.p, this.q, this.s);
      this.halos.setMatrixAt(i, this.m);
      // Hover = nearest hand proximity (anticipation glow).
      let hover = 0;
      for (const side of ['left', 'right'] as const) {
        const h = ctx.hands[side];
        if (!h.tracked) continue;
        const d = h.pos.distanceTo(this.p);
        hover = Math.max(hover, 1 - Math.min(1, Math.max(0, (d - 0.05) / 0.12)));
      }
      this.aState.setXYZW(i, this.wrongT[i]!, hover, assist && b.alive && b.correct ? 1 : 0, this.hitT[i]! * 0.8);
      t.pos.copy(this.p);
      t.enabled = playing && b.alive && spawn >= 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    this.aState.needsUpdate = true;
  }
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

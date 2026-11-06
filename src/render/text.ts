import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, AdditiveBlending } from '@iwsdk/core';

export const FONT_DISPLAY = 'Bungee';
export const FONT_GLITCH = 'RubikGlitch';
export const FONT_UI = 'Russo';

let fontsReady: Promise<void> | null = null;

/** Load bundled OFL fonts (no CDN). Resolves even if a font fails. */
export function loadFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  const base = import.meta.env.BASE_URL;
  const defs: Array<[string, string]> = [
    [FONT_DISPLAY, 'fonts/bungee.woff2'],
    [FONT_GLITCH, 'fonts/rubik-glitch.woff2'],
    [FONT_UI, 'fonts/russo-one.woff2'],
  ];
  fontsReady = Promise.all(
    defs.map(async ([name, file]) => {
      try {
        const face = new FontFace(name, `url(${base}${file})`);
        await face.load();
        document.fonts.add(face);
      } catch (err) {
        console.warn('[cruncher] font failed', name, err);
      }
    }),
  ).then(() => undefined);
  return fontsReady;
}

export function font(px: number, family = FONT_DISPLAY): string {
  return `${Math.round(px)}px "${family}", "Arial Black", Impact, sans-serif`;
}

export function css(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export interface NeonOpts {
  size: number;
  color: number;
  family?: string;
  glow?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  stroke?: number;
  maxWidth?: number;
}

/** Text with a neon glow: blurred colour pass + white-hot core. */
export function neonText(g: CanvasRenderingContext2D, text: string, x: number, y: number, o: NeonOpts): void {
  g.save();
  g.font = font(o.size, o.family);
  g.textAlign = o.align ?? 'center';
  g.textBaseline = o.baseline ?? 'middle';
  const glow = o.glow ?? o.size * 0.35;
  let fit = 1;
  if (o.maxWidth) {
    const w = g.measureText(text).width;
    if (w > o.maxWidth) fit = o.maxWidth / w;
  }
  if (fit < 1) {
    g.translate(x, y);
    g.scale(fit, fit);
    x = 0;
    y = 0;
  }
  if (o.stroke) {
    g.lineJoin = 'round';
    g.lineWidth = o.stroke;
    g.strokeStyle = 'rgba(5,0,15,0.95)';
    g.strokeText(text, x, y);
  }
  g.shadowColor = css(o.color);
  g.shadowBlur = glow;
  g.fillStyle = css(o.color);
  g.fillText(text, x, y);
  g.shadowBlur = glow > 0 ? glow * 0.4 : 0;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.globalAlpha = 0.55;
  g.fillText(text, x, y);
  g.restore();
}

/** A world-space plane carrying a 2D canvas. Redraw only when content changes. */
export class CanvasPanel {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  readonly material: MeshBasicMaterial;
  readonly mesh: Mesh;
  private lastKey = '';

  constructor(
    readonly pxW: number,
    readonly pxH: number,
    widthM: number,
    opts: { additive?: boolean; doubleSide?: boolean; depthTest?: boolean; renderOrder?: number } = {},
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: opts.depthTest ?? true,
      toneMapped: false,
    });
    if (opts.doubleSide) this.material.side = DoubleSide;
    if (opts.additive) this.material.blending = AdditiveBlending;
    this.mesh = new Mesh(new PlaneGeometry(widthM, (widthM * pxH) / pxW), this.material);
    this.mesh.renderOrder = opts.renderOrder ?? 10;
  }

  /** Redraws if `key` differs from the last draw (cheap change detection). */
  draw(key: string, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.g.clearRect(0, 0, this.pxW, this.pxH);
    fn(this.g, this.pxW, this.pxH);
    this.texture.needsUpdate = true;
  }

  invalidate(): void {
    this.lastKey = '';
  }
}

/** Rounded rectangle path helper. */
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Dark translucent panel plate with neon border. */
export function plate(g: CanvasRenderingContext2D, w: number, h: number, color: number, alpha = 0.86, glow = true): void {
  const pad = 10;
  roundRect(g, pad, pad, w - pad * 2, h - pad * 2, 28);
  g.fillStyle = `rgba(8,2,22,${alpha})`;
  g.fill();
  g.lineWidth = 6;
  g.shadowColor = css(color);
  g.shadowBlur = glow ? 18 : 0;
  g.strokeStyle = css(color);
  g.stroke();
  g.shadowBlur = 0;
}

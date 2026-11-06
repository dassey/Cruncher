import { createSystem } from '@iwsdk/core';
import { game } from '../game/context.js';

/** PERF: frame-time stats for the debug overlay and the automated playtest. */
export class PerfSystem extends createSystem({}) {
  private last = 0;

  update(): void {
    const now = performance.now();
    const ctx = game();
    const fs = ctx.frameStats;
    // JS cost of all game systems this frame (Quest CPU proxy; GPU time is not measurable headless).
    const js = now - ctx.frameStart;
    if (ctx.frameStart > 0 && this.last > 0) {
      fs.jsSumMs += js;
      if (js > fs.jsWorstMs && fs.frames > 30) fs.jsWorstMs = js;
    }
    if (this.last > 0) {
      const ms = now - this.last;
      fs.frames++;
      fs.sumMs += ms;
      if (ms > fs.worstMs) fs.worstMs = ms;
      if (ms > 14) fs.over14++;
    }
    this.last = now;
  }
}

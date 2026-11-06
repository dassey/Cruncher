import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { cellPose, gridBottom, gridTop } from '../src/game/layout';

/** Comfort & safety invariants: tuning must never silently break these. */
describe('comfort & safety invariants', () => {
  it('photosensitivity: < 3 flashes/s, edge vignette never near-opaque', () => {
    expect(CONFIG.fx.maxFlashesPerSecond).toBeLessThan(3);
    expect(CONFIG.fx.vignetteMaxOpacity).toBeLessThanOrEqual(0.5);
  });
  // 10-year-old: shoulders ~0.2 m below and ±0.17 m beside the eyes; fist reach ~0.6 m.
  it('every grid cell is within a 10-year-old arm reach from a shoulder and in front', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    for (const [cols, rows] of CONFIG.rounds.sizes) {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          for (const seated of [false, true]) {
            cellPose(pose, c, r, cols, rows, seated);
            const reach = Math.min(Math.hypot(pose.x - 0.17, pose.y + 0.2, pose.z), Math.hypot(pose.x + 0.17, pose.y + 0.2, pose.z));
            expect(reach).toBeLessThanOrEqual(0.62);
            expect(pose.z).toBeLessThan(-0.2); // in front
          }
        }
      }
      // Top row never above the eyes; bottom row not below ~0.7 m under the eyes.
      expect(gridTop(rows, false)).toBeLessThan(0.1);
      expect(gridBottom(rows, false)).toBeGreaterThan(-0.75);
    }
  });
  it('lunging bugs stop at least ~20 cm from the face', () => {
    expect(CONFIG.player.headRadius).toBeGreaterThanOrEqual(0.2);
    expect(CONFIG.bugs.lungeTelegraph).toBeGreaterThanOrEqual(1);
  });
  it('punches need real intent (speed + approach), and there is no locomotion config at all', () => {
    expect(CONFIG.hit.minPunchSpeed).toBeGreaterThan(0.3);
    expect(CONFIG.hit.approachFactor).toBeGreaterThan(0);
    expect(Object.keys(CONFIG)).not.toContain('locomotion');
  });
});

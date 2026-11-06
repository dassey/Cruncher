import { CONFIG } from '../config.js';

export interface LocalPose {
  x: number;
  y: number;
  z: number;
  /** Yaw so the object faces the player. */
  yaw: number;
  pitch: number;
}

/** Play-frame position of grid cell (col,row): an arc around the head, within arm's reach. */
export function cellPose(out: LocalPose, col: number, row: number, cols: number, rows: number, seated: boolean): LocalPose {
  const G = CONFIG.grid;
  const R = G.radius;
  const below = seated ? G.seatedBelowHead : G.belowHead;
  out.y = -below + ((rows - 1) / 2 - row) * G.spacing;
  // Console-desk tilt: lower rows sit closer so a kid's reach covers them.
  const r = R - G.tilt * Math.max(0, -(out.y + below));
  // Keep the physical gap between columns constant on every row.
  const theta = ((col - (cols - 1) / 2) * G.spacing) / r;
  out.x = Math.sin(theta) * r;
  out.z = -Math.cos(theta) * r;
  out.yaw = -theta;
  out.pitch = Math.atan2(-out.y, r) * 0.6;
  return out;
}

/** Height (play frame) of the top edge of a grid with `rows` rows. */
export function gridTop(rows: number, seated: boolean): number {
  const G = CONFIG.grid;
  const below = seated ? G.seatedBelowHead : G.belowHead;
  return -below + ((rows - 1) / 2) * G.spacing + G.blockSize / 2;
}

export function gridBottom(rows: number, seated: boolean): number {
  const G = CONFIG.grid;
  const below = seated ? G.seatedBelowHead : G.belowHead;
  return -below - ((rows - 1) / 2) * G.spacing - G.blockSize / 2;
}

/** Half-height of the HUD strip (1.15 m wide, 1024×210 canvas). */
export const HUD_HALF_H = (1.15 * 210) / 1024 / 2;
/** Gap from HUD centre to rule-banner centre. */
export const BANNER_ABOVE_HUD = HUD_HALF_H + 0.15;

/** Distance of the overhead billboard (rule + HUD strip). */
export const BILLBOARD_DIST = 1.3;

/**
 * Play-frame height of the HUD strip centre on the billboard: just above the
 * grid's top edge as seen from the eyes, so the billboard never overlaps blocks.
 * Boss rounds: low, under the boss's belly screen.
 */
export function hudBandY(rows: number, seated: boolean, isBoss: boolean): number {
  if (isBoss) return -0.46;
  const G = CONFIG.grid;
  const topElev = Math.atan2(gridTop(rows, seated), G.radius);
  const clearance = (3 * Math.PI) / 180;
  return Math.tan(topElev + clearance) * BILLBOARD_DIST + HUD_HALF_H;
}

/**
 * Photosensitivity guard. Any effect that changes a large area's luminance asks
 * permission first. Caps flashes to `maxPerSecond` in any sliding 1 s window
 * (WCAG 2.3.1 allows at most 3; we stay below that).
 */
export class FlashGovernor {
  private times: number[] = [];

  constructor(private readonly maxPerSecond: number) {}

  /** Returns true if a flash may start at time `now` (seconds) and records it. */
  request(now: number): boolean {
    while (this.times.length > 0 && now - (this.times[0] as number) >= 1) this.times.shift();
    if (this.times.length >= this.maxPerSecond) return false;
    this.times.push(now);
    return true;
  }

  /** Number of flashes in the window ending at `now`. */
  countAt(now: number): number {
    let c = 0;
    for (const t of this.times) if (now - t < 1) c++;
    return c;
  }

  reset(): void {
    this.times.length = 0;
  }
}

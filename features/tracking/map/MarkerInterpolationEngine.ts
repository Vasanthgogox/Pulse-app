export type LngLat = { longitude: number; latitude: number };

/**
 * RAF-based linear interpolation between GPS fixes (smooth marker movement).
 */
export class MarkerInterpolationEngine {
  private rafId: number | null = null;
  private from: LngLat | null = null;
  private to: LngLat | null = null;
  private startMs = 0;
  private durationMs = 800;

  constructor(
    private readonly onFrame: (pos: LngLat, done: boolean) => void,
    durationMs = 800,
  ) {
    this.durationMs = durationMs;
  }

  setTarget(target: LngLat, immediate = false): void {
    if (!this.from) {
      this.from = target;
      this.onFrame(target, true);
      return;
    }
    this.to = target;
    this.startMs = performance.now();
    if (immediate) {
      this.from = target;
      this.cancel();
      this.onFrame(target, true);
      return;
    }
    this.tick();
  }

  cancel(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (): void => {
    if (!this.from || !this.to) return;
    const t = Math.min(1, (performance.now() - this.startMs) / this.durationMs);
    const pos: LngLat = {
      latitude: this.from.latitude + (this.to.latitude - this.from.latitude) * t,
      longitude: this.from.longitude + (this.to.longitude - this.from.longitude) * t,
    };
    this.onFrame(pos, t >= 1);
    if (t >= 1) {
      this.from = this.to;
      this.to = null;
      this.rafId = null;
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);
  };
}

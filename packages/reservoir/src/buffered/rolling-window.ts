export class RollingWindow {
  private timestamps: number[] = [];

  constructor(private readonly windowMs: number) {
    if (windowMs <= 0) throw new Error('windowMs must be positive');
  }

  add(): void {
    const now = Date.now();
    this.prune(now);
    this.timestamps.push(now);
  }

  /** Number of live entries in the window. Prunes expired entries as a side effect. */
  count(): number {
    this.prune(Date.now());
    return this.timestamps.length;
  }

  /** Raw number of tracked entries without pruning expired ones. Side-effect-free, intended for metrics. */
  size(): number {
    return this.timestamps.length;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.timestamps.length && this.timestamps[i] < cutoff) i++;
    if (i > 0) this.timestamps.splice(0, i);
  }
}

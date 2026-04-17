import { RollingWindow } from './rolling-window.js';
import type { BufferTransport, CircuitBreakerConfig } from './types.js';

export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state_: BreakerState = 'closed';
  private openedAt = 0;
  private errorWindow: RollingWindow;
  private successWindow: RollingWindow;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private transport: BufferTransport,
  ) {
    this.errorWindow = new RollingWindow(config.windowMs);
    this.successWindow = new RollingWindow(config.windowMs);
  }

  state(): BreakerState {
    return this.state_;
  }

  async shouldBypass(): Promise<boolean> {
    if (this.state_ === 'open') {
      if (Date.now() - this.openedAt > this.config.cooldownMs) {
        this.state_ = 'half-open';
      } else {
        return true;
      }
    }

    const stats = await this.transport.getStats();
    if (stats.pendingRecords > this.config.pendingThreshold) {
      this.trip('pending_threshold_exceeded');
      return true;
    }
    return false;
  }

  recordFailure(): void {
    this.errorWindow.add();
    if (this.errorRate() >= this.config.errorRateThreshold && this.totalSamples() >= 5) {
      this.trip('error_rate_exceeded');
    }
  }

  recordSuccess(): void {
    this.successWindow.add();
    if (this.state_ === 'half-open') {
      this.state_ = 'closed';
      this.errorWindow = new RollingWindow(this.config.windowMs);
      this.successWindow = new RollingWindow(this.config.windowMs);
    }
  }

  private errorRate(): number {
    const errors = this.errorWindow.count();
    const total = errors + this.successWindow.count();
    return total === 0 ? 0 : errors / total;
  }

  private totalSamples(): number {
    return this.errorWindow.count() + this.successWindow.count();
  }

  private trip(reason: string): void {
    if (this.state_ !== 'open') {
      this.state_ = 'open';
      this.openedAt = Date.now();
      console.warn(`[CircuitBreaker] opened: ${reason}, errorRate=${this.errorRate().toFixed(3)}`);
    }
  }
}

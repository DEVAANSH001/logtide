import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RollingWindow } from './rolling-window.js';

describe('RollingWindow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts recent additions within window', () => {
    const w = new RollingWindow(1000);
    w.add();
    w.add();
    w.add();
    expect(w.count()).toBe(3);
  });

  it('expires entries older than window', () => {
    vi.setSystemTime(0);
    const w = new RollingWindow(1000);
    w.add();
    vi.setSystemTime(500);
    w.add();
    vi.setSystemTime(1200);
    expect(w.count()).toBe(1);
    vi.setSystemTime(1600);
    expect(w.count()).toBe(0);
  });

  it('returns 0 for empty window', () => {
    expect(new RollingWindow(1000).count()).toBe(0);
  });

  it('prunes on add to bound memory', () => {
    vi.setSystemTime(0);
    const w = new RollingWindow(100);
    for (let i = 0; i < 1000; i++) w.add();
    vi.setSystemTime(200);
    w.add();
    expect(w.count()).toBe(1);
    expect(w.size()).toBe(1);
  });
});

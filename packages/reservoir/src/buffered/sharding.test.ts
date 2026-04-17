import { describe, it, expect } from 'vitest';
import { shardOf } from './sharding.js';

describe('shardOf', () => {
  it('returns a shard in [0, shardCount)', () => {
    for (let i = 0; i < 100; i++) {
      const shard = shardOf(`project-${i}`, 8);
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(8);
    }
  });

  it('is deterministic for the same input', () => {
    expect(shardOf('abc', 8)).toBe(shardOf('abc', 8));
    expect(shardOf('proj-42', 16)).toBe(shardOf('proj-42', 16));
  });

  it('distributes roughly evenly across shards', () => {
    const counts = new Array(8).fill(0);
    for (let i = 0; i < 10_000; i++) {
      counts[shardOf(`project-${i}`, 8)]++;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(1000);
      expect(c).toBeLessThan(1500);
    }
  });

  it('throws on invalid shardCount', () => {
    expect(() => shardOf('abc', 0)).toThrow();
    expect(() => shardOf('abc', -1)).toThrow();
  });
});

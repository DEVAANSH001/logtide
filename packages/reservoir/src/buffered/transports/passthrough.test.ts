import { describe, it, expect, vi } from 'vitest';
import { PassthroughTransport } from './passthrough.js';
import type { BufferRecord } from '../types.js';

describe('PassthroughTransport', () => {
  it('calls flush synchronously on enqueue', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const t = new PassthroughTransport(flush);
    await t.start();
    const record: BufferRecord = {
      kind: 'log',
      projectId: 'p',
      payload: { message: 'hi' } as unknown as BufferRecord['payload'],
      enqueuedAt: Date.now(),
    };
    await t.enqueue(record);
    expect(flush).toHaveBeenCalledWith([record]);
  });

  it('dequeue always returns null', async () => {
    const t = new PassthroughTransport(vi.fn());
    await t.start();
    expect(await t.dequeue(0, 100, 10)).toBeNull();
  });

  it('getStats returns zeros', async () => {
    const t = new PassthroughTransport(vi.fn());
    const s = await t.getStats();
    expect(s.pendingRecords).toBe(0);
    expect(s.inflightRecords).toBe(0);
  });
});

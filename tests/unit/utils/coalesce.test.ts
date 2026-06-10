import { describe, it, expect, vi } from 'vitest';
import { createCoalescedRunner } from '@/utils/coalesce';

const flushMicrotasks = async (rounds = 4): Promise<void> => {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}

describe('createCoalescedRunner', () => {
  it('collapses N synchronous triggers into one execution', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const schedule = createCoalescedRunner(fn);
    schedule();
    schedule();
    schedule();
    expect(fn).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reads the LATEST state at execution time (final state wins)', async () => {
    let value = 'initial';
    const seen: string[] = [];
    const schedule = createCoalescedRunner(async () => {
      seen.push(value);
    });
    schedule();
    value = 'final';
    await flushMicrotasks();
    expect(seen).toEqual(['final']);
  });

  it('a trigger DURING execution schedules exactly one follow-up run', async () => {
    const gate = deferred();
    let calls = 0;
    const schedule = createCoalescedRunner(async () => {
      calls++;
      if (calls === 1) await gate.promise;
    });
    schedule();
    await flushMicrotasks();
    expect(calls).toBe(1);
    schedule();
    schedule();
    schedule();
    gate.resolve();
    await flushMicrotasks();
    expect(calls).toBe(2);
  });

  it('settled promise resolves only after the final (re-)run', async () => {
    const gate = deferred();
    const order: string[] = [];
    let calls = 0;
    const schedule = createCoalescedRunner(async () => {
      calls++;
      if (calls === 1) await gate.promise;
      order.push(`run${calls}`);
    });
    const p1 = schedule();
    await flushMicrotasks();
    const p2 = schedule();
    gate.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['run1', 'run2']);
  });

  it('recovers after a rejected execution', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const schedule = createCoalescedRunner(fn);
    await expect(schedule()).rejects.toThrow('boom');
    schedule();
    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT dedupe across separate ticks (documented limitation)', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const schedule = createCoalescedRunner(fn);
    schedule();
    await flushMicrotasks();
    schedule();
    await flushMicrotasks();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

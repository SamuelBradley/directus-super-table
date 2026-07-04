import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { warnOnce, __resetWarnOnce } from '@/utils/warnOnce';

describe('warnOnce', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetWarnOnce();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('emits a given message only once', () => {
    warnOnce('dup');
    warnOnce('dup');
    warnOnce('dup');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('dup');
  });

  it('treats distinct messages independently', () => {
    warnOnce('a');
    warnOnce('b');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('__resetWarnOnce clears the dedupe cache', () => {
    warnOnce('again');
    __resetWarnOnce();
    warnOnce('again');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

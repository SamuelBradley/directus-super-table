/**
 * Collapses N triggers into a minimal number of executions of `fn`:
 *
 * - Triggers arriving while nothing is scheduled/running share ONE
 *   microtask-deferred execution (same-tick coalescing). Vue runs pre-flush
 *   watchers, component re-renders and post-flush watchers inside a single
 *   scheduler microtask; a microtask queued from any of them executes after
 *   that whole cycle, so one user action that fires several watchers (even
 *   pre- AND post-flush) results in exactly one `fn` call.
 * - Triggers arriving WHILE `fn` is executing set a re-run flag; exactly one
 *   follow-up execution starts after the current one settles, no matter how
 *   many triggers arrived in between (trailing-edge, single-flight).
 * - `fn` must read its inputs at execution time (Vue `.value` reads); the
 *   runner deliberately passes no arguments, so the final state always wins.
 *
 * Limitation by design: triggers in different macrotasks (e.g. network
 * resolutions) are separate executions — content-level dedupe is the
 * fingerprint watcher's job, not this runner's.
 */
export function createCoalescedRunner(fn: () => Promise<void> | void): () => Promise<void> {
  let scheduled = false;
  let running = false;
  let rerunRequested = false;
  let settled: Promise<void> = Promise.resolve();

  async function execute(): Promise<void> {
    scheduled = false;
    running = true;
    try {
      do {
        rerunRequested = false;
        // Invariant: fn must not reject — a throw exits this loop and drops a
        // rerunRequested set during the run. getItems catches its awaited fetch;
        // the synchronous .value reads before it are treated as non-throwing.
        await fn();
      } while (rerunRequested);
    } finally {
      running = false;
    }
  }

  return function schedule(): Promise<void> {
    if (running) {
      rerunRequested = true;
      return settled;
    }
    if (scheduled) {
      return settled;
    }
    scheduled = true;
    settled = Promise.resolve().then(execute);
    return settled;
  };
}

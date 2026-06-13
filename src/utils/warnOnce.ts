/**
 * Console-warn that emits each distinct message only once per session.
 *
 * Layout computeds re-run on every reactive recompute (pagination, sort,
 * language switch, ...); a stale template token would otherwise re-log the
 * same drop warning on every pass. The cache is keyed by the full message
 * and deliberately unbounded: its size is capped by the number of distinct
 * invalid template tokens a user can produce, which is tiny in practice.
 */
const warned = new Set<string>();

export function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** Test-only: clear the dedupe cache so each test observes its own warning. */
export function __resetWarnOnce(): void {
  warned.clear();
}

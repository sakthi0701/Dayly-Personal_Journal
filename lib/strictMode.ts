/**
 * Strict Mode Guard — Phase 9
 * Attaches a visibilitychange listener and fires escalating consequences
 * based on how many times the user switches away during a focus session.
 */
export type ViolationLevel = 0 | 1 | 2 | 3;

export interface StrictModeOptions {
  onWarning: (count: number, level: ViolationLevel) => void;
  onFail: (count: number) => void;
}

export function attachStrictModeGuard(opts: StrictModeOptions): () => void {
  let violations = 0;
  let active = true;

  const handler = () => {
    if (!active || !document.hidden) return;
    violations++;

    const level = Math.min(violations, 3) as ViolationLevel;

    if (violations >= 3) {
      opts.onFail(violations);
      active = false; // stop counting after auto-fail
    } else {
      opts.onWarning(violations, level);
    }
  };

  document.addEventListener('visibilitychange', handler);
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', handler);
  };
}

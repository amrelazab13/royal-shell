import { DestroyRef } from '@angular/core';

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Forget a pending call. Safe to call when nothing is pending. */
  cancel(): void;
}

/**
 * Run `fn` once the calls stop for `ms`, with the arguments of the last call.
 *
 * The global rule names this and `Latest` as how search works everywhere
 * (`Royal New System/CLAUDE.md`, §3): "search: debounced and latest-wins, so
 * a stale answer never overwrites a newer one." The contract is the CRM's,
 * character for character, so a reader who knows one module knows this one.
 *
 * Handed a `DestroyRef`, a pending call is dropped when the owner is torn
 * down — in the CRM the search box's debounce used to navigate a page the
 * reader had already left, bouncing them back to `/leads?q=…` from wherever
 * they had gone. This module writes `q` into the address bar from a debounce
 * too, so it inherits that fault unless the `DestroyRef` is passed; both
 * screens pass it.
 *
 * Shared from royal-shell since 28 Sep 2026 (written by the CEO portal, the
 * third module to need it), so no module keeps a copy of its own.
 */
export function debounce<A extends unknown[]>(
  ms: number,
  fn: (...args: A) => void,
  destroyRef?: DestroyRef,
): Debounced<A> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };
  const run = (...args: A) => {
    cancel();
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, ms);
  };
  destroyRef?.onDestroy(cancel);
  return Object.assign(run, { cancel });
}

import { DestroyRef, effect, inject, signal } from '@angular/core';

/**
 * The state behind the shared rail.
 *
 * Retracted on every load, at every width. A pin lasts as long as the tab
 * does — the whole of a working session in an app that never reloads itself
 * — and a reload starts retracted again.
 *
 * It is deliberately not remembered. A remembered pin lets the app train
 * itself open one accidental press at a time, which is the thing the owner
 * ruled out. HR used to remember it, through its own `remembered()` helper,
 * and no longer does: that was the one behaviour this package had to take
 * away to make the modules agree.
 *
 * The classes go on `<body>` because the ported stylesheet keys off them
 * there, including inside its media queries. Rather than fork those rules to
 * a different element in four apps, `<body>` stays the thing that carries the
 * state.
 */
export interface Rail {
  /** True while the rail is a rail. False while the hamburger holds it open. */
  readonly collapsed: ReturnType<typeof signal<boolean>>;
  /** True while the pointer is on it. Means nothing while it is pinned. */
  readonly peeking: ReturnType<typeof signal<boolean>>;
  /** Pin it open, or hand it back to the pointer. */
  toggle(): void;
}

export function railState(): Rail {
  const collapsed = signal(true);
  const peeking = signal(false);

  effect(() => {
    document.body.classList.toggle('side-collapsed', collapsed());
    // Open on a point, closed on leaving — and never while it is pinned,
    // where the panel is already open and the pointer means nothing.
    document.body.classList.toggle('side-peek', collapsed() && peeking());
  });

  // A shell that is torn down — a sign-out, a route that replaces it — must
  // not leave the body dressed for a rail that is no longer on screen.
  inject(DestroyRef).onDestroy(() => {
    document.body.classList.remove('side-collapsed', 'side-peek');
  });

  return {
    collapsed,
    peeking,
    toggle() {
      collapsed.update((was) => !was);
      // Leaving `peeking` set would hold the panel open after it is
      // unpinned, until the pointer happened to cross it again.
      peeking.set(false);
    },
  };
}

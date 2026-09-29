import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * How tall a pinned filter bar is, written where CSS can read it.
 *
 * Two sticky layers share one scroller on a list screen (bible §4.9): the
 * filter bar pins to `main.content`, and the table's column heads pin
 * underneath it. The lower one's offset is the upper one's height — and that
 * height is not a number anybody can type. It changes with the language, and
 * the bar wraps to two rows at 375px, so a typed number is wrong exactly at
 * the width where a pinned head matters most. Measured in the CEO portal:
 * 49px at 1456 against a stylesheet fallback of 44, which put the heads five
 * pixels under the bar.
 *
 * Put it on the bar:
 *
 *   <div class="frow pinned" appPinHeight>…</div>
 *
 * and read it from the heads, in the screen's own stylesheet:
 *
 *   .the-log thead th { position: sticky; top: var(--pin-h, 52px); }
 *
 * **The fallback matters.** Make it a little MORE than the bar has ever
 * measured, never less: a head a few pixels too low shows a hairline of rows
 * beneath the bar, and a head a few pixels too high hides behind it, so the
 * two errors are not worth the same. The fallback is also what stands wherever
 * `ResizeObserver` never delivers — a background tab, a hidden pane — so the
 * screen has to be RIGHT without this directive, not merely close.
 *
 * **A directive, not a lookup from the screen.** The CEO portal wrote this
 * three other ways first, each of them a guess about WHEN Angular has the
 * element: `afterNextRender`, which in a ZONELESS app waits for a render that
 * never comes after a route change; a `MutationObserver` on the host; and a
 * `viewChild` read in an `effect`. A directive is handed its own element when
 * it is constructed, so there is no when to be wrong about. Every one of those
 * failures was also QUIET, because the fallback is close to the true height —
 * the screen looked right and the heads sat a few pixels off.
 *
 * `--pin-h` goes on the bar's PARENT, which is the screen's host element, so
 * it inherits down to the heads even when that host is `display: contents` and
 * has no box of its own.
 *
 * A `ResizeObserver` rather than one read, because the bar's height changes
 * without the screen re-rendering: switching language re-flows it, and so does
 * dragging a window across the wrap point.
 */
@Directive({ selector: '[appPinHeight]' })
export class PinHeight {
  constructor() {
    const bar = inject(ElementRef).nativeElement as HTMLElement;
    // The browser is the only place this can work. Tests run in jsdom, which
    // does no layout: measuring there would write 0 and put every head back
    // under the bar, so the stylesheet's fallback is what holds. Guarded
    // rather than mocked — a mock would prove the guard, not the measurement.
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => {
      bar.parentElement?.style.setProperty('--pin-h', `${Math.round(bar.offsetHeight)}px`);
    });
    watch.observe(bar);
    inject(DestroyRef).onDestroy(() => watch.disconnect());
  }
}

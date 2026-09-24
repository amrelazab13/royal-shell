import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The hamburger's glyph: three lines and a chevron pointing the way the rail
 * will move — out to open it, in to close it. Chrome's side-panel button.
 *
 * Two symbols swapped on a boolean rather than one animated: the movement is
 * the rail's job, and a button that animates while the thing it controls is
 * also animating reads as noise.
 *
 * The lines stop short of the chevron and the middle line recedes from it, so
 * the two never collide. Everything is symmetric about the vertical, which is
 * what lets the whole glyph mirror under RTL — where the rail is on the right
 * and "out" and "in" are the other way round. The mirror itself lives in
 * `rail.scss`, keyed off `[dir='rtl']`.
 */
@Component({
  selector: 'royal-rail-burger',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      @if (collapsed()) {
        <!-- Retracted: "open me", chevron away from the edge. -->
        <path d="M4 7h14M4 12h8M4 17h14" />
        <path d="M16 9l3 3-3 3" />
      } @else {
        <!-- Pinned open: "close me", chevron back toward the edge. -->
        <path d="M4 7h14M10 12h8M4 17h14" />
        <path d="M7 9l-3 3 3 3" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class RailBurger {
  /** True while the rail is retracted, which is what the chevron reads. */
  readonly collapsed = input.required<boolean>();
}

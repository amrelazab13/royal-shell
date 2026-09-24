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
        <!-- Retracted: "open me". The chevron sits on the leading edge and
             points into the lines; the middle line yields to it. -->
        <path d="M9 7h12M12 12h9M9 17h12" />
        <path d="M4 9l3 3-3 3" />
      } @else {
        <!-- Pinned open: "close me". The same shape, handed the other way. -->
        <path d="M3 7h12M3 12h9M3 17h12" />
        <path d="M20 9l-3 3 3 3" />
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

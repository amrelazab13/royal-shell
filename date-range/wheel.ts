import { InjectionToken } from '@angular/core';

/**
 * The hour and minute wheels, the iPhone way.
 *
 * The owner, 1 October 2026, looking at the follow-up picker: "the 7 days
 * fence works, but for the time, thats too complex, make it like iphone". The
 * grid it replaces was twenty-four hour buttons in rows of four and twelve
 * minutes beside them — every value visible at once, which is the opposite of
 * how a phone asks for a time and reads as a keypad rather than a choice.
 *
 * Drawn rather than native, deliberately. `<input type="time">` would be one
 * line and is refused by the design system's own gate (C-5): the OS picker
 * looks different on every platform, speaks its own language rather than the
 * app's, and ignores a fence the app has already worked out. A wheel we draw
 * is the same on an iPhone, an Android and the web, and it can grey the hours
 * a follow-up may not have.
 *
 * The geometry lives here rather than in either component because both the
 * date picker's time half and the standalone time control use it, and two
 * copies of a row height is how two wheels end up a pixel apart.
 */

/** One row, in CSS pixels. The stylesheet must agree; the spec asserts it. */
export const ROW_PX = 34;

/**
 * A light tick as the wheel passes a value, on the platforms that have one.
 *
 * An injection token rather than an import, because royal-shell is shared with
 * the WEB CRM and must stay free of Capacitor — importing `@capacitor/haptics`
 * here would break every web build that consumes this package. The phone
 * provides it in one line; the web provides nothing and the wheel is simply
 * silent, which is what a mouse wants anyway.
 */
export const WHEEL_TICK = new InjectionToken<() => void>('a tick as the wheel turns');

/** Which row is under the window, from how far the column has scrolled. */
export function centredIndex(scrollTop: number): number {
  return Math.max(0, Math.round(scrollTop / ROW_PX));
}

/** Where that row has to sit for the window to be over it. */
export function offsetFor(index: number): number {
  return index * ROW_PX;
}

/**
 * The nearest row that may actually be chosen.
 *
 * A fenced wheel can settle on an hour the follow-up rule forbids — spin it
 * past the dead ones and let go, and momentum lands where it lands. iOS greys
 * such a row and refuses to rest on it; so does this. Ties go DOWN, towards
 * later: on the fence day the dead hours are the ones already past, so the
 * live neighbour below is the one somebody meant.
 *
 * Returns -1 when every row is dead, which the caller must treat as "leave it
 * alone" rather than as index 0.
 */
export function nearestLive(count: number, from: number, dead: (index: number) => boolean): number {
  if (count <= 0) return -1;
  const start = Math.min(Math.max(from, 0), count - 1);
  if (!dead(start)) return start;
  for (let step = 1; step < count; step++) {
    const below = start + step;
    if (below < count && !dead(below)) return below;
    const above = start - step;
    if (above >= 0 && !dead(above)) return above;
  }
  return -1;
}

/** A unique stem for the option ids `aria-activedescendant` has to point at.
 *  Two pickers on one screen must not both own `#h-09`. */
let seen = 0;
export function wheelId(): string {
  seen += 1;
  return `w${seen}`;
}

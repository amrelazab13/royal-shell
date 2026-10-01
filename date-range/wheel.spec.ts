/**
 * The wheel's arithmetic.
 *
 * A scroll-snap wheel is a row height in the stylesheet and the same height in
 * the code that works out which row is under the window. Change one and the
 * wheel lands half a row off, selects the neighbour of whatever somebody
 * chose, and nothing errors.
 *
 * That pair is NOT tested here, because it no longer exists: `ROW_PX` is the
 * only place the number is written and the stylesheet reads it as
 * `--wheel-row` off the element. Two numbers that must match are better made
 * one than policed. (A spec cannot read a .scss anyway — Vite's
 * `import.meta.glob` returns nothing for one, silently, which is why the
 * pinned-header check is a standalone script rather than a test.)
 */
import { ROW_PX, centredIndex, offsetFor, nearestLive, wheelId } from './wheel';

describe('which row is under the window', () => {
  it('rounds to the nearest row, so a half-scrolled wheel still has an answer', () => {
    expect(centredIndex(0)).toBe(0);
    expect(centredIndex(ROW_PX)).toBe(1);
    expect(centredIndex(ROW_PX * 2 - 1)).toBe(2);
    expect(centredIndex(ROW_PX * 2 + 1)).toBe(2);
  });

  it('never answers with a row above the first', () => {
    // iOS rubber-banding scrolls past the top and reports a negative offset.
    expect(centredIndex(-40)).toBe(0);
  });

  it('round-trips with the offset that puts a row there', () => {
    for (const index of [0, 1, 9, 23]) expect(centredIndex(offsetFor(index))).toBe(index);
  });
});

describe('landing on a row that may actually be chosen', () => {
  const noneDead = () => false;

  it('stays where it landed when that row is alive', () => {
    expect(nearestLive(24, 9, noneDead)).toBe(9);
  });

  it('moves DOWN off a fenced row, towards later', () => {
    // The fence day's dead hours are the ones already past, so the live
    // neighbour below is the one somebody meant.
    const deadBelow10 = (i: number) => i < 10;
    expect(nearestLive(24, 3, deadBelow10)).toBe(10);
  });

  it('comes back UP when there is nothing below', () => {
    const deadAbove5 = (i: number) => i > 5;
    expect(nearestLive(24, 20, deadAbove5)).toBe(5);
  });

  it('says so rather than answering 0 when every row is fenced off', () => {
    // A caller that read this as an index would silently choose midnight.
    expect(nearestLive(24, 7, () => true)).toBe(-1);
    expect(nearestLive(0, 0, noneDead)).toBe(-1);
  });

  it('holds a landing outside the list inside it', () => {
    expect(nearestLive(24, 99, noneDead)).toBe(23);
    expect(nearestLive(24, -5, noneDead)).toBe(0);
  });
});

describe('two wheels on one screen', () => {
  it('do not share their option ids', () => {
    expect(wheelId()).not.toBe(wheelId());
  });
});

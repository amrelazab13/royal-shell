/**
 * Royal keeps Cairo time, and every date a module SENDS is Cairo's too.
 *
 * The CRM's own file, shared unchanged (the design system is the CRM's — the
 * owner, 25 Sep 2026). What is shown is pinned to Africa/Cairo; this pins what
 * is asked for. Screens used to build "today" and "this month" from the
 * browser's own clock, and the APIs read those strings in Cairo — so a phone
 * in the Gulf an hour ahead, or a laptop in London after ten at night, asked
 * for a different day from the one the server was standing in. Worst of all on
 * the first of the month at half past midnight, when the UTC date is still
 * last month and "This month" selected the wrong one. HR shipped exactly that
 * bug with `toISOString()` (audit 5, 02 §11).
 *
 * Africa/Cairo rather than a fixed +02:00: Egypt moves an hour in summer, and
 * an offset written into the code would be an hour wrong for half the year.
 */
const ZONE = 'Africa/Cairo';

interface WallClock {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const pad = (n: number) => String(n).padStart(2, '0');

/** The Cairo wall clock at one instant. */
export function cairoClock(instant: Date = new Date()): WallClock {
  const read: Record<string, number> = {};
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== 'literal') read[part.type] = Number(part.value);
  }
  return {
    year: read['year'] ?? 0,
    month: read['month'] ?? 1,
    day: read['day'] ?? 1,
    // Some engines print midnight as 24 under h23 on older ICU builds.
    hour: (read['hour'] ?? 0) % 24,
    minute: read['minute'] ?? 0,
    second: read['second'] ?? 0,
  };
}

/** `yyyy-mm-dd` of the Cairo day this instant falls on. */
export function isoDateInCairo(instant: Date): string {
  const c = cairoClock(instant);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

export function todayInCairo(now: Date = new Date()): string {
  return isoDateInCairo(now);
}

export function monthStartInCairo(now: Date = new Date()): string {
  const c = cairoClock(now);
  return `${c.year}-${pad(c.month)}-01`;
}

export function yearInCairo(now: Date = new Date()): number {
  return cairoClock(now).year;
}

/** `yyyy-mm-ddThh:mm` of the Cairo wall clock — what a
 *  `<input type="datetime-local">` shows for this instant. */
export function toCairoInput(instant: Date): string {
  const c = cairoClock(instant);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
}

/** Cairo's offset from UTC at one instant, as `+02:00` or `+03:00`. */
export function cairoOffset(instant: Date): string {
  const c = cairoClock(instant);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  // Whole minutes; the instant's own milliseconds must not leak in.
  const minutes = Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * A `datetime-local` value read as Cairo wall-clock time, with the offset
 * said out loud — `2026-07-15T09:00:00+03:00`.
 *
 * "Tomorrow 09:00" typed in London is nine in the morning in the office, not
 * eleven. The offset is Cairo's on THAT date, so a follow-up booked across the
 * summer-time change still lands on the hour typed.
 */
export function toCairoIso(localInput: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localInput.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00'] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // The offset depends on the instant, and the instant depends on the offset.
  // Two passes settle it: the first guess is right except in the hour around
  // a summer-time change, and the second reads the offset at the corrected
  // instant.
  let offset = cairoOffset(new Date(wall));
  offset = cairoOffset(new Date(wall - offsetMinutes(offset) * 60_000));
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
}

function offsetMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

/** `yyyy-mm-dd` shifted by whole days, on the calendar rather than the clock —
 *  so a summer-time change never costs a day. */
export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The last day of the month `iso` falls in, as `yyyy-mm-dd`. */
export function monthEndOf(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

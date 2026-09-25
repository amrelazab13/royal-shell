import {
  cairoClock,
  cairoOffset,
  isoDateInCairo,
  monthEndOf,
  monthStartInCairo,
  shiftIsoDate,
  toCairoInput,
  toCairoIso,
  todayInCairo,
  yearInCairo,
} from './dates';

describe('Cairo dates', () => {
  /* ── the 00:30-on-the-1st case ───────────────────────────────────────────── */

  it('calls the first of the month "the first" at half past midnight in Cairo, summer', () => {
    // 22:30 UTC on 30 September is 01:30 on 1 October in Cairo (+03:00).
    const instant = new Date('2026-09-30T22:30:00Z');
    expect(todayInCairo(instant)).toBe('2026-10-01');
    expect(monthStartInCairo(instant)).toBe('2026-10-01');
    expect(cairoClock(instant)).toMatchObject({
      year: 2026,
      month: 10,
      day: 1,
      hour: 1,
      minute: 30,
    });
  });

  it('calls the first of the month "the first" at half past midnight in Cairo, winter', () => {
    // 22:30 UTC on 31 January is 00:30 on 1 February in Cairo (+02:00).
    const instant = new Date('2026-01-31T22:30:00Z');
    expect(todayInCairo(instant)).toBe('2026-02-01');
    expect(monthStartInCairo(instant)).toBe('2026-02-01');
  });

  it('calls New Year "this year" from Cairo’s midnight, not UTC’s', () => {
    // 23:00 UTC on 31 December 2026 is 01:00 on 1 January 2027 in Cairo.
    const instant = new Date('2026-12-31T23:00:00Z');
    expect(yearInCairo(instant)).toBe(2027);
    expect(monthStartInCairo(instant)).toBe('2027-01-01');
  });

  it('is still yesterday in Cairo when it is already today far to the east', () => {
    // 21:30 UTC on 14 March is 23:30 in Cairo — the 14th, whatever Dubai says.
    expect(isoDateInCairo(new Date('2026-03-14T21:30:00Z'))).toBe('2026-03-14');
  });

  /* ── the offset moves with the season ────────────────────────────────────── */

  it('knows Cairo is +03:00 in summer and +02:00 in winter', () => {
    expect(cairoOffset(new Date('2026-07-15T06:00:00Z'))).toBe('+03:00');
    expect(cairoOffset(new Date('2026-01-15T06:00:00Z'))).toBe('+02:00');
  });

  it('sends a follow-up as Cairo wall-clock time with the offset said out loud', () => {
    expect(toCairoIso('2026-07-15T09:00')).toBe('2026-07-15T09:00:00+03:00');
    expect(toCairoIso('2026-01-15T09:00')).toBe('2026-01-15T09:00:00+02:00');
    // The same instant read back is the same wall clock.
    expect(toCairoInput(new Date('2026-07-15T09:00:00+03:00'))).toBe('2026-07-15T09:00');
    expect(toCairoInput(new Date('2026-01-15T09:00:00+02:00'))).toBe('2026-01-15T09:00');
  });

  it('refuses a value that is not a datetime-local string', () => {
    expect(toCairoIso('')).toBeNull();
    expect(toCairoIso('tomorrow')).toBeNull();
    expect(toCairoIso('2026-07-15')).toBeNull();
  });

  it('keeps seconds when the input carries them', () => {
    expect(toCairoIso('2026-07-15T09:00:30')).toBe('2026-07-15T09:00:30+03:00');
  });

  /* ── calendar arithmetic ─────────────────────────────────────────────────── */

  it('shifts on the calendar, across a month end and a summer-time change', () => {
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftIsoDate('2026-04-30', -6)).toBe('2026-04-24');
    expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('finds the last day of the month, leap years included', () => {
    expect(monthEndOf('2026-02-10')).toBe('2026-02-28');
    expect(monthEndOf('2028-02-10')).toBe('2028-02-29');
    expect(monthEndOf('2026-12-01')).toBe('2026-12-31');
  });
});

/**
 * The words no person may ever read (CLAUDE.md, "The owner is never shown as
 * Super Admin"), in one place for every shared control.
 *
 * Union of the org chart's pattern and the CEO portal's (which adds the Arabic
 * "system general manager" forms). A control that draws a value a feed sent
 * runs it through `readable` here, so the guard follows the data into every
 * shape it is drawn in (16 Nov 2026: the portal's guard walked titles[] after
 * HR moved people into units[], and a name inside a section rendered).
 */
export const FORBIDDEN_WORDS =
  /super[\s._-]*admin|سوبر\s*[أا]دمن|(?:ال)?مدير\s*(?:(?:ال)?عام\s*للنظام|(?:ال)?نظام\s*(?:ال)?عام)/i;

/** The value, or `instead` when it holds a forbidden word. */
export function readable(value: string | null | undefined, instead: string): string {
  if (!value) return '';
  return FORBIDDEN_WORDS.test(value) ? instead : value;
}

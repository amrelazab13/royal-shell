/**
 * Text folded to what a reader meant, not what they typed (F68).
 *
 * Arabic search fails on the letters people do not think of as different.
 * `أحمد` and `احمد` are one name to everybody who writes it and two strings to
 * `includes()`, and a reader who types the plain alef, which most keyboards
 * give first, would be told there is no such person. So:
 *
 *   · NFKD, then every NONSPACING MARK dropped. This takes the hamza off أ إ آ
 *     and the accents off José in one pass. `\p{Mn}` and NOT `\p{Diacritic}`:
 *     NFKD turns أ into ا + U+0654 ARABIC HAMZA ABOVE, which is `Mn` but not
 *     `Diacritic`, so the obvious spelling silently leaves every hamza alef
 *     alone (the CEO portal, 28 Sep 2026; only a test caught it).
 *   · tatweel (ـ) removed: a stretch mark, never part of a word.
 *   · ى → ي, which is not a mark and has to be said.
 *   · Arabic-Indic and extended digits folded to 0-9.
 *   · lower-cased, runs of space collapsed.
 *
 * A WORD-FINAL `ة` folds to `ه`, in the search key only (the CRM measured it,
 * 28 Sep 2026: 108 names on live are spelled both ways, فاطمه/فاطمة split
 * 22/34 and اسامه/اسامة 54/38, so either spelling found about half the
 * people; and عبداللة, a slip, joins عبدالله's 188). It changes nothing a
 * person reads: the stored and shown name keep their letter. Mid-word `ة` is
 * left alone. It was first kept apart ("it changes names rather than
 * spellings", right about display); the measurement showed it splits people.
 *
 * **The server folds the same way**: royal-module-kit's
 * `royal_kit.common.fold`, held to the SAME case table (`FOLD_CASES` below and
 * the kit's `contracts/fold-cases.json`). Two search boxes in one product that
 * disagree about whether `احمد` finds `أحمد` are worse than neither folding.
 * Written by the CEO portal; shared from here since 28 Sep 2026.
 */
export function fold(text: string): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .replace(/ـ/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة(?=\s|$)/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether one row answers a query. Every WORD must appear, in any field:
 * "ahmed sales" finds the Ahmed in sales. An empty query matches everything.
 */
export function matches(fields: readonly (string | null | undefined)[], query: string): boolean {
  const asked = fold(query);
  if (!asked) return true;
  const hay = fields
    .filter(Boolean)
    .map((f) => fold(f as string))
    .join(' ');
  return asked.split(' ').every((word) => hay.includes(word));
}

/**
 * The table both folds are held to. Keep it identical to royal-module-kit's
 * `contracts/fold-cases.json`: a case is added in both, never in one.
 */
export const FOLD_CASES: Readonly<Record<string, string>> = {
  أحمد: 'احمد',
  احمد: 'احمد',
  إبراهيم: 'ابراهيم',
  ابراهيم: 'ابراهيم',
  آمنة: 'امنه',
  امنة: 'امنه',
  مُحَمَّد: 'محمد',
  محمد: 'محمد',
  محــمد: 'محمد',
  يحيى: 'يحيي',
  يحيي: 'يحيي',
  سمية: 'سميه',
  سميه: 'سميه',
  فاطمة: 'فاطمه',
  فاطمه: 'فاطمه',
  'مروة علي': 'مروه علي',
  '١٢٣٤': '1234',
  '۱۲۳': '123',
  '0042': '0042',
  '٠٠٤٢': '0042',
  José: 'jose',
  '  Two   Words ': 'two words',
  System: 'system',
  النظام: 'النظام',
};

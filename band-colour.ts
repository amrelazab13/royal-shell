/**
 * Which colour class a band wears — lifted from HR (O-368) with the org chart
 * that uses it, unchanged.
 *
 * The colours themselves are custom properties, one per band code, set by the
 * `b-<code>` classes in the module's global stylesheet; this is the one line
 * that turns a code into the class that names one. It lives here rather than
 * in any one screen because the chart card and a register's chip must never
 * drift apart: a person shown amber on the wall is amber in the list.
 */
export function bandClass(code: string | null | undefined): string {
  const clean = (code ?? '').trim().toLowerCase();
  return /^[a-z][0-9]$/.test(clean) ? `b-${clean}` : 'b-none';
}

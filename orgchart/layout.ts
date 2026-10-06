/**
 * The org chart's LAYOUT MATHS — lifted verbatim from HR (O-368).
 *
 * It arrives unchanged because it was already module-agnostic: `layoutTree<N>`,
 * `bandsOf<N>` and `elbow` take the tree, a `kids` accessor and a `band`
 * accessor, and know nothing about an employee, a door or a service. That is
 * why this half could be shared at all, and it is the line to hold — **nothing
 * in this file may import a module's service, words or models.** The moment it
 * does, every consumer inherits HR's book.
 *
 * The owner's rule 9 (5 Oct 2026): every module draws HR's chart with the same
 * cards, band lanes and behaviour, narrowed to its own people. The narrowing
 * is `narrow.ts` beside this; the drawing is this.
 */
/**
 * The wall chart's geometry: rows by band, trees by reporting line.
 *
 * The same engine the CRM's org board uses, and for the same reason — the
 * owner's ruling of 8 September 2026: every seniority band present is one
 * horizontal row across the whole chart, most senior at the top, so two
 * Professionals stand on one level whoever they report to. A chart laid out by reporting
 * depth had put a Junior above an Executive. Within the bands a tidy tree
 * gives every branch its own stretch of the width, a manager centred over
 * their people, so a line can cross several bands without running under
 * anybody else's card.
 *
 * Pure functions over a caller-supplied shape, so the chart's own node type
 * and its folding rules stay its own and the geometry is tested bare.
 */

// Tighter than a page of cards would like, because the whole company has to
// stand on one canvas: 50 people across a dozen bands is a dozen rows deep
// before anybody is hired.
export const CARD_W = 152;
export const CARD_H = 74;
export const ROW_H = 112;
export const GAP = 14;

export interface Placed<N> {
  node: N;
  x: number;
  y: number;
  head: boolean;
}

export interface Link {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Plot<N> {
  width: number;
  height: number;
  cards: Placed<N>[];
  links: Link[];
}

/** One row per band somebody actually holds, most senior first.
 *
 *  Seniority is one company-wide band (the owner's ruling of 21 Sep 2026),
 *  so a Head of HR and a Head of Marketing on D2 stand on one line. Rank
 *  decides the order, so the lines run from the Chairman down; two keys
 *  that share a rank are ordered by their label, which keeps the wall
 *  steady between one drawing and the next.
 *
 *  An empty band says nothing, so only bands somebody holds get a line. */
export interface Band {
  key: string;
  rank: number;
  label_en: string;
  label_ar: string;
}

export function bandsOf<N>(roots: N[], kids: (n: N) => N[], band: (n: N) => Band): Band[] {
  const seen = new Map<string, Band>();
  const walk = (n: N) => {
    const b = band(n);
    if (!seen.has(b.key)) seen.set(b.key, b);
    for (const k of kids(n)) walk(k);
  };
  for (const r of roots) walk(r);
  return [...seen.values()].sort((a, b) => a.rank - b.rank || a.label_en.localeCompare(b.label_en));
}

/** One tree, placed: cards at (x, y) in a box `width` by `height`, and the
 *  elbow of every reporting line. `band` is the row a node sits on. */
export function layoutTree<N>(root: N, kids: (n: N) => N[], band: (n: N) => number): Plot<N> {
  const width = new Map<N, number>();
  const measure = (n: N): number => {
    const ks = kids(n);
    const across = ks.reduce((sum, k) => sum + measure(k), 0) + GAP * Math.max(0, ks.length - 1);
    const total = Math.max(CARD_W, across);
    width.set(n, total);
    return total;
  };
  measure(root);

  const cards: Placed<N>[] = [];
  const links: Link[] = [];
  let deepest = 0;
  const place = (n: N, x0: number, head: boolean): number => {
    const w = width.get(n)!;
    const ks = kids(n);
    const y = band(n) * ROW_H;
    deepest = Math.max(deepest, band(n));
    let cx: number;
    if (ks.length) {
      const across = ks.reduce((sum, k) => sum + width.get(k)!, 0) + GAP * (ks.length - 1);
      let cursor = x0 + (w - across) / 2;
      const centres: number[] = [];
      for (const k of ks) {
        centres.push(place(k, cursor, false));
        cursor += width.get(k)! + GAP;
      }
      cx = (centres[0] + centres[centres.length - 1]) / 2;
      ks.forEach((k, i) => {
        links.push({
          x1: cx + CARD_W / 2,
          y1: y + CARD_H,
          x2: centres[i] + CARD_W / 2,
          y2: band(k) * ROW_H,
        });
      });
    } else {
      cx = x0 + (w - CARD_W) / 2;
    }
    cards.push({ node: n, x: cx, y, head });
    return cx;
  };
  place(root, 0, true);

  return { width: width.get(root)!, height: deepest * ROW_H + CARD_H, cards, links };
}

/** The elbow of one reporting line: straight down from the manager, across
 *  under them, then straight down to the person — however many bands apart. */
export function elbow(link: Link): string {
  const knee = link.y1 + 20;
  return `M ${link.x1} ${link.y1} V ${knee} H ${link.x2} V ${link.y2}`;
}

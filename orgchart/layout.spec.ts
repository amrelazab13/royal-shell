import { CARD_H, CARD_W, GAP, ROW_H, bandsOf, elbow, layoutTree } from './layout';

/**
 * Rows by band, trees by reporting line — the owner's rulings of 8 and 21 Sep
 * 2026, kept here so HR's wall chart and the CRM's read the same way: a
 * Professional stands on the E2 line whoever they report to, and a Junior
 * Professional is never drawn above one.
 */
interface N {
  id: string;
  band: string;
  rank: number;
  reports: N[];
}

const n = (id: string, band: string, rank: number, reports: N[] = []): N => ({
  id,
  band,
  rank,
  reports,
});
const kids = (x: N) => x.reports;
const band = (x: N) => ({ key: x.band, rank: x.rank, label_en: x.band, label_ar: x.band });

// Marketing as the register holds it: the Head (D2); a Section Head (M3) with
// a Professional under him; a Team Leader (S1) with a Professional and a
// Junior Professional; and a Professional reporting straight to the Head.
const MARKETING = n('amr', 'D2', 70, [
  n('ghazy', 'M3', 100, [n('asser', 'E2', 140)]),
  n('shaalan', 'S1', 110, [n('hagar', 'E2', 140), n('abdo', 'E3', 150)]),
  n('loaa', 'E2', 140),
]);

describe('the bands', () => {
  const keys = (bands: { key: string }[]) => bands.map((b) => b.key);

  it('are the bands anybody holds, ordered by rank and not by code, one line each', () => {
    expect(keys(bandsOf([MARKETING], kids, band))).toEqual(['D2', 'M3', 'S1', 'E2', 'E3']);
    // By rank: M3 (100) above S1 (110) above E2, though the letters say otherwise.
    const mixed = n('c', 'C1', 40, [n('e', 'E1', 130), n('a', 'A1', 160), n('m', 'M1', 80)]);
    expect(keys(bandsOf([mixed], kids, band))).toEqual(['C1', 'M1', 'E1', 'A1']);
  });

  it('give two keys of one rank a line each, ordered by label', () => {
    const heads = n('sales', 'D2', 70, [n('hr', 'D1', 70)]);
    expect(keys(bandsOf([heads], kids, band))).toEqual(['D1', 'D2']);
  });

  it('are shared across trees, so a loose Professional stands level with the branch’s', () => {
    expect(keys(bandsOf([MARKETING, n('loose', 'E2', 140)], kids, band))).toEqual([
      'D2',
      'M3',
      'S1',
      'E2',
      'E3',
    ]);
  });
});

describe('the placed tree', () => {
  const rows = bandsOf([MARKETING], kids, band).map((b) => b.key);
  const row = (x: N) => rows.indexOf(x.band);
  const plot = layoutTree(MARKETING, kids, row);
  const at = (id: string) => plot.cards.find((c) => c.node.id === id)!;

  it('stands every Executive on one level, whoever they report to', () => {
    expect(at('asser').y).toBe(at('hagar').y);
    expect(at('loaa').y).toBe(at('hagar').y);
    expect(at('loaa').y).toBe(3 * ROW_H);
  });

  it('never draws a Junior above an Executive, nor an Executive above a Section Head', () => {
    expect(at('abdo').y).toBeGreaterThan(at('hagar').y);
    expect(at('loaa').y).toBeGreaterThan(at('ghazy').y);
    expect(at('amr').y).toBe(0);
  });

  it('gives every branch its own stretch of the width, so nothing overlaps', () => {
    const rows = new Map<number, number[]>();
    for (const c of plot.cards) {
      rows.set(
        c.y,
        [...(rows.get(c.y) ?? []), c.x].sort((a, b) => a - b),
      );
    }
    for (const xs of rows.values()) {
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD_W + GAP);
      }
    }
  });

  it('centres a manager over their people, and the head over everything', () => {
    expect(at('ghazy').x).toBe(at('asser').x);
    expect(at('shaalan').x).toBe((at('hagar').x + at('abdo').x) / 2);
    expect(at('amr').x).toBe((at('ghazy').x + at('loaa').x) / 2);
  });

  it('draws one line per person, from the manager’s foot to their head', () => {
    expect(plot.links.length).toBe(plot.cards.length - 1);
    const toLoaa = plot.links.find((l) => l.x2 === at('loaa').x + CARD_W / 2)!;
    expect(toLoaa.y1).toBe(at('amr').y + CARD_H);
    expect(toLoaa.y2).toBe(at('loaa').y);
    expect(elbow(toLoaa)).toMatch(/^M .* V .* H .* V .*$/);
  });

  it('is as tall as its deepest band', () => {
    expect(plot.height).toBe(4 * ROW_H + CARD_H);
  });

  it('places a lone card as one card at the top of its band', () => {
    const lone = layoutTree(n('solo', 'executive', 800), kids, () => 0);
    expect(lone.cards).toEqual([{ node: n('solo', 'executive', 800), x: 0, y: 0, head: true }]);
    expect(lone.width).toBe(CARD_W);
    expect(lone.height).toBe(CARD_H);
    expect(lone.links).toEqual([]);
  });
});

/**
 * The shapes the shared org chart draws — copied from HR's `core/models.ts`
 * (O-368), the origin of the chart, keeping only what the component reads.
 *
 * HR is the origin of people and the chart; every module receives these from
 * HR's feed and draws them. They are interfaces, so HR's own (wider) types
 * still fit: a module passes what it fetched, and gets the same nodes back on
 * every output.
 */

/** One person on the wall, with the people who report to them. */
export interface ChartNode {
  id: string;
  full_name_en: string;
  full_name_ar: string;
  title_en: string;
  title_ar: string;
  /** A department slug; its name comes from `Department`. */
  department: string;
  band: string | null;
  band_name_en: string;
  band_name_ar: string;
  /** The band's seniority: lower is more senior. Null for nobody on a band. */
  rank: number | null;
  hat: string | null;
  is_key: boolean;
  /** Why this line is doubtful; empty when it is not. */
  line_in_question: string;
  reports: ChartNode[];
}

/** The company: the trees, and the people who report to nobody. */
export interface Chart {
  tree: ChartNode[];
  reports_to_nobody: ChartNode[];
}

/** A department, for the name on a card. */
export interface Department {
  slug: string;
  name_en: string;
  name_ar: string;
}

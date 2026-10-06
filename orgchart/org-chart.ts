import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { bandClass } from '../band-colour';
import { SHELL_WORDS, ShellWords } from '../words';
import { Band, CARD_H, Link, Plot, ROW_H, bandsOf, elbow, layoutTree } from './layout';
import { Chart, ChartNode, Department } from './models';
import { narrow } from './narrow';

export type { Chart, ChartNode, Department } from './models';

/** The dash this family of apps uses for "nothing here" (HR's `NOTHING`):
 *  a department whose name has not arrived is not a name. */
const NOTHING = '—';

/**
 * The chart's own words, HR's own, in both languages (copied character for
 * character from HR's `core/i18n.service.ts`, where the chart was born).
 *
 * A module that passes its words through `SHELL_WORDS` is asked first, and a
 * key it does not know falls back to these — the date range's contract — so a
 * module with no `chart.*` keys of its own still reads correctly in Arabic,
 * and HR's own catalogue still wins in HR.
 */
export const CHART_WORDS: Record<string, { en: string; ar: string }> = {
  'chart.benchEmpty': { en: 'Everybody has a manager.', ar: 'لكل شخص مدير.' },
  'chart.cardDrop': {
    en: '{name}. Press Space to make {held} report here.',
    ar: '{name}. اضغط مسافة ليتبع {held} هذا الشخص.',
  },
  'chart.cardNoDrop': {
    en: '{name}. {held} cannot report here.',
    ar: '{name}. لا يمكن أن يتبع {held} هذا الشخص.',
  },
  'chart.cardPick': { en: '{name}. Press Space to pick up.', ar: '{name}. اضغط مسافة للالتقاط.' },
  'chart.cardPutDown': {
    en: '{name}, in hand. Press Space to put down.',
    ar: '{name}، في اليد. اضغط مسافة للإفلات.',
  },
  'chart.carrying': { en: 'Carrying', ar: 'في اليد' },
  'chart.detach': { en: 'Reports to nobody', ar: 'لا يتبع أحدًا' },
  'chart.dropOnSomeone': {
    en: 'Rest on a card to see what the drop will do.',
    ar: 'مرِّر فوق بطاقة لترى ما سيفعله الإفلات.',
  },
  'chart.dropToMake': { en: 'Drop to make', ar: 'أفلِت لتجعل' },
  'chart.edited': { en: 'edited', ar: 'مُعدّل' },
  'chart.emptySpace': { en: 'Nobody is drawn yet.', ar: 'لم يُرسم أحد بعد.' },
  'chart.fitCenter': { en: 'Fit the chart to the window', ar: 'ملاءمة الهيكل للنافذة' },
  'chart.foldBranch': {
    en: "Fold {name}'s branch ({n} people)",
    ar: 'طيّ فرع {name} ({n} أشخاص)',
  },
  'chart.hint': {
    en: 'One line per band, so two Professionals stand on one level whoever they report to. Pinch, or hold ⌘ and scroll, to zoom; ⌖ stands the whole company in the window.',
    ar: 'صفٌّ لكل درجة وظيفية، فيقف الزميلان في الدرجة نفسها على مستوى واحد مهما اختلف من يتبعانه. اقرص بإصبعين أو استخدم ⌘ مع التمرير للتكبير، و⌖ يضع الشركة كلها داخل النافذة.',
  },
  'chart.hintDepth': {
    en: 'One line per reporting level: a manager above, the people who report to them on the line below. Pinch, or hold ⌘ and scroll, to zoom; ⌖ stands the whole company in the window.',
    ar: 'صفٌّ لكل مستوى تبعية: المدير في الأعلى، ومن يتبعونه في الصف الذي يليه. اقرص بإصبعين أو استخدم ⌘ مع التمرير للتكبير، و⌖ يضع الشركة كلها داخل النافذة.',
  },
  'chart.hintEdit': {
    en: 'Drag somebody onto their new manager, or press Space to pick up and Space again to drop. A manager brings their whole branch. Pinch or ⌘-scroll to zoom.',
    ar: 'اسحب الشخص إلى مديره الجديد، أو اضغط المسافة لالتقاط البطاقة ثم المسافة لإسقاطها. المدير ينتقل ومعه فرعه كاملًا. اقرص بإصبعين أو استخدم ⌘ مع التمرير للتكبير.',
  },
  'chart.lineInQuestion': { en: 'Line in question', ar: 'خط تبعية محل مراجعة' },
  'chart.loose': { en: 'Reports to nobody', ar: 'لا يتبع أحدًا' },
  'chart.openBranch': {
    en: "Open {name}'s branch ({n} people)",
    ar: 'فتح فرع {name} ({n} أشخاص)',
  },
  'chart.openPanel': { en: 'Open this person’s permissions', ar: 'فتح صلاحيات هذا الشخص' },
  'chart.reportTo': { en: 'report to', ar: 'يتبع' },
  'chart.seat': { en: 'Governance seat', ar: 'مقعد حوكمة' },
  'chart.takesAlong': { en: 'and beneath them', ar: 'ومعه' },
  'chart.tickLabel': { en: 'May open this module', ar: 'يستطيع فتح هذه الوحدة' },
  'common.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'common.loading': { en: 'Loading…', ar: 'جارٍ التحميل…' },
};

/** What the template asks of words: HR's `t` and `pick`, nothing more. */
export interface ChartWords {
  t(key: string): string;
  /** `pick(person, 'full_name')` → `full_name_ar` on an Arabic page when it
   *  is filled, else `full_name_en`, else nothing — HR's `pick`, exactly. */
  pick(obj: object | null | undefined, base: string): string;
  isRtl(): boolean;
}

/** The module's word when it has one, the chart's own otherwise. */
export function chartWordsFor(module: ShellWords | null): ChartWords {
  // No module words: the page's own direction decides, never English by
  // default on an Arabic screen (the date range's rule, HR 28 Sep 2026).
  const isRtl = () =>
    module?.isRtl() ?? (typeof document !== 'undefined' && document.documentElement.dir === 'rtl');
  return {
    isRtl,
    t: (key: string) => {
      // A module's `t` may throw on a key it does not hold; a shared control
      // never trusts it (Royal Me's did, and a notice never rendered).
      let said: string | undefined;
      try {
        said = module?.t(key);
      } catch {
        said = undefined;
      }
      if (said && said !== key) return said;
      return CHART_WORDS[key]?.[isRtl() ? 'ar' : 'en'] ?? key;
    },
    pick: (obj: object | null | undefined, base: string) => {
      if (!obj) return '';
      const row = obj as Record<string, unknown>;
      const ar = row[`${base}_ar`];
      const en = row[`${base}_en`];
      if (isRtl() && typeof ar === 'string' && ar) return ar;
      return typeof en === 'string' ? en : '';
    },
  };
}

/** Where a card's name goes when it is a link. `null` draws plain text. */
export interface CardLink {
  commands: unknown[];
  queryParams?: Record<string, string>;
}

/** HR's own: the person's file, saying the reader came from the chart. The
 *  default so HR's two screens switch to this component by an import alone;
 *  any other module passes its own `cardLink` (or `() => null`). */
export const PERSON_FILE_LINK = (node: ChartNode): CardLink | null => ({
  commands: ['/people', node.id],
  queryParams: { from: 'chart' },
});

/** One tree on the canvas, placed. */
interface Placed extends Plot<ChartNode> {
  key: string;
}

/** How deep the chart stands open the first time: the top, the level under
 *  it, and the heads beneath that, each with their branch folded. */
const OPEN_DEPTH = 2;

/** Somebody holding no band sits below everybody; nobody may be hung on them. */
const NO_BAND = 99999;

/** How far the canvas may be pushed. The floor is low on purpose: a dozen
 *  bands deep and fifty people wide, the whole company does not stand in a
 *  window at half size. */
const MIN_SCALE = 0.12;
const MAX_SCALE = 1.6;

/** Where a card asks to be moved to. `manager: null` means the bench. */
export interface Move {
  person: ChartNode;
  manager: string | null;
}

/**
 * What the HOST wants drawn on one card, beyond what the card itself knows.
 *
 * The canvas knows a person's band, title and reports; it does not know what
 * the screen around it is FOR. The Permissions tab knows who may open a
 * module and whose door was edited, and nothing else should have to.
 */
export interface CardMarks {
  /** `null` draws no tick at all, which is every screen but the tab. */
  tick?: 'on' | 'off' | null;
  /** Drawn, and not pressable: HR's three see who holds the door (A-128). */
  tickDisabled?: boolean;
  /** Not allowed this module — his word was "dims everyone not allowed". */
  dimmed?: boolean;
  /** Changed from their placement's default, so the card says so. */
  edited?: boolean;
}

/** A card with nothing extra asked of it. */
const PLAIN: CardMarks = {};

/**
 * The company on a wall: the canvas, and moving somebody on it.
 *
 * **Extracted from `ChartPage` on 3 October 2026 (O-252 Part 1, step 1)**, so
 * that the Permissions tab draws the SAME chart rather than a second one that
 * drifts from it. The owner asked for "the org chart, each card with a tick",
 * and a tab with its own chart would have been two charts within a month.
 *
 * **It owns the geometry and the gestures; the page owns the data and the
 * write.** `chart` and `departments` come in as inputs, and a move goes out
 * as `moved` for whoever is hosting to perform — the chart page writes it
 * through `book.updatePerson`, and the tab does not move anybody at all.
 *
 * The rows are one per seniority BAND across the whole canvas rather than one
 * per reporting depth, so a Professional stands on the E2 line whoever they
 * report to. The geometry is `layout.ts`.
 *
 * **Nothing about the drawing changed in the extraction.** The 25 specs that
 * drove `ChartPage` through its rendered DOM still drive it unchanged and
 * still pass: they were written against the DOM rather than the instance,
 * which is what made this safe to do at all.
 *
 * **SHARED SINCE 6 OCTOBER 2026 (O-368).** The owner's rule 9 (5 Oct 2026):
 * every module shows HR's org chart "with its specs, but only show the users
 * allowed to this module", and the owner is "Always shown". So it moved from
 * HR to royal-shell with its dependencies turned inside out — words through
 * `SHELL_WORDS` with its own catalogue behind them, its own types, the shared
 * layout — and two inputs added:
 *
 *  - `keep` narrows the chart to a module's people (`narrow.ts`: a hidden
 *    manager's people hang under the nearest shown person above them). A
 *    chart given `keep` is READ-ONLY, whatever `editable` and `decorate` say:
 *    placement is HR's, so outside HR nobody is dragged and nothing is ticked.
 *  - `always` is REQUIRED: the person rule 9 keeps on every chart whatever
 *    `keep` says (the owner). Their card never carries the seat badge — the
 *    owner rule: "his seat, hat or second role is never named".
 */
@Component({
  selector: 'royal-org-chart',
  imports: [RouterLink],
  templateUrl: './org-chart.html',
  // Canvas first, then card: the cascade is the one the single sheet had.
  styleUrls: ['./org-chart.scss', './org-card.scss'],
})
export class OrgChart {
  protected readonly i18n = chartWordsFor(inject(SHELL_WORDS, { optional: true }));

  /** The tree, as whoever is hosting fetched it. */
  readonly chart = input<Chart | null>(null);
  /**
   * Who this module shows (rule 9: those whose door to it is open). Left out,
   * everybody is drawn exactly as fetched — HR's own screens. Given, the
   * chart is narrowed and READ-ONLY: no drag, no re-parent, no tick.
   */
  readonly keep = input<((node: ChartNode) => boolean) | undefined>(undefined);
  /**
   * Who is drawn whatever `keep` says: the owner (rule 9, "Always shown").
   * REQUIRED, so no screen can draw a chart that silently omits him; a
   * screen with nobody to keep passes `() => false` and says so at the call.
   */
  readonly always = input.required<(node: ChartNode) => boolean>();
  /** Where a card's name links to; `null` from it draws plain text. HR's
   *  person file by default (see `PERSON_FILE_LINK`). */
  readonly cardLink = input<(node: ChartNode) => CardLink | null>(PERSON_FILE_LINK);
  /** For the department name on a card; the slug shows until they arrive. */
  readonly departments = input<Department[]>([]);
  /** Whether this reader may move anybody. The HOST decides: the chart page
   *  asks `editChart`, the Permissions tab never allows it. */
  readonly editable = input(false);
  /**
   * What to draw on each card, asked PER CARD at the moment of drawing.
   *
   * A FUNCTION rather than a map keyed by id, because a map would be read
   * once when the host built it and then go stale — the fault already
   * written down as "a value read once at the wrong moment". The host
   * returns a fresh function whenever its own answer changes, so this input
   * changes identity and every card is asked again.
   */
  readonly decorate = input<(node: ChartNode) => CardMarks>(() => PLAIN);
  /** The line above the canvas. The chart page's own hint shows when the
   *  host says nothing, so that page reads exactly as it did. */
  readonly hint = input<string | null>(null);
  /**
   * Whether a card OPENS something when it is pressed twice (O-252 Part 2).
   *
   * The owner: "if i double clicked on any card, it will open beneath the org
   * chart the permissions for this specific user". On a screen that does
   * that, the name must NOT be a link — a single click would navigate away
   * from the panel before the second click arrived — so the name becomes
   * plain text and the card itself is what answers. The chart page leaves
   * this false and keeps its link exactly as it is.
   */
  readonly opens = input(false);
  /**
   * What a row means. `'band'` (the default, and HR's wall chart): one row
   * per seniority band, labelled down the rail. `'depth'`: one row per
   * reporting level in the tree as drawn, with NO rail labels or band lines,
   * for a module that may not hold bands (Royal Me, G-64: "reporting lines
   * only"). Without it a band-less chart folds every card onto one row.
   */
  readonly lanes = input<'band' | 'depth'>('band');

  /** A card asking to be hung somewhere else. The host performs it. */
  readonly moved = output<Move>();
  /** A tick pressed. The HOST performs it and sends the answer back as
   *  `decorate`; this component never decides who holds a door. */
  readonly ticked = output<{ person: ChartNode; on: boolean }>();
  /** A card pressed twice (or Enter on it), when `opens` is set. */
  readonly cardOpen = output<ChartNode>();

  /** The card in hand, from the mouse or the keyboard. */
  protected readonly holding = signal<ChartNode | null>(null);
  /** Whose card the pointer is resting on, for the banner's sentence. */
  protected readonly over = signal<string | null>(null);
  /** Branches folded shut, keyed by the person at their head. */
  protected readonly collapsed = signal<Set<string>>(new Set());
  /** The magnification of the canvas. */
  readonly scale = signal(1);
  readonly minScale = MIN_SCALE;
  readonly maxScale = MAX_SCALE;

  /** What the host's own "may edit" answer comes to here. Kept under the old
   *  name so the template that moved across reads unchanged. */
  protected canEdit(): boolean {
    return this.editable() && !this.readOnly();
  }

  /** A chart narrowed to a module is read-only (rule 9): placement is HR's. */
  protected readonly readOnly = computed(() => this.keep() !== undefined);

  /** What the host wants on this card. Read at USE, never cached here. A
   *  read-only chart draws no tick, whatever the host asks. */
  protected marks(node: ChartNode): CardMarks {
    const asked = this.decorate()(node) ?? PLAIN;
    return this.readOnly() && asked.tick != null ? { ...asked, tick: null } : asked;
  }

  /** The seat badge, never on the always-shown person (the owner rule: his
   *  seat is never named, and rule 9: "nothing marking access or a seat"). */
  protected showsSeat(node: ChartNode): boolean {
    return !!node.hat && !this.always()(node);
  }

  /** Where this card's name links, or null for plain text. */
  protected linkOf(node: ChartNode): CardLink | null {
    return this.cardLink()(node);
  }

  /** The line above the canvas: the host's, or the chart page's own. */
  protected hintLine(): string {
    if (this.hint() !== null) return this.hint()!;
    if (this.canEdit()) return this.i18n.t('chart.hintEdit');
    return this.i18n.t(this.lanes() === 'depth' ? 'chart.hintDepth' : 'chart.hint');
  }

  /** What a screen reader hears on the tick: the person it is about, so a
   *  column of identical boxes is not a column of identical labels. */
  protected tickLabel(node: ChartNode): string {
    return `${this.i18n.t('chart.tickLabel')}: ${this.i18n.pick(node, 'full_name')}`;
  }

  /** What a screen reader hears on a card that opens a panel. */
  protected openLabel(node: ChartNode): string | null {
    if (!this.opens()) return null;
    return `${this.i18n.t('chart.openPanel')}: ${this.i18n.pick(node, 'full_name')}`;
  }

  /** A card asking to open its panel. Refused when the host did not ask for
   *  it, so the event cannot be driven by a stray double-click elsewhere. */
  /** A SINGLE click on a card opens that person's permissions (the owner,
   *  5 Oct 2026, verbatim: "ticking only opens, but clicking on the card it
   *  self opens the permissions"). It was a double-click until then.
   *
   *  The tick box is not this: its `<label>` stops the click, so pressing the
   *  box never also opens the panel. And a DRAG is not a click — releasing
   *  after the chart has been panned must not open anything, or every pan
   *  that happens to end over a card opens a panel nobody asked for. */
  protected openCard(node: ChartNode, event: Event): void {
    if (!this.opens()) return;
    if (this.panned) return;
    event.preventDefault();
    event.stopPropagation();
    this.cardOpen.emit(node);
  }

  /** SPACE TOGGLES THE BOX where a card has one (the owner, 5 Oct 2026); it
   *  keeps its old job of picking a card up only where there is no box to
   *  press, so keyboard re-parenting is not lost on the chart screen. */
  protected spaceOnCard(node: ChartNode, event: Event): void {
    const marks = this.marks(node);
    if (marks.tick != null) {
      event.preventDefault();
      if (marks.tickDisabled) return;
      // No checkbox element to put back here: the host's answer redraws it,
      // which is the same contract `pressTick` relies on.
      this.ticked.emit({ person: node, on: marks.tick !== 'on' });
      return;
    }
    this.pick(node, event);
  }

  /** A tick pressed on a card. Asked of `marks` again rather than trusting
   *  the checkbox's own state, so a disabled tick cannot be driven by a
   *  synthesised event. */
  protected pressTick(node: ChartNode, event: Event): void {
    event.stopPropagation();
    const marks = this.marks(node);
    const asked = marks.tick !== 'on';

    // THE BOX IS PUT BACK, ALWAYS, AND BEFORE ANYTHING IS ASKED.
    //
    // A native checkbox flips its own `checked` before this handler runs,
    // and Angular writes `[checked]` only when the BOUND value changes —
    // so a tick the host refuses leaves the box showing a door nobody
    // opened, and leaves it showing it until something else happens to
    // change the binding. (Caught by the spec written for exactly that,
    // which failed on the first run.) Putting it back here makes the box a
    // function of the host's answer and nothing else: a granted door comes
    // back as a changed `decorate`, which Angular does write.
    const box = event.target as HTMLInputElement | null;
    if (box) box.checked = marks.tick === 'on';

    if (marks.tick == null || marks.tickDisabled) return;
    this.ticked.emit({ person: node, on: asked });
  }

  constructor() {
    // THE FIRST FOLD, which used to sit in the page's `load()` beside the
    // fetch and had to come with the folding rather than with the data. A
    // hundred people open at once are a strip too wide to read (21 Sep
    // 2026), so the company opens three levels deep with every branch below
    // folded.
    //
    // Once only: `seen` guards it, because re-folding after every refresh
    // would shut a branch the reader had just opened — which is what the
    // page's `if (!this.chart())` guard was doing, and is the half that is
    // easy to drop when moving a line of code between two places.
    effect(() => {
      // The NARROWED tree, so a module's chart folds at its own third level
      // rather than at a level of people it does not draw.
      const drawn = this.drawn();
      if (!drawn || this.folded) return;
      this.folded = true;
      this.collapsed.set(new Set(this.headsBelow(drawn.tree, OPEN_DEPTH)));
    });

    // The canvas is drawn only once the chart has arrived, so the listeners
    // are bound when the element appears rather than at first render — an
    // `afterNextRender` here ran while the screen still said "Loading…" and
    // bound nothing at all, which is why pinch did nothing (9 Sep 2026).
    //
    // THE SAME FAULT CAME BACK ON 3 OCT 2026, in the extraction, and only a
    // browser found it. Moving the "Loading…" line out of the page left the
    // `.canvaswrap` rendered from the FIRST frame, so `wrap()` resolved
    // while the canvas was empty, `fitted` was set, and `fitCenter` measured
    // nothing — the chart stood at 100% instead of standing in the window.
    // Every one of the 25 specs passed: jsdom does no layout, so `fitCenter`
    // returns early there whatever it is given. The template guards the
    // canvas again.
    effect((onCleanup) => {
      const el = this.wrap()?.nativeElement;
      if (!el) return;
      el.addEventListener('wheel', this.wheelZoom, { passive: false });
      el.addEventListener('pointerdown', this.pointerDown);
      el.addEventListener('pointermove', this.pointerMove, { passive: false });
      el.addEventListener('pointerup', this.pointerUp);
      el.addEventListener('pointercancel', this.pointerUp);
      // Panning. AFTER the pinch listeners on purpose: `pointerDown` records
      // the touch first, so `panDown` can see two fingers and stand aside.
      el.addEventListener('pointerdown', this.panDown);
      el.addEventListener('pointermove', this.panMove);
      el.addEventListener('pointerup', this.panUp);
      el.addEventListener('pointercancel', this.panUp);
      // A pointer leaving the window mid-drag must end the pan, or the chart
      // keeps following a hand that is no longer pressing.
      el.addEventListener('pointerleave', this.panUp);
      // Safari's own pinch, which arrives as a gesture rather than a wheel.
      el.addEventListener('gesturestart', this.gestureStart as EventListener);
      el.addEventListener('gesturechange', this.gestureChange as EventListener);
      // The whole company at once, the first time it is drawn.
      if (!this.fitted) {
        this.fitted = true;
        this.fitCenter(el);
      }
      onCleanup(() => {
        el.removeEventListener('wheel', this.wheelZoom);
        el.removeEventListener('pointerdown', this.pointerDown);
        el.removeEventListener('pointermove', this.pointerMove);
        el.removeEventListener('pointerup', this.pointerUp);
        el.removeEventListener('pointercancel', this.pointerUp);
        el.removeEventListener('pointerdown', this.panDown);
        el.removeEventListener('pointermove', this.panMove);
        el.removeEventListener('pointerup', this.panUp);
        el.removeEventListener('pointercancel', this.panUp);
        el.removeEventListener('pointerleave', this.panUp);
        el.removeEventListener('gesturestart', this.gestureStart as EventListener);
        el.removeEventListener('gesturechange', this.gestureChange as EventListener);
      });
    });
  }

  /** Everybody at `depth` or deeper who carries somebody. */
  private headsBelow(roots: ChartNode[], depth: number): string[] {
    const out: string[] = [];
    const walk = (node: ChartNode, level: number) => {
      if (!node.reports.length) return;
      if (level >= depth) out.push(node.id);
      for (const child of node.reports) walk(child, level + 1);
    };
    for (const root of roots) walk(root, 0);
    return out;
  }

  /* ── what is drawn ───────────────────────────────────────────────────────── */

  /**
   * The chart as this screen draws it. Without `keep` it is the input itself,
   * untouched — the same objects come back on every output, as they did in
   * HR. With `keep` it is `narrow()`ed, the bench as well as the trees: a
   * hidden person's reports hang under the nearest shown person above them
   * (or stand at the top, or on the bench, where nobody above is shown), and
   * the `always` person is kept whatever `keep` says.
   */
  protected readonly drawn = computed<Chart | null>(() => {
    const chart = this.chart();
    const keep = this.keep();
    if (!chart || !keep) return chart;
    const options = { always: this.always() };
    return {
      ...chart,
      tree: narrow(chart.tree, keep, options),
      reports_to_nobody: narrow(chart.reports_to_nobody, keep, options),
    };
  });

  protected readonly roots = computed<ChartNode[]>(() => this.drawn()?.tree ?? []);
  protected readonly bench = computed<ChartNode[]>(() => this.drawn()?.reports_to_nobody ?? []);

  /** Everybody on the chart, by id — for the loop check and the banner. */
  private readonly index = computed<Map<string, { node: ChartNode; manager: string | null }>>(
    () => {
      const map = new Map<string, { node: ChartNode; manager: string | null }>();
      const walk = (node: ChartNode, manager: string | null) => {
        map.set(node.id, { node, manager });
        for (const child of node.reports) walk(child, node.id);
      };
      for (const root of this.roots()) walk(root, null);
      for (const node of this.bench()) walk(node, null);
      return map;
    },
  );

  /** The people under a card that the chart draws: none while the branch is
   *  folded — unless somebody is in hand, when everything unfolds, because a
   *  hidden card cannot receive. */
  private visibleReports(node: ChartNode): ChartNode[] {
    if (this.holding() !== null || !this.collapsed().has(node.id)) return node.reports;
    return [];
  }

  private static rankOf(node: ChartNode): number {
    return node.rank ?? NO_BAND;
  }

  /** The row a card stands on: its band, ordered by rank, read `E2 · Professional`. */
  private static bandOf(node: ChartNode): Band {
    if (!node.band) return { key: 'none', rank: NO_BAND, label_en: '—', label_ar: '' };
    return {
      key: node.band,
      rank: OrgChart.rankOf(node),
      label_en: `${node.band} · ${node.band_name_en}`,
      label_ar: node.band_name_ar ? `${node.band} · ${node.band_name_ar}` : '',
    };
  }

  /** The rows: every band anybody on the canvas holds, most senior first.
   *  Shared by every tree, so two Sales Agents in different branches stand
   *  on one line whoever they report to. */
  protected readonly bands = computed<Band[]>(() =>
    this.lanes() === 'depth'
      ? []
      : bandsOf(this.roots(), (n) => this.visibleReports(n), OrgChart.bandOf),
  );

  /** Under `'depth'`: each drawn person's reporting level, heads at 0. */
  private readonly depths = computed<Map<string, number>>(() => {
    const at = new Map<string, number>();
    if (this.lanes() !== 'depth') return at;
    const walk = (n: ChartNode, d: number) => {
      at.set(n.id, d);
      for (const k of this.visibleReports(n)) walk(k, d + 1);
    };
    for (const r of this.roots()) walk(r, 0);
    return at;
  });

  /** How many rows the canvas stands on, whichever `lanes` says. */
  private rowCount(): number {
    if (this.lanes() !== 'depth') return this.bands().length;
    let deepest = -1;
    for (const d of this.depths().values()) deepest = Math.max(deepest, d);
    return deepest + 1;
  }

  /** Every tree on the canvas, placed. */
  protected readonly plots = computed<Placed[]>(() => {
    const rows = this.bands().map((b) => b.key);
    const depths = this.depths();
    const band =
      this.lanes() === 'depth'
        ? (n: ChartNode) => depths.get(n.id) ?? 0
        : (n: ChartNode) => Math.max(0, rows.indexOf(OrgChart.bandOf(n).key));
    return this.roots().map((root) => ({
      key: root.id,
      ...layoutTree(root, (n) => this.visibleReports(n), band),
    }));
  });

  /** How tall the rail beside the bands has to be. */
  protected railHeight(): number {
    return Math.max(0, (this.rowCount() - 1) * ROW_H + CARD_H);
  }

  /** Where a band's guide line runs: through the middle of its cards. */
  protected bandLine(index: number): number {
    return index * ROW_H + CARD_H / 2;
  }

  protected elbow(link: Link): string {
    return elbow(link);
  }

  protected isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  /** What the pill does, said with whose branch and how many are in it. */
  protected foldLabel(node: ChartNode): string {
    const key = this.isCollapsed(node.id) ? 'chart.openBranch' : 'chart.foldBranch';
    return this.i18n
      .t(key)
      .replace('{name}', this.i18n.pick(node, 'full_name'))
      .replace('{n}', String(this.branchSize(node)));
  }

  /** Every branch shut, or every branch open. Fifty people on fourteen
   *  bands is a wall; folded to the managers it is a page. */
  /** Public: the host's masthead drives this through a template ref. */
  allFolded(): boolean {
    const heads = this.headsWithReports();
    return heads.length > 0 && heads.every((id) => this.collapsed().has(id));
  }

  /** Public: the host's masthead drives this through a template ref. */
  foldAll(): void {
    this.collapsed.set(this.allFolded() ? new Set() : new Set(this.headsWithReports()));
  }

  /** Everybody who carries somebody, at any depth. */
  private headsWithReports(): string[] {
    const out: string[] = [];
    const walk = (node: ChartNode) => {
      if (node.reports.length) {
        out.push(node.id);
        for (const child of node.reports) walk(child);
      }
    };
    for (const root of this.roots()) walk(root);
    return out;
  }

  protected toggleCollapse(node: ChartNode, event: Event): void {
    event.stopPropagation();
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  }

  /** The colour a card wears: its band's, out of the one table of band
   *  colours in `styles.scss`. The class only names the colour; what the
   *  card does with it — a stripe and a wash — is `chart.scss`. */
  protected bandClass(node: ChartNode | string | null): string {
    return bandClass(typeof node === 'string' || node === null ? node : node.band);
  }

  /** The department's name in the reader's language; the slug if it is not
   *  loaded yet, which is better than an empty line. */
  protected departmentName(slug: string): string {
    const found = this.departments().find((d) => d.slug === slug);
    return found ? this.i18n.pick(found, 'name') : NOTHING;
  }

  /** How many people travel with this card. Said before the drop, because
   *  moving a manager moves their whole branch. */
  protected branchSize(node: ChartNode): number {
    let count = 0;
    const walk = (n: ChartNode) => {
      for (const child of n.reports) {
        count += 1;
        walk(child);
      }
    };
    walk(node);
    return count;
  }

  protected overPerson(): ChartNode | null {
    const id = this.over();
    return id ? (this.index().get(id)?.node ?? null) : null;
  }

  /* ── panning, and the wheel belonging to the PAGE ───────────────────────── */

  /**
   * THE WHEEL SCROLLS THE PAGE; THE CHART MOVES BY DRAGGING (the owner,
   * 5 Oct 2026, verbatim: "when i try to scroll in the org chart it scrolls
   * the org chart itself not the page, make scrolling the org chart only but
   * clicking and dragging, the scroll from mouse or trackpad is only for the
   * page not the org chart"), and he confirmed it is "for both org chart
   * wether in permissions or org chart" — so it lives HERE, in the one
   * component both screens draw, and not twice.
   *
   * **No JavaScript was taking the wheel.** `wheelZoom` only ever acted on
   * ctrl/⌘ + wheel (a trackpad pinch). The plain wheel scrolled the chart
   * because the frame was `overflow: auto` with `overscroll-behavior:
   * contain`, which is the CSS for "this element eats the scroll and passes
   * none on". The frame is now `overflow: hidden`: the browser gives the
   * wheel to the page, and `scrollLeft` / `scrollTop` still MOVE
   * programmatically, which is how both `fit()` and this panning work. No
   * transform maths, and the pinch is untouched.
   */

  /** Where a pan began: the pointer, and the frame's scroll at that moment. */
  private panFrom: { x: number; y: number; left: number; top: number; id: number } | null = null;
  /** The pointer travelled far enough that this was a DRAG, not a click. Read
   *  by `openCard`, and cleared on the next press rather than on release —
   *  the click arrives AFTER pointerup, so clearing it there would be too
   *  early and every pan ending on a card would open a panel. */
  private panned = false;
  /** Below this, a press with a shake in it is still a click. */
  private static readonly DRAG_SLOP = 4;

  private readonly panDown = (event: PointerEvent): void => {
    this.panned = false;
    // THE PAN STARTS ONLY FROM EMPTY SPACE (the owner, 5 Oct 2026, asked
    // about the collision with the chart's existing drag, verbatim:
    // "scrolling the org chart is dragging in empty space, dragging a card
    // moves the card").
    //
    // So a card is never a pan handle -- not even one this reader may not
    // move. Dragging such a card does NOTHING, which is his literal rule and
    // the better one: a gesture that pans on some cards and re-parents on
    // others would mean two things depending on a permission the person
    // cannot see. I had built it the other way and he overruled it.
    const el = event.target as HTMLElement | null;
    if (el?.closest('.ocard')) return;
    // Two fingers are a pinch, which `pointerDown` already follows.
    if (event.pointerType === 'touch' && this.touches.size >= 2) return;
    const wrap = this.wrap()?.nativeElement;
    if (!wrap) return;
    this.panFrom = {
      x: event.clientX,
      y: event.clientY,
      left: wrap.scrollLeft,
      top: wrap.scrollTop,
      id: event.pointerId,
    };
  };

  private readonly panMove = (event: PointerEvent): void => {
    const from = this.panFrom;
    if (!from || from.id !== event.pointerId) return;
    if (event.pointerType === 'touch' && this.touches.size >= 2) {
      this.panFrom = null;
      return;
    }
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (!this.panned && Math.hypot(dx, dy) < OrgChart.DRAG_SLOP) return;
    this.panned = true;
    const wrap = this.wrap()?.nativeElement;
    if (!wrap) return;
    // The chart follows the hand: dragging left shows what is to the right.
    // Deliberately NOT mirrored under RTL — `scrollLeft` is already signed
    // the other way in a right-to-left frame, so subtracting the delta moves
    // the content with the pointer in both directions.
    wrap.scrollLeft = from.left - dx;
    wrap.scrollTop = from.top - dy;
  };

  private readonly panUp = (event: PointerEvent): void => {
    if (this.panFrom?.id === event.pointerId) this.panFrom = null;
  };

  /* ── zooming ─────────────────────────────────────────────────────────────── */

  private readonly wrap = viewChild<ElementRef<HTMLElement>>('wrap');
  /** The chart is stood in the window once, when it first arrives. */
  private fitted = false;
  /** The first fold happens once, not on every refresh. */
  private folded = false;

  private setScale(value: number): void {
    this.scale.set(+Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)).toFixed(3));
  }

  /** Public: the host's masthead drives this through a template ref. */
  zoom(step: number): void {
    this.setScale(this.scale() + step);
  }

  /** A pinch on a trackpad reaches the page as ctrl + wheel; ⌘ + wheel does
   *  the same for a mouse. Bound by hand so the plain scroll stays passive
   *  and only this case may preventDefault. */
  private readonly wheelZoom = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.setScale(this.scale() - event.deltaY * 0.0015 * this.scale());
  };

  /* A pinch with two fingers on a screen. The pointers are followed here
     rather than left to the browser, whose own pinch would zoom the page
     and not the chart. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch: { gap: number; scale: number } | null = null;

  private gap(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touches.size === 2) this.pinch = { gap: this.gap(), scale: this.scale() };
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.touches.has(event.pointerId)) return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const from = this.pinch;
    if (!from || this.touches.size !== 2 || from.gap <= 0) return;
    event.preventDefault();
    this.setScale(from.scale * (this.gap() / from.gap));
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId);
    if (this.touches.size < 2) this.pinch = null;
  };

  private gestureScale = 1;
  private readonly gestureStart = (event: Event): void => {
    event.preventDefault();
    this.gestureScale = this.scale();
  };
  private readonly gestureChange = (event: Event): void => {
    event.preventDefault();
    const factor = (event as Event & { scale?: number }).scale ?? 1;
    this.setScale(this.gestureScale * factor);
  };

  /** One press: stand the whole chart in the window, wide and tall, and
   *  centre it. */
  protected fitCenter(wrap: HTMLElement): void {
    const scale = this.scale();
    const wide = wrap.scrollWidth / scale;
    const tall = wrap.scrollHeight / scale;
    if (wide <= 0 || tall <= 0 || wrap.clientWidth <= 0 || wrap.clientHeight <= 0) return;
    this.setScale(
      Math.min((wrap.clientWidth - 24) / wide, (wrap.clientHeight - 24) / tall, MAX_SCALE),
    );
    requestAnimationFrame(() => {
      wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
      wrap.scrollTop = 0;
    });
  }

  /* ── moving somebody ─────────────────────────────────────────────────────── */

  /** The seniority law, client-side: a card may only land on a strictly more
   *  senior band (a lower rank). The server enforces the same rule; this
   *  fades the illegal targets before the drop instead of refusing after it. */
  private outranks(manager: ChartNode, person: ChartNode): boolean {
    return OrgChart.rankOf(manager) < OrgChart.rankOf(person);
  }

  /** Nobody may be dropped onto their own report: that makes a loop. */
  private descends(candidate: ChartNode, of: ChartNode): boolean {
    const index = this.index();
    let cursor: string | null | undefined = candidate.id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const entry = index.get(cursor);
      if (entry?.manager === of.id) return true;
      cursor = entry?.manager ?? null;
    }
    return false;
  }

  protected canDrop(target: ChartNode): boolean {
    const held = this.holding();
    if (!held || held.id === target.id) return false;
    if (!this.outranks(target, held)) return false;
    return !this.descends(target, held);
  }

  protected dragStart(node: ChartNode): void {
    if (!this.canEdit()) return;
    this.holding.set(node);
  }

  protected dragEnd(): void {
    this.holding.set(null);
    this.over.set(null);
  }

  protected dragOver(target: ChartNode, event: DragEvent): void {
    if (!this.canDrop(target)) return;
    event.preventDefault();
    this.over.set(target.id);
  }

  protected dragLeave(target: ChartNode): void {
    if (this.over() === target.id) this.over.set(null);
  }

  protected drop(target: ChartNode, event: DragEvent): void {
    event.preventDefault();
    // The bench behind a card takes drops too; a drop that landed ON
    // somebody must never bubble and mean both.
    event.stopPropagation();
    const held = this.holding();
    this.over.set(null);
    if (!held || !this.canDrop(target)) return;
    this.holding.set(null);
    this.ask(held, target.id);
  }

  protected allowDetach(event: DragEvent): void {
    if (this.holding()) event.preventDefault();
  }

  /** Dropped on the bench, or the detach pad pressed: reports to nobody. */
  protected detach(event?: DragEvent): void {
    event?.preventDefault();
    const held = this.holding();
    this.over.set(null);
    if (!held) return;
    this.holding.set(null);
    if (this.index().get(held.id)?.manager) this.ask(held, null);
  }

  /** What a card is, and what Space will do to it, for a reader who cannot
   *  see the hand: a focusable box with a key handler and no name was a
   *  mystery to a screen reader (audit 5, 02 §19). */
  protected cardLabel(node: ChartNode): string {
    const name = this.i18n.pick(node, 'full_name');
    const held = this.holding();
    if (!held) return this.i18n.t('chart.cardPick').replace('{name}', name);
    if (held.id === node.id) return this.i18n.t('chart.cardPutDown').replace('{name}', name);
    return this.i18n
      .t(this.canDrop(node) ? 'chart.cardDrop' : 'chart.cardNoDrop')
      .replace('{name}', name)
      .replace('{held}', this.i18n.pick(held, 'full_name'));
  }

  /** Space picks a card up; space on another card drops it there. The same
   *  two calls the mouse makes, reachable without one. */
  protected pick(node: ChartNode, event: Event): void {
    if (!this.canEdit()) return;
    event.preventDefault();
    const held = this.holding();
    if (!held) {
      this.holding.set(node);
      return;
    }
    if (held.id === node.id) {
      this.holding.set(null);
      return;
    }
    if (!this.canDrop(node)) return;
    this.holding.set(null);
    this.ask(held, node.id);
  }

  protected release(): void {
    this.holding.set(null);
    this.over.set(null);
  }

  /** The one write this canvas does NOT make: it asks, and the host writes.
   *  That is the whole of the extraction — the chart page sends it to
   *  `book.updatePerson`, and the Permissions tab never calls this at all
   *  because it passes `editable` false. */
  private ask(person: ChartNode, manager: string | null): void {
    this.moved.emit({ person, manager });
  }
}

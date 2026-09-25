import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { monthEndOf, shiftIsoDate, todayInCairo } from '../dates/dates';
import { Icon } from '../icons/icons';
import { SHELL_WORDS, ShellWords } from '../words';

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface Cell {
  iso: string;
  day: number;
  outside: boolean;
}

/**
 * The control's own words, the CRM's own, in both languages.
 *
 * A module that passes its words through `SHELL_WORDS` is asked first, and a
 * key it does not know falls back to these — so a module with no `cal.*` keys
 * of its own still reads correctly in Arabic. The digits are Western, as the
 * CRM writes every number (`NUMBER_LOCALE` in its i18n service); its own
 * catalogue still had "آخر ٧ أيام" here, which was the one place it broke its
 * own rule.
 */
export const CAL: Record<string, { en: string; ar: string }> = {
  'cal.startDate': { en: 'Start Date', ar: 'تاريخ البداية' },
  'cal.endDate': { en: 'End Date', ar: 'تاريخ النهاية' },
  'cal.pickFrom': { en: 'Pick the start', ar: 'اختر البداية' },
  'cal.pickTo': { en: 'Pick the end', ar: 'اختر النهاية' },
  'cal.close': { en: 'Close', ar: 'إغلاق' },
  'cal.clear': { en: 'Clear', ar: 'مسح' },
  'cal.done': { en: 'Done', ar: 'تم' },
  'cal.month': { en: 'Month', ar: 'الشهر' },
  'cal.year': { en: 'Year', ar: 'السنة' },
  'cal.prevMonth': { en: 'Previous month', ar: 'الشهر السابق' },
  'cal.nextMonth': { en: 'Next month', ar: 'الشهر التالي' },
  'cal.today': { en: 'Today', ar: 'اليوم' },
  'cal.last7': { en: 'Last 7 days', ar: 'آخر 7 أيام' },
  'cal.last30': { en: 'Last 30 days', ar: 'آخر 30 يومًا' },
  'cal.thisMonth': { en: 'This month', ar: 'هذا الشهر' },
  'cal.lastMonth': { en: 'Last month', ar: 'الشهر الماضي' },
  'cal.thisYear': { en: 'This year', ar: 'هذه السنة' },
  'cal.all': { en: 'All time', ar: 'كل الفترات' },
};

/** The module's word when it has one, the control's own otherwise. */
function wordsFor(module: ShellWords | null): ShellWords {
  const isRtl = () => module?.isRtl() ?? false;
  return {
    isRtl,
    t: (key: string) => {
      const said = module?.t(key);
      if (said && said !== key) return said;
      return CAL[key]?.[isRtl() ? 'ar' : 'en'] ?? key;
    },
  };
}

/** The presets, in the prototype's own order. */
const PRESETS = ['today', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear', 'all'] as const;

type Preset = (typeof PRESETS)[number];

/**
 * One date control for every Royal module — the CRM's, shared from
 * `royal-shell` since 25 Sep 2026 so there is one original and no copies.
 *
 * The prototype's note on this is worth keeping: *the same calendar the leads
 * list and the dashboard use — one date control in the whole app, not a native
 * picker here and a designed one there.* A native `<input type="date">` renders
 * differently in every browser, has no presets, cannot show a range, and reads
 * the wrong way round in Arabic. This is the prototype's own calendar instead:
 * two ends that open the same panel, seven presets, month and year dropdowns,
 * and the selected range shaded across the grid.
 *
 * It emits a `{from, to}` pair of ISO dates and holds no state of its own
 * beyond which end you are picking — the page owns the range and mirrors it
 * into the URL.
 */
@Component({
  selector: 'app-date-range',
  imports: [Icon],
  templateUrl: './date-range.html',
  styleUrl: './date-range.scss',
})
export class DateRangeControl {
  protected readonly i18n = wordsFor(inject(SHELL_WORDS, { optional: true }));

  readonly range = input.required<DateRange>();
  readonly changed = output<DateRange>();

  protected readonly open = signal(false);
  protected readonly picking = signal<'from' | 'to'>('from');
  protected readonly month = signal(Number(todayInCairo().slice(5, 7)) - 1);
  protected readonly year = signal(Number(todayInCairo().slice(0, 4)));

  protected readonly presets = PRESETS;
  /** From the year the legacy data starts to a year past today's — not a
   *  list that runs out in 2027. */
  protected readonly years = computed(() => {
    const last = Number(this.today().slice(0, 4)) + 1;
    return Array.from({ length: last - 2016 + 1 }, (_, i) => 2016 + i);
  });

  protected readonly monthNames = computed(() =>
    Array.from({ length: 12 }, (_, i) =>
      new Date(2000, i, 1).toLocaleDateString(this.locale(), { month: 'long' }),
    ),
  );

  /** Sunday first, as the working week here starts on Sunday. */
  protected readonly dayNames = computed(() =>
    Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(this.locale(), {
        weekday: 'short',
      }),
    ),
  );

  private locale(): string {
    // `-u-nu-latn`: Arabic month and weekday names with Western day numbers,
    // as every other figure on a Royal screen is written.
    return this.i18n.isRtl() ? 'ar-EG-u-nu-latn' : 'en-GB';
  }

  /** Cairo's today, not the browser's and never UTC's: the API reads every
   *  date in Cairo, and after midnight there the UTC date is still yesterday.
   *  Re-read each time the panel opens, so a tab left open across midnight
   *  does not refuse the new day. */
  protected readonly today = signal(todayInCairo());

  protected readonly isSet = computed(() => !!(this.range().from || this.range().to));

  /**
   * Six weeks of cells, with the days either side of the month shown greyed.
   *
   * Built in UTC throughout. A calendar built in local time silently shifts a
   * day either side of a daylight-saving boundary, which is the classic
   * off-by-one in a date picker.
   */
  protected readonly cells = computed<Cell[]>(() => {
    const year = this.year();
    const month = this.month();
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysThis = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daysPrev = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const out: Cell[] = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      const day = daysPrev - i;
      out.push({ day, outside: true, iso: this.iso(year, month - 1, day) });
    }
    for (let day = 1; day <= daysThis; day++) {
      out.push({ day, outside: false, iso: this.iso(year, month, day) });
    }
    let next = 1;
    while (out.length % 7 !== 0) {
      out.push({ day: next, outside: true, iso: this.iso(year, month + 1, next) });
      next++;
    }
    return out;
  });

  private iso(year: number, month: number, day: number): string {
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  }

  protected openAt(end: 'from' | 'to'): void {
    this.today.set(todayInCairo());
    this.picking.set(end);
    const anchor = end === 'from' ? this.range().from : this.range().to;
    if (anchor && anchor !== 'all') {
      const date = new Date(anchor + 'T00:00:00Z');
      this.month.set(date.getUTCMonth());
      this.year.set(date.getUTCFullYear());
    }
    this.open.set(true);
    // Focus into the panel, so Escape reaches it and a screen reader is told
    // the sheet opened. `afterNextRender` would need an injection context
    // here; a frame is enough and matches what the rest of the app does.
    this.openedFrom = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => this.cal()?.nativeElement.focus());
  }

  /** The pill that opened the panel — focus goes back to it on close. */
  private openedFrom: HTMLElement | null = null;
  private readonly cal = viewChild<ElementRef<HTMLElement>>('cal');

  /** The pill's face: day first, the way the owner reads a date. */
  protected shown(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }

  protected close(): void {
    this.open.set(false);
    // Focus returned nowhere before this, so Escape or the X left the reader
    // on <body> at the top of the page (audit 4, F4-26).
    const opener = this.openedFrom;
    this.openedFrom = null;
    if (opener?.isConnected) opener.focus();
  }

  protected step(direction: number): void {
    let month = this.month() + direction;
    if (month < 0) {
      month = 11;
      this.year.update((y) => y - 1);
    } else if (month > 11) {
      month = 0;
      this.year.update((y) => y + 1);
    }
    this.month.set(month);
  }

  protected inRange(cell: Cell): boolean {
    const { from, to } = this.range();
    return !!(from && to && cell.iso >= from && cell.iso <= to && !this.isEdge(cell));
  }

  protected isEdge(cell: Cell): boolean {
    const { from, to } = this.range();
    return cell.iso === from || cell.iso === to;
  }

  /** Picking an end that would invert the range drags the other end with it. */
  protected pick(cell: Cell): void {
    let current = this.range();
    // Picking any real date leaves all-time behind.
    if (current.from === 'all') current = { from: null, to: current.to };
    if (this.picking() === 'from') {
      const to = current.to && current.to < cell.iso ? cell.iso : current.to;
      this.emit({ from: cell.iso, to });
    } else {
      const from = current.from && current.from > cell.iso ? cell.iso : current.from;
      this.emit({ from, to: cell.iso });
    }
    this.close();
  }

  protected applyPreset(preset: Preset): void {
    this.emit(this.rangeFor(preset));
    this.close();
  }

  protected clear(): void {
    this.emit({ from: null, to: null });
    this.close();
  }

  /** Every preset is worked out on Cairo's calendar from Cairo's today. The
   *  old presets mixed UTC months with local days, so for the first hours of
   *  the 1st "This month" chose last month and "Last month" the one before. */
  private rangeFor(preset: Preset): DateRange {
    const today = todayInCairo();
    this.today.set(today);
    const monthStart = today.slice(0, 8) + '01';

    switch (preset) {
      case 'today':
        return { from: today, to: today };
      case 'last7':
        return { from: shiftIsoDate(today, -6), to: today };
      case 'last30':
        return { from: shiftIsoDate(today, -29), to: today };
      case 'thisMonth':
        return { from: monthStart, to: today };
      case 'lastMonth': {
        const lastMonthEnd = shiftIsoDate(monthStart, -1);
        return { from: lastMonthEnd.slice(0, 8) + '01', to: monthEndOf(lastMonthEnd) };
      }
      case 'thisYear':
        return { from: today.slice(0, 4) + '-01-01', to: today };
      case 'all':
        // The one non-date value: clearing the range instead just falls back
        // to the server's this-month default, which is why "All time" used
        // to do nothing. The word travels to the API as date_from=all.
        return { from: 'all', to: null };
    }
  }

  protected isAllTime(): boolean {
    return this.range().from === 'all';
  }

  /** No filter reaches past the day you are standing on — the owner's rule:
   *  tomorrow has no data, so offering it only manufactures empty screens. */
  protected isFuture(cell: Cell): boolean {
    return cell.iso > this.today();
  }

  private emit(range: DateRange): void {
    const today = this.today();
    if (range.from && range.from !== 'all' && range.from > today) {
      range = { ...range, from: today };
    }
    if (range.to && range.to > today) range = { ...range, to: today };
    this.changed.emit(range);
  }
}

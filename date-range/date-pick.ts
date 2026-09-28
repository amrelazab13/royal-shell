import {
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { todayInCairo } from '../dates/dates';
import { Icon } from '../icons/icons';
import { SHELL_WORDS } from '../words';
import { CAL, wordsFor } from './date-range';

interface Cell {
  iso: string;
  day: number;
  outside: boolean;
}

/** The single-date control's own words, beside the range control's. */
export const PICK: Record<string, { en: string; ar: string }> = {
  'cal.pickDate': { en: 'Pick a date', ar: 'اختر تاريخًا' },
  'cal.pickDateTime': { en: 'Pick a date and time', ar: 'اختر التاريخ والوقت' },
  'cal.pickTime': { en: 'Pick a time', ar: 'اختر وقتًا' },
  'cal.pickMonth': { en: 'Pick a month', ar: 'اختر شهرًا' },
  'cal.prevYear': { en: 'Previous year', ar: 'السنة السابقة' },
  'cal.nextYear': { en: 'Next year', ar: 'السنة التالية' },
  'cal.noDate': { en: 'No date', ar: 'بلا تاريخ' },
  'cal.noTime': { en: 'No time', ar: 'بلا وقت' },
  'cal.hour': { en: 'Hour', ar: 'الساعة' },
  'cal.minute': { en: 'Minute', ar: 'الدقيقة' },
  'cal.now': { en: 'Now', ar: 'الآن' },
};

/** Where the panel opens: 'auto' is the web's (anchored, a centred sheet under
 *  820px); 'sheet' is the phone's bottom sheet, matching its .m-sheet. */
export type PanelFrame = 'auto' | 'sheet';

/** Two digits, the way a clock reads. */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Cairo's clock now, as HH:MM (never the browser's zone). */
export function nowInCairo(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/**
 * One date, in the same control as a range (bible §8 C-5, decided 28 Sep 2026).
 *
 * The owner, on HR's attendance screen: "fields not consistent in design with
 * our design bible". Single dates in forms had been native `<input
 * type="date">` in HR and the CRM alike: a picker that looks different in every
 * browser, writes the date month-first on some of them and reads the wrong way
 * round in Arabic. This is the range control's panel with one end: the same
 * pill, the same month grid, day first on the face, Cairo's today.
 *
 * Unlike a filter, a form date may lie in the future (a holiday next year, a
 * leave that starts next week), so nothing is refused by default; `min` and
 * `max` fence it where a form needs a fence.
 *
 * Wire the module's words (`provideShellWords(I18nService)`): without them the
 * control reads the page's `dir`, which is only right by accident in an app
 * that picks its language itself (Mobile CRM, 28 Sep 2026). Nothing fails when
 * it is missing; it quietly reads the wrong thing.
 *
 * Converting a native field: a component emits no native `(change)` and has no
 * `$event.target.value`. Bind `(valueChange)` or a form control instead, or
 * whatever listened to the old field silently stops hearing it.
 *
 * Use it either way:
 *   <app-date-pick [(value)]="startsOn" />
 *   <app-date-pick formControlName="startsOn" />
 * The value is an ISO date (`2026-10-06`) or null. Nothing else ever leaves it.
 */
@Component({
  selector: 'app-date-pick',
  imports: [Icon],
  templateUrl: './date-pick.html',
  styleUrl: './date-range.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickControl), multi: true },
  ],
})
export class DatePickControl implements ControlValueAccessor {
  protected readonly i18n = (() => {
    const base = wordsFor(inject(SHELL_WORDS, { optional: true }));
    return {
      isRtl: base.isRtl,
      t: (key: string) => {
        const said = base.t(key);
        if (said !== key) return said;
        return PICK[key]?.[base.isRtl() ? 'ar' : 'en'] ?? CAL[key]?.en ?? key;
      },
    };
  })();

  readonly value = model<string | null>(null);
  /** The earliest date that may be picked, ISO; null for none. */
  readonly min = input<string | null>(null);
  /** The latest date that may be picked, ISO; null for none. */
  readonly max = input<string | null>(null);
  /** What the empty pill says; the control's own "Pick a date" otherwise. */
  readonly placeholder = input<string>('');
  /** A form field that may be left empty shows Clear; a required one does not. */
  readonly clearable = input<boolean>(true);
  /** The accessible name of the pill, when the field's label is elsewhere. */
  readonly label = input<string>('');
  /** One instant: the value becomes `YYYY-MM-DDTHH:MM` in Cairo's clock, what a
   *  datetime-local field held, and the panel gains the hour and minute. */
  readonly withTime = input<boolean>(false);
  /** The minutes offered, every `minuteStep`. */
  readonly minuteStep = input<number>(5);
  readonly frame = input<PanelFrame>('auto');
  /** 'month' picks a whole month (a payroll month): the value is `YYYY-MM`,
   *  what `<input type="month">` held, and the panel is the year's twelve months. */
  readonly granularity = input<'day' | 'month'>('day');
  protected readonly byMonth = computed(() => this.granularity() === 'month');

  protected readonly hours = Array.from({ length: 24 }, (_, i) => pad2(i));
  protected readonly minutes = computed(() => {
    const step = Math.max(1, Math.min(30, this.minuteStep()));
    return Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad2(i * step));
  });
  /** The date part of the value, whatever the mode (a month reads as its 1st). */
  protected readonly datePart = computed(() => {
    const v = this.value();
    if (!v) return null;
    return v.length === 7 ? `${v}-01` : v.slice(0, 10);
  });
  protected readonly timePart = computed(() => this.value()?.slice(11, 16) || null);

  protected readonly disabled = signal(false);
  protected readonly open = signal(false);
  protected readonly month = signal(Number(todayInCairo().slice(5, 7)) - 1);
  protected readonly year = signal(Number(todayInCairo().slice(0, 4)));
  protected readonly today = signal(todayInCairo());

  /** From the fence (or the year the legacy data starts) to the fence (or
   *  five years past today): a form may need next year's holidays. */
  protected readonly years = computed(() => {
    const first = this.min() ? Number(this.min()!.slice(0, 4)) : 2016;
    const last = this.max()
      ? Number(this.max()!.slice(0, 4))
      : Number(this.today().slice(0, 4)) + 5;
    return Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => first + i);
  });

  protected readonly monthNames = computed(() =>
    Array.from({ length: 12 }, (_, i) =>
      new Date(2000, i, 1).toLocaleDateString(this.locale(), { month: 'long' }),
    ),
  );

  /** The year's months as cells, for month granularity. */
  protected readonly monthCells = computed(() =>
    Array.from({ length: 12 }, (_, i) => ({
      ym: `${this.year()}-${pad2(i + 1)}`,
      name: new Date(2000, i, 1).toLocaleDateString(this.locale(), { month: 'short' }),
    })),
  );

  /** A month outside the fence (compared month to month). */
  protected monthDead(ym: string): boolean {
    const min = this.min()?.slice(0, 7);
    const max = this.max()?.slice(0, 7);
    return !!((min && ym < min) || (max && ym > max));
  }

  protected pickMonth(ym: string): void {
    if (this.monthDead(ym)) return;
    this.set(ym);
    this.close();
  }

  protected stepYear(direction: number): void {
    this.year.update((y) => y + direction);
  }

  /** Sunday first, as the working week here starts on Sunday. */
  protected readonly dayNames = computed(() =>
    Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(this.locale(), { weekday: 'short' }),
    ),
  );

  private locale(): string {
    return this.i18n.isRtl() ? 'ar-EG-u-nu-latn' : 'en-GB';
  }

  /** Six weeks of cells, built in UTC so no daylight-saving edge moves a day. */
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

  private readonly cal = viewChild<ElementRef<HTMLElement>>('cal');
  private openedFrom: HTMLElement | null = null;
  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  /** The pill's face: day first, the way the owner reads a date; then the time. */
  protected shown(value: string): string {
    if (value.length === 7) {
      // A month reads as words, "September 2026" / "سبتمبر 2026".
      const [y, m] = value.split('-');
      return `${this.monthNames()[Number(m) - 1]} ${y}`;
    }
    const [y, m, d] = value.slice(0, 10).split('-');
    const time = value.slice(11, 16);
    return time ? `${d}-${m}-${y} ${time}` : `${d}-${m}-${y}`;
  }

  protected emptyWords(): string {
    const key = this.byMonth()
      ? 'cal.pickMonth'
      : this.withTime()
        ? 'cal.pickDateTime'
        : 'cal.pickDate';
    return this.placeholder() || this.i18n.t(key);
  }

  protected openPanel(): void {
    if (this.disabled()) return;
    this.today.set(todayInCairo());
    const anchor = this.datePart() ?? this.fenced(this.today());
    const date = new Date(anchor + 'T00:00:00Z');
    this.month.set(date.getUTCMonth());
    this.year.set(date.getUTCFullYear());
    this.open.set(true);
    this.openedFrom = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => this.cal()?.nativeElement.focus());
  }

  protected close(): void {
    this.open.set(false);
    this.onTouched();
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

  /** Outside the fence: shown, and not pickable. */
  protected isDead(cell: Cell): boolean {
    const min = this.min();
    const max = this.max();
    return !!((min && cell.iso < min) || (max && cell.iso > max));
  }

  protected pick(cell: Cell): void {
    if (this.isDead(cell)) return;
    if (this.withTime()) {
      // Keep the panel open: the time is still to choose.
      this.set(`${cell.iso}T${this.timePart() ?? '09:00'}`);
      return;
    }
    this.set(cell.iso);
    this.close();
  }

  /** An hour or a minute, in datetime mode; the date defaults to today. */
  protected setTime(part: 'h' | 'm', to: string): void {
    const date = this.datePart() ?? this.fenced(todayInCairo());
    const [h, m] = (this.timePart() ?? '09:00').split(':');
    this.set(`${date}T${part === 'h' ? to : h}:${part === 'm' ? to : m}`);
  }

  /** Today, unless today is outside the fence; then nothing happens. */
  protected pickToday(): void {
    const today = todayInCairo();
    if (this.byMonth()) {
      if (this.monthDead(today.slice(0, 7))) return;
      this.set(today.slice(0, 7));
      this.close();
      return;
    }
    if (this.isDead({ iso: today, day: 0, outside: false })) return;
    this.set(this.withTime() ? `${today}T${nowInCairo()}` : today);
    this.close();
  }

  protected clear(): void {
    this.set(null);
    this.close();
  }

  private fenced(iso: string): string {
    const min = this.min();
    const max = this.max();
    if (min && iso < min) return min;
    if (max && iso > max) return max;
    return iso;
  }

  private set(value: string | null): void {
    this.value.set(value);
    this.onChange(value);
  }

  // ControlValueAccessor: so a reactive or template form can bind it like an input.
  writeValue(value: string | null): void {
    // A datetime-local string may carry seconds; the control holds minutes.
    const keep = this.byMonth() ? 7 : this.withTime() ? 16 : 10;
    this.value.set(value ? value.slice(0, keep) : null);
  }
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}

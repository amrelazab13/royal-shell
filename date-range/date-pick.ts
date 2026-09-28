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
  'cal.noDate': { en: 'No date', ar: 'بلا تاريخ' },
};

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

  /** The pill's face: day first, the way the owner reads a date. */
  protected shown(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }

  protected openPanel(): void {
    if (this.disabled()) return;
    this.today.set(todayInCairo());
    const anchor = this.value() ?? this.fenced(this.today());
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
    this.set(cell.iso);
    this.close();
  }

  /** Today, unless today is outside the fence; then nothing happens. */
  protected pickToday(): void {
    const today = todayInCairo();
    if (this.isDead({ iso: today, day: 0, outside: false })) return;
    this.set(today);
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
    this.value.set(value || null);
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

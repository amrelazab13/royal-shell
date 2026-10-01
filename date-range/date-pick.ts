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
import { ROW_PX, WHEEL_TICK, centredIndex, nearestLive, offsetFor, wheelId } from './wheel';

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
  // The window, named under the grid. A greyed day says it cannot be picked
  // and never says why (29 Sep 2026).
  'cal.fenceFrom': { en: 'From', ar: 'من' },
  'cal.fenceTo': { en: 'to', ar: 'إلى' },
  'cal.fenceNotBefore': { en: 'Not before', ar: 'ليس قبل' },
  'cal.fenceNotAfter': { en: 'Not after', ar: 'ليس بعد' },
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

  /** A tick as the wheel passes a value, where the platform has one. Absent on
   *  the web, which is why it is injected rather than imported (see wheel.ts). */
  private readonly tick = inject(WHEEL_TICK, { optional: true });
  private readonly hourWheel = viewChild<ElementRef<HTMLElement>>('hourWheel');
  private readonly minuteWheel = viewChild<ElementRef<HTMLElement>>('minuteWheel');
  private settling: Record<'h' | 'm', ReturnType<typeof setTimeout> | null> = { h: null, m: null };
  protected readonly rowPx = ROW_PX;
  /** This picker's own stem for the wheels' option ids. */
  protected readonly id = wheelId();
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

  /**
   * The fence, read as DAYS and as CLOCK TIMES.
   *
   * A form may hand `min` or `max` as a Cairo wall clock — "2026-10-01T01:30",
   * the shape `toCairoInput` returns and the shape the native
   * `datetime-local` field wanted. Everything here compared them as dates, and
   * a day sorts BEFORE its own instant ("2026-10-01" < "2026-10-01T01:30"), so
   * three things broke together on 29 September 2026, reported from the sales
   * desk: today was marked dead; the "Now" chip, which asks the same question,
   * did nothing; and `fenced()` handed the instant back as the panel's anchor,
   * where `new Date(anchor + 'T00:00:00Z')` is an Invalid Date, so the month
   * and the year were NaN and the grid built NO cells. What a person saw was
   * the weekday row with the hour and minute columns directly under it, a
   * month select stuck on January, and Done committing nothing.
   *
   * So the grid is fenced by the DAY part and the clock by the TIME part. A
   * fence with no time fences no hour.
   */
  protected readonly minDay = computed(() => this.min()?.slice(0, 10) || null);
  protected readonly maxDay = computed(() => this.max()?.slice(0, 10) || null);
  private readonly minTime = computed(() => this.min()?.slice(11, 16) || null);
  private readonly maxTime = computed(() => this.max()?.slice(11, 16) || null);

  /** For `[(value)]` use; a form control disables it through the form instead
   *  (the CRM, 28 Sep 2026: a view-only role sees the value and cannot open it). */
  readonly disabled = input<boolean>(false);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  /**
   * With a time, nothing leaves the control until date, hour and minute are all
   * there: a module saving on change must never store a half-chosen instant
   * (HR, 28 Sep 2026). The panel works on this draft; one emit per opening.
   */
  private readonly draftDate = signal<string | null>(null);
  private readonly draftH = signal<string | null>(null);
  private readonly draftM = signal<string | null>(null);
  private minuteChosen = false;
  /** The day the grid marks: the draft while choosing an instant. */
  protected readonly markedDate = computed(() =>
    this.withTime() ? this.draftDate() : this.datePart(),
  );
  protected readonly draftHour = computed(() => this.draftH());
  protected readonly draftMinute = computed(() => this.draftM());
  protected readonly draftShown = computed(() => {
    if (!this.withTime()) return this.value() ? this.shown(this.value()!) : null;
    const d = this.draftDate();
    if (!d) return null;
    return this.shown(`${d}T${this.draftH() ?? '--'}:${this.draftM() ?? '--'}`);
  });
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

  /** SATURDAY first: the owner, 1 Oct 2026, "the week starts on saturday not
   *  sunday" (Egypt's week runs Saturday to Friday). 6 Jan 2024 was a
   *  Saturday, so the header is read from there. */
  protected readonly dayNames = computed(() =>
    Array.from({ length: 7 }, (_, i) =>
      new Date(Date.UTC(2024, 0, 6 + i)).toLocaleDateString(this.locale(), { weekday: 'short' }),
    ),
  );

  private locale(): string {
    return this.i18n.isRtl() ? 'ar-EG-u-nu-latn' : 'en-GB';
  }

  /** Six weeks of cells, built in UTC so no daylight-saving edge moves a day. */
  protected readonly cells = computed<Cell[]>(() => {
    const year = this.year();
    const month = this.month();
    // How many days of the previous month lead the grid, counting from
    // SATURDAY (getUTCDay: Saturday is 6), not from Sunday.
    const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 1) % 7;
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
    if (this.isDisabled()) return;
    this.draftDate.set(this.withTime() ? this.datePart() : null);
    this.draftH.set(this.timePart()?.slice(0, 2) || null);
    this.draftM.set(this.timePart()?.slice(3, 5) || null);
    this.minuteChosen = false;
    this.today.set(todayInCairo());
    const anchor = this.datePart() ?? this.fenced(this.today());
    const date = new Date(anchor + 'T00:00:00Z');
    this.month.set(date.getUTCMonth());
    this.year.set(date.getUTCFullYear());
    this.open.set(true);
    this.openedFrom = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => {
      this.cal()?.nativeElement.focus();
      this.restWheels();
    });
  }

  /**
   * Put the wheels where they belong before anybody sees them.
   *
   * On the drafted value if there is one; otherwise on the first row that may
   * be chosen, so the window is never sitting over a greyed hour. Without
   * this both wheels open at midnight and a 16:40 follow-up starts sixteen
   * flicks away.
   *
   * No value is SET here. The wheel showing 09 and 09 being chosen are
   * different things, and a picker that silently decided a time because it was
   * opened would commit an instant nobody asked for.
   */
  private restWheels(): void {
    const put = (
      el: HTMLElement | undefined,
      list: string[],
      at: string | null,
      dead: (index: number) => boolean,
    ) => {
      if (!el) return;
      const known = at ? list.indexOf(at) : -1;
      const landed = known >= 0 ? known : nearestLive(list.length, 0, dead);
      if (landed >= 0) el.scrollTop = offsetFor(landed);
    };
    put(this.hourWheel()?.nativeElement, this.hours, this.draftHour(), (i) =>
      this.hourDead(this.hours[i]),
    );
    const minutes = this.minutes();
    put(this.minuteWheel()?.nativeElement, minutes, this.draftMinute(), (i) =>
      this.minuteDead(minutes[i]),
    );
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
    const min = this.minDay();
    const max = this.maxDay();
    return !!((min && cell.iso < min) || (max && cell.iso > max));
  }

  /**
   * An hour outside the fence, on the fence's own day.
   *
   * Fencing the grid by day alone would let somebody set a follow-up for 00:15
   * today when the fence says "not before 01:30 today": the server refuses it
   * and the person is told nothing they can act on. Every hour of every other
   * day is open.
   */
  protected hourDead(h: string): boolean {
    const day = this.draftDate();
    if (!day) return false;
    const low = day === this.minDay() ? this.minTime() : null;
    const high = day === this.maxDay() ? this.maxTime() : null;
    return !!((low && h < low.slice(0, 2)) || (high && h > high.slice(0, 2)));
  }

  /** A minute outside the fence, in the fence's own hour on its own day. */
  protected minuteDead(m: string): boolean {
    const day = this.draftDate();
    const h = this.draftH();
    if (!day || !h) return false;
    const low = day === this.minDay() ? this.minTime() : null;
    const high = day === this.maxDay() ? this.maxTime() : null;
    return !!(
      (low && h === low.slice(0, 2) && m < low.slice(3, 5)) ||
      (high && h === high.slice(0, 2) && m > high.slice(3, 5))
    );
  }

  protected pick(cell: Cell): void {
    if (this.isDead(cell)) return;
    if (this.withTime()) {
      // The day goes into the draft; the panel stays open for the time.
      this.draftDate.set(cell.iso);
      // The new day may forbid the hour the old one allowed (the fence day's
      // own clock). Drop it rather than commit an instant the server refuses.
      const held = this.draftH();
      if (held && this.hourDead(held)) {
        this.draftH.set(null);
        this.draftM.set(null);
        this.minuteChosen = false;
        return;
      }
      if (this.minuteChosen) this.commitInstant();
      return;
    }
    this.set(cell.iso);
    this.close();
  }

  /**
   * The wheel came to rest: take the row under the window, or the nearest row
   * that may be chosen.
   *
   * Debounced rather than driven by `scrollend`, which Safari only learnt
   * recently and this app has to run on iOS 15. Ninety milliseconds is long
   * enough that a flick is one settle rather than forty, and short enough that
   * letting go feels like choosing.
   */
  protected wheelSettled(part: 'h' | 'm', el: HTMLElement): void {
    const list = part === 'h' ? this.hours : this.minutes();
    const dead = (i: number) => (part === 'h' ? this.hourDead(list[i]) : this.minuteDead(list[i]));
    const landed = nearestLive(list.length, centredIndex(el.scrollTop), dead);
    if (landed < 0) return; // every row fenced off: leave the wheel alone
    const want = offsetFor(landed);
    if (Math.abs(el.scrollTop - want) > 1) el.scrollTo({ top: want, behavior: 'smooth' });
    const already = part === 'h' ? this.draftHour() : this.draftMinute();
    if (already === list[landed]) return;
    this.tick?.();
    this.setTime(part, list[landed]);
  }

  /** Every scroll event asks again, and only the last one wins. */
  protected onWheelScroll(part: 'h' | 'm', target: EventTarget | null): void {
    const el = target as HTMLElement | null;
    if (!el) return;
    const pending = this.settling[part];
    if (pending) clearTimeout(pending);
    this.settling[part] = setTimeout(() => this.wheelSettled(part, el), 90);
  }

  /**
   * Arrow keys, because a wheel a mouse can spin is not a wheel a keyboard can
   * use, and this control is on the web CRM too.
   *
   * Moves by one LIVE row rather than one row: stepping onto a fenced hour and
   * being bounced back off it would make the key feel broken.
   */
  protected onWheelKey(part: 'h' | 'm', event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const list = part === 'h' ? this.hours : this.minutes();
    const dead = (i: number) => (part === 'h' ? this.hourDead(list[i]) : this.minuteDead(list[i]));
    const now = list.indexOf((part === 'h' ? this.draftHour() : this.draftMinute()) ?? '');
    const from = now < 0 ? 0 : now + step;
    const landed = nearestLive(list.length, Math.min(Math.max(from, 0), list.length - 1), dead);
    if (landed < 0 || list[landed] === (part === 'h' ? this.draftHour() : this.draftMinute()))
      return;
    this.tick?.();
    this.setTime(part, list[landed]);
    const el = (part === 'h' ? this.hourWheel() : this.minuteWheel())?.nativeElement;
    el?.scrollTo({ top: offsetFor(landed), behavior: 'smooth' });
  }

  /** An hour or a minute into the draft; the minute completes the instant once
   *  there is a day and an hour. */
  protected setTime(part: 'h' | 'm', to: string): void {
    if (part === 'h') {
      if (this.hourDead(to)) return;
      this.draftH.set(to);
      if (this.minuteChosen) this.commitInstant();
      return;
    }
    if (this.minuteDead(to)) return;
    this.draftM.set(to);
    this.minuteChosen = true;
    this.commitInstant();
  }

  /** Done: keep the draft if it is a whole instant; otherwise just close. */
  protected done(): void {
    if (this.withTime()) {
      if (!this.commitInstant()) this.close();
      return;
    }
    this.close();
  }

  /** Emits and closes when the draft is a whole instant; says whether it did. */
  private commitInstant(): boolean {
    const d = this.draftDate();
    const h = this.draftH();
    const m = this.draftM();
    if (!d || !h || !m) return false;
    const next = `${d}T${h}:${m}`;
    if (next !== this.value()) this.set(next);
    this.close();
    return true;
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
    const min = this.minDay();
    const max = this.maxDay();
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
    this.formDisabled.set(disabled);
  }
}

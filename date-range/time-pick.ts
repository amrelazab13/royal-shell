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
import { Icon } from '../icons/icons';
import { SHELL_WORDS } from '../words';
import { PICK, PanelFrame, nowInCairo, pad2 } from './date-pick';
import { CAL, wordsFor } from './date-range';

/**
 * A time of day, in the same pill and panel as the date controls (bible §8 C-5,
 * decided 28 Sep 2026: no native picker anywhere a person sees it).
 *
 * The value is `HH:MM` on a 24-hour clock, or null: what `<input type="time">`
 * held, so a module swapping one for the other changes no data. Two columns,
 * hours and minutes, every `minuteStep` minutes; `min` and `max` fence it.
 * "Now" is Cairo's clock, never the browser's.
 *
 * Two of these on one row make a range (a work plan's start and end); the
 * control does not join them, because a range across midnight is the page's
 * rule to state, not the picker's to guess.
 */
@Component({
  selector: 'app-time-pick',
  imports: [Icon],
  templateUrl: './time-pick.html',
  styleUrl: './date-range.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimePickControl), multi: true },
  ],
})
export class TimePickControl implements ControlValueAccessor {
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
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly minuteStep = input<number>(5);
  readonly placeholder = input<string>('');
  readonly clearable = input<boolean>(true);
  readonly label = input<string>('');
  readonly frame = input<PanelFrame>('auto');
  /** For `[(value)]` use; a form control disables it through the form instead. */
  readonly disabled = input<boolean>(false);

  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly open = signal(false);
  protected readonly hours = Array.from({ length: 24 }, (_, i) => pad2(i));
  protected readonly minutes = computed(() => {
    const step = Math.max(1, Math.min(30, this.minuteStep()));
    return Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad2(i * step));
  });
  /**
   * What the panel shows while it is open. Nothing leaves the control until the
   * time is complete: an hour alone never emits, because a module that saves on
   * change would store 09:00 on the way to 09:40 (HR, 28 Sep 2026: the
   * attendance roll POSTs on change, so every correction wrote a wrong row
   * first). One emit per opening, at most.
   */
  private readonly draftH = signal<string | null>(null);
  private readonly draftM = signal<string | null>(null);
  private minuteChosen = false;
  protected readonly hour = computed(() => this.draftH());
  protected readonly minute = computed(() => this.draftM());

  private readonly cal = viewChild<ElementRef<HTMLElement>>('cal');
  private openedFrom: HTMLElement | null = null;
  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  protected emptyWords(): string {
    return this.placeholder() || this.i18n.t('cal.pickTime');
  }

  /** An hour is dead when no minute of it is inside the fence. */
  protected hourDead(h: string): boolean {
    const min = this.min();
    const max = this.max();
    return !!((min && `${h}:59` < min) || (max && `${h}:00` > max));
  }

  protected minuteDead(m: string): boolean {
    const t = `${this.hour() ?? '00'}:${m}`;
    const min = this.min();
    const max = this.max();
    return !!((min && t < min) || (max && t > max));
  }

  protected openPanel(): void {
    if (this.isDisabled()) return;
    this.draftH.set(this.value()?.slice(0, 2) || null);
    this.draftM.set(this.value()?.slice(3, 5) || null);
    this.minuteChosen = false;
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

  /** An hour or a minute into the draft; the minute, once there is an hour,
   *  completes the time and commits it. */
  protected setPart(part: 'h' | 'm', to: string): void {
    if (part === 'h' ? this.hourDead(to) : this.minuteDead(to)) return;
    if (part === 'h') {
      this.draftH.set(to);
      if (this.minuteChosen && this.draftM()) this.commit();
      return;
    }
    this.draftM.set(to);
    this.minuteChosen = true;
    if (this.draftH()) this.commit();
  }

  /** Done: keep the draft if it is a whole time. */
  protected done(): void {
    if (this.draftH() && this.draftM()) {
      this.commit();
      return;
    }
    this.close();
  }

  private commit(): void {
    const next = `${this.draftH()}:${this.draftM()}`;
    if (next !== this.value()) this.set(next);
    this.close();
  }

  protected pickNow(): void {
    const now = nowInCairo();
    const min = this.min();
    const max = this.max();
    if ((min && now < min) || (max && now > max)) return;
    this.set(now);
    this.close();
  }

  protected clear(): void {
    this.set(null);
    this.close();
  }

  private set(value: string | null): void {
    this.value.set(value);
    this.onChange(value);
  }

  writeValue(value: string | null): void {
    // `<input type="time">` may have held seconds; the control holds minutes.
    this.value.set(value ? value.slice(0, 5) : null);
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

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SHELL_WORDS } from '../words';
import { DatePickControl } from './date-pick';
import { ROW_PX } from './wheel';

/** The control's own members are protected; the spec reaches them by name. */
interface Control {
  openPanel: () => void;
  close: () => void;
  open: () => boolean;
  pick: (cell: { iso: string; day: number; outside: boolean }) => void;
  pickToday: () => void;
  clear: () => void;
  isDead: (cell: { iso: string; day: number; outside: boolean }) => boolean;
  years: () => number[];
  month: () => number;
  year: () => number;
  value: () => string | null;
}

const cell = (iso: string) => ({ iso, day: Number(iso.slice(8)), outside: false });

describe('DatePickControl', () => {
  let fixture: ComponentFixture<DatePickControl>;
  let control: Control;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    // The controls read the PAGE's direction when no module words are given; a
    // spec elsewhere may have left it rtl (Royal Me, 28 Sep 2026). State it.
    document.documentElement.dir = 'ltr';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 22:30 UTC on 30 September: 01:30 on 1 October in Cairo (+03:00).
    vi.setSystemTime(new Date('2026-09-30T22:30:00Z'));
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DatePickControl],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(DatePickControl);
    fixture.detectChanges();
    control = fixture.componentInstance as unknown as Control;
  });

  afterEach(() => vi.useRealTimers());

  it('is never a native picker', () => {
    expect(el().querySelector('input[type="date"]')).toBeNull();
    expect(el().querySelector('button.pill.single')).not.toBeNull();
  });

  it('shows the words when empty and the date day-first when set', async () => {
    expect(el().querySelector('.ptxt')?.textContent?.trim()).toBe('Pick a date');
    fixture.componentRef.setInput('value', '2026-10-06');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el().querySelector('.ptxt')?.textContent?.trim()).toBe('06-10-2026');
  });

  it('a form date may lie in the future: nothing is refused by default', () => {
    expect(control.isDead(cell('2027-03-20'))).toBe(false);
    control.pick(cell('2027-03-20'));
    expect(control.value()).toBe('2027-03-20');
  });

  it('min and max fence the grid, and a fenced day cannot be picked', () => {
    fixture.componentRef.setInput('min', '2026-10-01');
    fixture.componentRef.setInput('max', '2026-10-31');
    fixture.detectChanges();
    expect(control.isDead(cell('2026-09-30'))).toBe(true);
    expect(control.isDead(cell('2026-11-01'))).toBe(true);
    expect(control.isDead(cell('2026-10-15'))).toBe(false);
    control.pick(cell('2026-11-01'));
    expect(control.value()).toBeNull();
  });

  it("Today is Cairo's today, not UTC's", () => {
    control.pickToday();
    expect(control.value()).toBe('2026-10-01');
  });

  it('starts the week on SATURDAY (the owner, 1 Oct 2026)', async () => {
    control.openPanel();
    fixture.detectChanges();
    await fixture.whenStable();
    const names = [...el().querySelectorAll('.grid7 .dow')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    // October 2026 opens on a Thursday: five days of September lead it,
    // Saturday 26 to Wednesday 30, so the 1st sits under "Thu".
    const days = [...el().querySelectorAll('.grid7 button')].map((b) => b.textContent?.trim());
    expect(days.slice(0, 6)).toEqual(['26', '27', '28', '29', '30', '1']);
  });

  it('opens on the picked month, or on today when empty', () => {
    control.openPanel();
    expect([control.year(), control.month()]).toEqual([2026, 9]);
    control.close();
    fixture.componentRef.setInput('value', '2028-02-10');
    control.openPanel();
    expect([control.year(), control.month()]).toEqual([2028, 1]);
  });

  it('an empty string is empty: the panel opens on today, not January 2016', () => {
    fixture.componentRef.setInput('value', '');
    control.openPanel();
    expect([control.year(), control.month()]).toEqual([2026, 9]);
  });

  it('offers years past today, for next year’s holidays', () => {
    expect(control.years()).toContain(2030);
  });

  it('Clear empties it, and a required field has no Clear', async () => {
    fixture.componentRef.setInput('value', '2026-10-06');
    control.clear();
    expect(control.value()).toBeNull();
    fixture.componentRef.setInput('clearable', false);
    control.openPanel();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el().querySelector('.calfoot .btn.sec')).toBeNull();
  });

  it('speaks Arabic when the page does, with Western digits', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DatePickControl],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SHELL_WORDS, useValue: { isRtl: () => true, t: (k: string) => k } },
      ],
    }).compileComponents();
    const ar = TestBed.createComponent(DatePickControl);
    ar.detectChanges();
    expect((ar.nativeElement as HTMLElement).querySelector('.ptxt')?.textContent?.trim()).toBe(
      'اختر تاريخًا',
    );
  });
});

@Component({
  imports: [DatePickControl, ReactiveFormsModule],
  template: `<app-date-pick [formControl]="field" />`,
})
class Host {
  readonly field = new FormControl<string | null>('2026-10-06');
  readonly seen = signal<string | null>(null);
}

describe('DatePickControl in a reactive form', () => {
  it('reads the form value, writes a pick back, and follows disabled', async () => {
    // The controls read the PAGE's direction when no module words are given; a
    // spec elsewhere may have left it rtl (Royal Me, 28 Sep 2026). State it.
    document.documentElement.dir = 'ltr';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T22:30:00Z'));
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const host = TestBed.createComponent(Host);
    host.detectChanges();
    await host.whenStable();
    const pickEl = host.debugElement.children[0];
    const pick = pickEl.componentInstance as unknown as Control;
    expect(pick.value()).toBe('2026-10-06');
    pick.pick(cell('2026-10-20'));
    expect(host.componentInstance.field.value).toBe('2026-10-20');
    host.componentInstance.field.disable();
    host.detectChanges();
    await host.whenStable();
    const button = (host.nativeElement as HTMLElement).querySelector(
      'button.pill',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    vi.useRealTimers();
  });
});

/**
 * A fence that carries a time — the fault a sales colleague hit on 29 September
 * 2026, reported through the owner.
 *
 * `New Activity → FOLLOW UP` passes `min` and `max` as Cairo wall clocks
 * ("2026-10-01T01:30"), which is what the native `datetime-local` field wanted
 * and what `toCairoInput` still returns. Every comparison in here read them as
 * dates. Three things broke at once, all from that:
 *
 *  - `fenced()` decided today was before the fence, because the string
 *    "2026-10-01" sorts before "2026-10-01T01:30", and handed back the fence.
 *    The anchor became "2026-10-01T01:30T00:00:00Z" — an Invalid Date — so the
 *    month and year were NaN and the grid built no cells at all. What a person
 *    saw was the weekday row, then the hour and minute columns directly under
 *    it, and a month select stuck on January. Tapping a number set an hour, no
 *    day was ever chosen, and Done committed nothing: "No date".
 *  - `isDead()` marked TODAY dead for the same reason, so even a drawn grid
 *    would have refused the one day most follow-ups are set for.
 *  - `pickToday()` asks `isDead()` first, so the "Now" chip did nothing —
 *    which is why there was no way round it from inside the app.
 *
 * The fence is a DAY fence for the grid and an INSTANT fence for the clock, so
 * both are tested here.
 */
interface Timed extends Control {
  cells: () => { iso: string; day: number; outside: boolean }[];
  setTime: (part: 'h' | 'm', to: string) => void;
  done: () => void;
  hourDead: (h: string) => boolean;
  wheelSettled: (part: 'h' | 'm', el: HTMLElement) => void;
  onWheelKey: (part: 'h' | 'm', event: KeyboardEvent) => void;
}

/** A scroll container, as much of one as the wheel actually touches. */
const column = (scrollTop: number) => {
  const went: number[] = [];
  const el = {
    scrollTop,
    scrollTo: (to: { top: number }) => {
      went.push(to.top);
      el.scrollTop = to.top;
    },
  };
  return { el: el as unknown as HTMLElement, went };
};

describe('DatePickControl with a fence that carries a time', () => {
  let fixture: ComponentFixture<DatePickControl>;
  let control: Timed;

  beforeEach(async () => {
    document.documentElement.dir = 'ltr';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 22:30 UTC on 30 September is 01:30 on 1 October in Cairo (+03:00).
    vi.setSystemTime(new Date('2026-09-30T22:30:00Z'));
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DatePickControl],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(DatePickControl);
    fixture.componentRef.setInput('withTime', true);
    // Exactly what lead-detail binds: `toCairoInput(new Date())` and the same
    // ninety days on.
    fixture.componentRef.setInput('min', '2026-10-01T01:30');
    fixture.componentRef.setInput('max', '2026-12-30T01:30');
    fixture.detectChanges();
    control = fixture.componentInstance as unknown as Timed;
  });

  afterEach(() => vi.useRealTimers());

  it('opens on this month, not January, and draws the days', () => {
    control.openPanel();
    expect(control.year()).toBe(2026);
    expect(control.month()).toBe(9); // October
    const days = control.cells();
    // Whole weeks, and every day of October among them. The count was NaN
    // before the fix, so the grid was empty.
    expect(days.length % 7).toBe(0);
    expect(days.length).toBeGreaterThanOrEqual(28);
    expect(days.filter((d) => !d.outside).length).toBe(31);
    expect(days.some((d) => d.iso === '2026-10-11')).toBe(true);
    // The grid is in the DOM, not just in the signal.
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.grid7 .day').length).toBe(
      days.length,
    );
  });

  it('leaves today alive, and the day after the max day dead', () => {
    expect(control.isDead(cell('2026-10-01'))).toBe(false);
    expect(control.isDead(cell('2026-10-11'))).toBe(false);
    expect(control.isDead(cell('2026-12-30'))).toBe(false);
    expect(control.isDead(cell('2026-12-31'))).toBe(true);
    expect(control.isDead(cell('2026-09-30'))).toBe(true);
  });

  it('picks 11 October 2026 at 10:00 and keeps it on Done', () => {
    control.openPanel();
    control.pick(cell('2026-10-11'));
    control.setTime('h', '10');
    control.setTime('m', '00');
    control.done();
    expect(control.value()).toBe('2026-10-11T10:00');
  });

  it('refuses an hour before the fence on the fence day, and allows it after', () => {
    control.openPanel();
    control.pick(cell('2026-10-01'));
    expect(control.hourDead('00')).toBe(true); // 00:xx is before 01:30 today
    expect(control.hourDead('02')).toBe(false);
    control.pick(cell('2026-10-11'));
    expect(control.hourDead('00')).toBe(false); // a later day is wide open
  });

  it('lets the Now chip set an instant', () => {
    control.openPanel();
    control.pickToday();
    expect(control.value()).toBe('2026-10-01T01:30');
  });

  it('names the window under the grid, so a greyed day is explained', () => {
    control.openPanel();
    fixture.detectChanges();
    const fence = (fixture.nativeElement as HTMLElement).querySelector('.fence');
    expect(fence).not.toBeNull();
    // Day first, the way the owner reads a date, and both ends named.
    expect(fence?.textContent?.replace(/\s+/g, ' ').trim()).toBe('From 01-10-2026 to 30-12-2026');
  });

  it('draws the same grid and keeps the same instant in Arabic, mirrored', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DatePickControl],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SHELL_WORDS, useValue: { isRtl: () => true, t: (k: string) => k } },
      ],
    }).compileComponents();
    const ar = TestBed.createComponent(DatePickControl);
    ar.componentRef.setInput('withTime', true);
    ar.componentRef.setInput('min', '2026-10-01T01:30');
    ar.componentRef.setInput('max', '2026-12-30T01:30');
    ar.detectChanges();
    const rtl = ar.componentInstance as unknown as Timed;
    rtl.openPanel();
    ar.detectChanges();
    expect(rtl.month()).toBe(9);
    expect((ar.nativeElement as HTMLElement).querySelectorAll('.grid7 .day').length).toBe(
      rtl.cells().length,
    );
    expect(
      (ar.nativeElement as HTMLElement)
        .querySelector('.fence')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('من 01-10-2026 إلى 30-12-2026');
    rtl.pick(cell('2026-10-11'));
    rtl.setTime('h', '10');
    rtl.setTime('m', '00');
    rtl.done();
    // The value is the same instant whatever the app's language reads.
    expect(rtl.value()).toBe('2026-10-11T10:00');
  });
  it('will not rest the wheel on an hour the fence forbids', () => {
    // 01:30 is the fence, so 00 is dead. Let the wheel go at the top and it
    // must settle on 01, not sit on a greyed row showing a time nobody can
    // choose.
    control.openPanel();
    control.pick(cell('2026-10-01'));
    const { el, went } = column(0);
    control.wheelSettled('h', el);
    expect(went).toEqual([ROW_PX]); // scrolled down one row, to 01
    expect(control.value()).toBeNull(); // nothing committed on an hour alone
  });

  it('takes the row under the window on a day with no fence', () => {
    control.openPanel();
    control.pick(cell('2026-10-11'));
    const { el, went } = column(ROW_PX * 10);
    control.wheelSettled('h', el);
    expect(went).toEqual([]); // already centred: no correcting shove
    const minutes = column(ROW_PX * 6); // 30, in fives
    control.wheelSettled('m', minutes.el);
    // Day, hour and minute are all there now, so the instant is emitted.
    expect(control.value()).toBe('2026-10-11T10:30');
  });

  it('steps by arrow key, over the fenced hours rather than into them', () => {
    control.openPanel();
    control.pick(cell('2026-10-01'));
    control.setTime('h', '02');
    control.onWheelKey('h', new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    // 01 is the first live hour; 00 is behind the fence and is stepped over.
    control.onWheelKey('h', new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    // 00 past the hour is itself behind the fence on this day — 01:30 is the
    // earliest instant — so the minute wheel's first live row is 30, and the
    // control refuses 00 rather than committing a time already gone.
    control.setTime('m', '00');
    control.done();
    expect(control.value()).toBeNull();
    control.setTime('m', '30');
    control.done();
    expect(control.value()).toBe('2026-10-01T01:30');
  });

  it('ignores a key that is not a step', () => {
    control.openPanel();
    control.pick(cell('2026-10-11'));
    control.setTime('h', '10');
    control.onWheelKey('h', new KeyboardEvent('keydown', { key: 'a' }));
    control.setTime('m', '00');
    control.done();
    expect(control.value()).toBe('2026-10-11T10:00');
  });
});

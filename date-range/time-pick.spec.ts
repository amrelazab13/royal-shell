import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DatePickControl } from './date-pick';
import { TimePickControl } from './time-pick';

interface Time {
  openPanel: () => void;
  done: () => void;
  setPart: (part: 'h' | 'm', to: string) => void;
  pickNow: () => void;
  clear: () => void;
  hourDead: (h: string) => boolean;
  minuteDead: (m: string) => boolean;
  minutes: () => string[];
  value: () => string | null;
}

interface DateTime {
  openPanel: () => void;
  done: () => void;
  pick: (cell: { iso: string; day: number; outside: boolean }) => void;
  setTime: (part: 'h' | 'm', to: string) => void;
  pickToday: () => void;
  open: () => boolean;
  value: () => string | null;
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));

describe('TimePickControl', () => {
  let fixture: ComponentFixture<TimePickControl>;
  let control: Time;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    // The controls read the PAGE's direction when no module words are given; a
    // spec elsewhere may have left it rtl (Royal Me, 28 Sep 2026). State it.
    document.documentElement.dir = 'ltr';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 06:07 UTC is 09:07 in Cairo (+03:00).
    at('2026-09-28T06:07:00Z');
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TimePickControl],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TimePickControl);
    fixture.detectChanges();
    control = fixture.componentInstance as unknown as Time;
  });

  afterEach(() => vi.useRealTimers());

  it('is never a native picker', () => {
    expect(el().querySelector('input[type="time"]')).toBeNull();
    expect(el().querySelector('button.pill.time')).not.toBeNull();
  });

  it('builds HH:MM from an hour and a minute, 24-hour, and emits ONCE', () => {
    const seen: (string | null)[] = [];
    fixture.componentInstance.value.subscribe((v) => seen.push(v));
    control.openPanel();
    control.setPart('h', '17');
    expect(control.value()).toBeNull(); // an hour alone never leaves the control
    control.setPart('m', '45');
    expect(control.value()).toBe('17:45');
    expect(seen).toEqual(['17:45']); // never 17:00 on the way (HR's attendance roll)
  });

  it('changing only the hour of a set time waits for Done', () => {
    fixture.componentRef.setInput('value', '09:40');
    control.openPanel();
    control.setPart('h', '10');
    expect(control.value()).toBe('09:40');
    control.done();
    expect(control.value()).toBe('10:40');
  });

  it('[disabled] refuses to open, without a form', async () => {
    fixture.componentRef.setInput('value', '08:00');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const b = el().querySelector('button.pill') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    control.openPanel();
    expect((fixture.componentInstance as unknown as { open: () => boolean }).open()).toBe(false);
  });

  it("Now is Cairo's clock, not the browser's", () => {
    control.pickNow();
    expect(control.value()).toBe('09:07');
  });

  it('offers minutes every minuteStep', () => {
    fixture.componentRef.setInput('minuteStep', 15);
    expect(control.minutes()).toEqual(['00', '15', '30', '45']);
  });

  it('min and max fence hours and minutes, and a fenced part is refused', () => {
    fixture.componentRef.setInput('min', '08:30');
    fixture.componentRef.setInput('max', '17:00');
    expect(control.hourDead('07')).toBe(true);
    expect(control.hourDead('08')).toBe(false);
    expect(control.hourDead('18')).toBe(true);
    control.openPanel();
    control.setPart('h', '18');
    expect(control.value()).toBeNull();
    control.setPart('h', '08');
    expect(control.minuteDead('00')).toBe(true);
    expect(control.minuteDead('30')).toBe(false);
  });

  it('Clear empties it', () => {
    fixture.componentRef.setInput('value', '10:00');
    control.clear();
    expect(control.value()).toBeNull();
  });
});

describe('DatePickControl withTime', () => {
  let fixture: ComponentFixture<DatePickControl>;
  let control: DateTime;

  beforeEach(async () => {
    // The controls read the PAGE's direction when no module words are given; a
    // spec elsewhere may have left it rtl (Royal Me, 28 Sep 2026). State it.
    document.documentElement.dir = 'ltr';
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-09-28T06:07:00Z');
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DatePickControl],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(DatePickControl);
    fixture.componentRef.setInput('withTime', true);
    fixture.detectChanges();
    control = fixture.componentInstance as unknown as DateTime;
  });

  afterEach(() => vi.useRealTimers());

  it('one instant, emitted ONCE: day, hour and minute before anything leaves', () => {
    const seen: (string | null)[] = [];
    fixture.componentInstance.value.subscribe((v) => seen.push(v));
    control.openPanel();
    control.pick({ iso: '2026-10-06', day: 6, outside: false });
    control.setTime('h', '14');
    expect(control.value()).toBeNull();
    control.setTime('m', '30');
    expect(control.value()).toBe('2026-10-06T14:30');
    expect(seen).toEqual(['2026-10-06T14:30']);
  });

  it('moving only the day keeps the time, on Done', () => {
    fixture.componentRef.setInput('value', '2026-10-06T14:30');
    control.openPanel();
    control.pick({ iso: '2026-10-08', day: 8, outside: false });
    expect(control.value()).toBe('2026-10-06T14:30');
    control.done();
    expect(control.value()).toBe('2026-10-08T14:30');
  });

  it('picking a day keeps the panel open, since the time is still to choose', () => {
    (fixture.componentInstance as unknown as { openPanel: () => void }).openPanel();
    control.pick({ iso: '2026-10-06', day: 6, outside: false });
    expect(control.open()).toBe(true);
  });

  it("Now is Cairo's date and clock", () => {
    control.pickToday();
    expect(control.value()).toBe('2026-09-28T09:07');
  });
});

@Component({
  imports: [TimePickControl, DatePickControl, ReactiveFormsModule],
  template: `<app-time-pick [formControl]="time" /><app-date-pick
      [withTime]="true"
      [formControl]="at"
    />`,
})
class Host {
  // What the native fields held: seconds included.
  readonly time = new FormControl<string | null>('08:30:00');
  readonly at = new FormControl<string | null>('2026-10-06T14:30:00');
}

describe('time controls in a reactive form', () => {
  it('read what a native field held, and write back minutes', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const host = TestBed.createComponent(Host);
    host.detectChanges();
    await host.whenStable();
    const [timeEl, atEl] = host.debugElement.children;
    expect((timeEl.componentInstance as Time).value()).toBe('08:30');
    expect((atEl.componentInstance as DateTime).value()).toBe('2026-10-06T14:30');
    const t = timeEl.componentInstance as Time;
    t.openPanel();
    t.setPart('h', '09');
    expect(host.componentInstance.time.value).toBe('08:30:00'); // nothing yet
    t.done();
    expect(host.componentInstance.time.value).toBe('09:30');
  });
});

describe('DatePickControl by month', () => {
  interface Month {
    pickMonth: (ym: string) => void;
    monthDead: (ym: string) => boolean;
    pickToday: () => void;
    value: () => string | null;
    shown: (v: string) => string;
  }
  let fixture: ComponentFixture<DatePickControl>;
  let control: Month;

  beforeEach(async () => {
    // The controls read the PAGE's direction when no module words are given; a
    // spec elsewhere may have left it rtl (Royal Me, 28 Sep 2026). State it.
    document.documentElement.dir = 'ltr';
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-09-30T22:30:00Z'); // 1 October in Cairo
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DatePickControl],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(DatePickControl);
    fixture.componentRef.setInput('granularity', 'month');
    fixture.detectChanges();
    control = fixture.componentInstance as unknown as Month;
  });

  afterEach(() => vi.useRealTimers());

  it('holds YYYY-MM, what a month field held', () => {
    control.pickMonth('2026-08');
    expect(control.value()).toBe('2026-08');
  });

  it("This month is Cairo's month", () => {
    control.pickToday();
    expect(control.value()).toBe('2026-10');
  });

  it('fences by month, and a fenced month is refused', () => {
    fixture.componentRef.setInput('max', '2026-09-30');
    expect(control.monthDead('2026-10')).toBe(true);
    expect(control.monthDead('2026-09')).toBe(false);
    control.pickMonth('2026-10');
    expect(control.value()).toBeNull();
  });

  it('reads as the month in words', () => {
    expect(control.shown('2026-09')).toBe('September 2026');
  });
});

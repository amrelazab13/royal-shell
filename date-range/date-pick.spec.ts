import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SHELL_WORDS } from '../words';
import { DatePickControl } from './date-pick';

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

  it('opens on the picked month, or on today when empty', () => {
    control.openPanel();
    expect([control.year(), control.month()]).toEqual([2026, 9]);
    control.close();
    fixture.componentRef.setInput('value', '2028-02-10');
    control.openPanel();
    expect([control.year(), control.month()]).toEqual([2028, 1]);
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

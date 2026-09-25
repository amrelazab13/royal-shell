import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SHELL_WORDS } from '../words';
import { DateRange, DateRangeControl } from './date-range';

/** The control's own members are protected; the spec reaches them by name. */
interface Control {
  applyPreset: (preset: string) => void;
  openAt: (end: 'from' | 'to') => void;
  close: () => void;
  open: () => boolean;
  today: () => string;
  years: () => number[];
  isFuture: (cell: { iso: string }) => boolean;
}

describe('DateRangeControl', () => {
  let fixture: ComponentFixture<DateRangeControl>;
  let control: Control;
  let emitted: DateRange[];

  const at = (iso: string) => vi.setSystemTime(new Date(iso));

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 22:30 UTC on 30 September: 01:30 on 1 October in Cairo (+03:00).
    at('2026-09-30T22:30:00Z');
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DateRangeControl],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(DateRangeControl);
    fixture.componentRef.setInput('range', { from: null, to: null });
    fixture.detectChanges();
    control = fixture.componentInstance as unknown as Control;
    emitted = [];
    fixture.componentInstance.changed.subscribe((range) => emitted.push(range));
  });

  afterEach(() => vi.useRealTimers());

  const last = () => emitted[emitted.length - 1];

  it('calls it the first of October at half past midnight in Cairo, not the thirtieth', () => {
    control.applyPreset('today');
    expect(last()).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });

  it('chooses this month and last month on Cairo’s calendar', () => {
    // The old presets read the month in UTC — still September — and picked
    // September for "this month" and August for "last month".
    control.applyPreset('thisMonth');
    expect(last()).toEqual({ from: '2026-10-01', to: '2026-10-01' });
    control.applyPreset('lastMonth');
    expect(last()).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('counts back seven and thirty days on the calendar', () => {
    control.applyPreset('last7');
    expect(last()).toEqual({ from: '2026-09-25', to: '2026-10-01' });
    control.applyPreset('last30');
    expect(last()).toEqual({ from: '2026-09-02', to: '2026-10-01' });
  });

  it('starts this year on Cairo’s New Year', () => {
    at('2026-12-31T23:00:00Z'); // 01:00 on 1 January 2027 in Cairo
    control.applyPreset('thisYear');
    expect(last()).toEqual({ from: '2027-01-01', to: '2027-01-01' });
  });

  it('re-reads today each time the panel opens, so a tab left open across midnight moves on', () => {
    expect(control.today()).toBe('2026-10-01');
    at('2026-10-01T22:30:00Z'); // 01:30 on 2 October in Cairo
    expect(control.isFuture({ iso: '2026-10-02' })).toBe(true);
    control.openAt('from');
    expect(control.today()).toBe('2026-10-02');
    expect(control.isFuture({ iso: '2026-10-02' })).toBe(false);
  });

  it('offers years up to the one after today’s rather than a fixed list', () => {
    const years = control.years();
    expect(years[0]).toBe(2016);
    expect(years[years.length - 1]).toBe(2027);
  });

  /* Below 820 px this is a centred, dimmed, viewport-fixed sheet — a modal in
     everything but ARIA. It had no role, no label, no focus moved in and no
     Escape handler at all (audit 4, F4-26). */

  it('is a labelled dialog while it is open', () => {
    control.openAt('from');
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.cal')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-label')).toBeTruthy();
  });

  it('closes on Escape, which used to do nothing at all', () => {
    control.openAt('from');
    fixture.detectChanges();
    const panel = (fixture.nativeElement as HTMLElement).querySelector('.cal') as HTMLElement;
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(control.open()).toBe(false);
  });

  it('gives focus back to the pill that opened it', () => {
    const pill = (fixture.nativeElement as HTMLElement).querySelector('.pill.from') as HTMLElement;
    pill.focus();
    control.openAt('from');
    fixture.detectChanges();
    control.close();
    fixture.detectChanges();
    expect(document.activeElement).toBe(pill);
  });
});

describe('DateRangeControl, in the module’s own words', () => {
  async function mount(words?: { t: (key: string) => string; isRtl: () => boolean }) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DateRangeControl],
      providers: [
        provideZonelessChangeDetection(),
        ...(words ? [{ provide: SHELL_WORDS, useValue: words }] : []),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DateRangeControl);
    fixture.componentRef.setInput('range', { from: null, to: null });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('speaks the CRM’s English when the module passes no words at all', async () => {
    const el = await mount();
    expect(el.querySelector('.pill.from')?.textContent).toContain('Start Date');
    expect(el.querySelector('.pill.to')?.textContent).toContain('End Date');
  });

  it('draws an Arabic calendar in Arabic words and Western digits, from its own words', async () => {
    // A module that knows no `cal.*` key: every lookup answers the key back.
    const el = await mount({ t: (key) => key, isRtl: () => true });
    el.querySelector<HTMLButtonElement>('.pill.from')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    const text = el.textContent ?? '';
    expect(text).toContain('تاريخ البداية');
    expect(text).toContain('آخر 7 أيام');
    expect(text).not.toMatch(/[\u0660-\u0669]/);
  });

  it('lets the module’s own word win over the control’s', async () => {
    const el = await mount({
      t: (key) => (key === 'cal.startDate' ? 'From' : key),
      isRtl: () => false,
    });
    expect(el.querySelector('.pill.from')?.textContent).toContain('From');
    expect(el.querySelector('.pill.to')?.textContent).toContain('End Date');
  });
});

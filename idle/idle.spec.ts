import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SHELL_WORDS } from '../words';
import { IdleWarning, IdleWarningNotice } from './idle';

describe('IdleWarning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    TestBed.inject(IdleWarning).clear();
    vi.useRealTimers();
  });

  it('counts the warning down to zero', () => {
    const idle = TestBed.inject(IdleWarning);
    idle.warn(60, () => undefined);
    expect(idle.left()).toBe(60);
    vi.advanceTimersByTime(15_000);
    expect(idle.left()).toBe(45);
    vi.advanceTimersByTime(60_000);
    expect(idle.left()).toBe(0);
  });

  it('"Stay signed in" runs the module\'s stay once and closes', () => {
    const idle = TestBed.inject(IdleWarning);
    const stay = vi.fn();
    idle.warn(30, stay);
    idle.stay();
    idle.stay();
    expect(stay).toHaveBeenCalledTimes(1);
    expect(idle.left()).toBeNull();
  });

  it('activity clears it without staying', () => {
    const idle = TestBed.inject(IdleWarning);
    const stay = vi.fn();
    idle.warn(30, stay);
    idle.clear();
    expect(idle.left()).toBeNull();
    expect(stay).not.toHaveBeenCalled();
  });
});

describe('IdleWarningNotice', () => {
  const render = (rtl: boolean) => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SHELL_WORDS, useValue: { t: (k: string) => k, isRtl: () => rtl } },
      ],
    });
    const fixture = TestBed.createComponent(IdleWarningNotice);
    return { fixture, idle: TestBed.inject(IdleWarning) };
  };
  afterEach(() => TestBed.inject(IdleWarning).clear());

  it('shows nothing until warned', async () => {
    const { fixture } = render(false);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.idlewarn')).toBeNull();
  });

  it("speaks the reader's language with the seconds left", async () => {
    const { fixture, idle } = render(true);
    idle.warn(45, () => undefined);
    await fixture.whenStable();
    const text = fixture.nativeElement.querySelector('.idlewarn').textContent;
    expect(text).toContain('بسبب عدم النشاط');
    expect(text).toContain('45');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain(
      'البقاء مسجّل الدخول',
    );
  });
});

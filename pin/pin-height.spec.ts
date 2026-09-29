import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PinHeight } from './pin-height';

/**
 * What can honestly be tested here, and what cannot.
 *
 * jsdom does no layout: `offsetHeight` is 0 for everything, and it has no
 * `ResizeObserver` at all. So the MEASUREMENT cannot be proved in a spec — it
 * was proved in a browser, against the CEO portal's own production build, at
 * 1456 and 390 in both languages.
 *
 * What these do prove is the part a spec can reach and a browser check would
 * not notice: that the directive is safe where it cannot work. It must not
 * throw without `ResizeObserver`, must not write `--pin-h: 0px` — which would
 * be worse than writing nothing, because it would override a sound fallback
 * and hide every column head behind its bar — and must let go of the observer
 * when the screen does.
 *
 * A fake `ResizeObserver` is installed for the second half. It is a fake of the
 * BROWSER, not of the directive: it records what was observed and disconnected
 * and lets the spec fire a callback by hand, so the assertions are about what
 * the directive does with a size, not about the timing of a real one.
 */
@Component({
  imports: [PinHeight],
  template: `<div class="host"><div class="bar" appPinHeight>filters</div></div>`,
})
class Screen {}

class FakeResizeObserver {
  static made: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = 0;
  constructor(readonly fire: () => void) {
    FakeResizeObserver.made.push(this);
  }
  observe(element: Element): void {
    this.observed.push(element);
  }
  disconnect(): void {
    this.disconnected += 1;
  }
}

/**
 * Take `ResizeObserver` off the global, or put one back.
 *
 * Through `Reflect` rather than `delete globalThis.ResizeObserver`, which
 * TypeScript refuses: the DOM library declares it as always present, and this
 * spec's whole first case is a browser where it is not.
 */
function setResizeObserver(value: unknown): void {
  if (value === undefined) Reflect.deleteProperty(globalThis, 'ResizeObserver');
  else Reflect.set(globalThis, 'ResizeObserver', value);
}

function getResizeObserver(): unknown {
  return Reflect.get(globalThis, 'ResizeObserver');
}

function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Screen);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: el.querySelector<HTMLElement>('.host')!,
    bar: el.querySelector<HTMLElement>('.bar')!,
  };
}

describe('appPinHeight, where it cannot measure', () => {
  it('does not throw, and writes nothing, without a ResizeObserver', () => {
    const had = getResizeObserver();
    setResizeObserver(undefined);
    try {
      const { host } = mount();
      // Nothing at all: the screen's own fallback is what holds, and a
      // `--pin-h: 0px` written here would override it and put every head
      // behind its bar.
      expect(host.getAttribute('style')).toBeNull();
    } finally {
      setResizeObserver(had);
    }
  });
});

describe('appPinHeight, with a fake browser', () => {
  let had: unknown;

  beforeEach(() => {
    FakeResizeObserver.made = [];
    had = getResizeObserver();
    setResizeObserver(FakeResizeObserver);
  });

  afterEach(() => setResizeObserver(had));

  it('watches the bar itself, never the host', () => {
    // The host is often `display: contents` and has no box, so an observer on
    // it would fire once and never again.
    const { bar } = mount();
    expect(FakeResizeObserver.made.length).toBe(1);
    expect(FakeResizeObserver.made[0].observed).toEqual([bar]);
  });

  it('writes the bar’s height onto the bar’s parent, rounded', () => {
    const { host, bar } = mount();
    Object.defineProperty(bar, 'offsetHeight', { value: 48.6, configurable: true });
    FakeResizeObserver.made[0].fire();
    expect(host.style.getPropertyValue('--pin-h')).toBe('49px');
  });

  it('follows the bar when it wraps, rather than keeping the first reading', () => {
    // The whole reason this is an observer: the bar grows when the language
    // changes or the window crosses the wrap point, with no re-render.
    const { host, bar } = mount();
    Object.defineProperty(bar, 'offsetHeight', { value: 49, configurable: true });
    FakeResizeObserver.made[0].fire();
    expect(host.style.getPropertyValue('--pin-h')).toBe('49px');
    Object.defineProperty(bar, 'offsetHeight', { value: 88, configurable: true });
    FakeResizeObserver.made[0].fire();
    expect(host.style.getPropertyValue('--pin-h')).toBe('88px');
  });

  it('lets go when the screen does', () => {
    const { fixture } = mount();
    expect(FakeResizeObserver.made[0].disconnected).toBe(0);
    fixture.destroy();
    expect(FakeResizeObserver.made[0].disconnected).toBe(1);
  });
});

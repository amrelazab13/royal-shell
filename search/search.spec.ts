import { DestroyRef } from '@angular/core';

import { debounce } from './debounce';
import { FOLD_CASES, fold, matches } from './fold';
import { Latest } from './latest';

describe('fold', () => {
  for (const [typed, folded] of Object.entries(FOLD_CASES)) {
    it(`folds ${JSON.stringify(typed)} to ${JSON.stringify(folded)}`, () => {
      expect(fold(typed)).toBe(folded);
    });
  }

  it('finds أحمد when the reader types the plain alef', () => {
    expect(matches(['أحمد علي'], 'احمد')).toBe(true);
  });

  it('a word-final ة finds its ه twin, and the other way round', () => {
    expect(matches(['فاطمة محمد'], 'فاطمه')).toBe(true);
    expect(matches(['فاطمه محمد'], 'فاطمة')).toBe(true);
  });

  it('a mid-word ة is left alone', () => {
    expect(fold('ةا')).toBe('ةا');
  });

  it('every word must appear, in any field', () => {
    expect(matches(['Ahmed Ali', 'Sales'], 'ahmed sales')).toBe(true);
    expect(matches(['Ahmed Ali', 'Sales'], 'ahmed finance')).toBe(false);
    expect(matches(['anything'], '   ')).toBe(true);
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once, with the last arguments, after the calls stop', () => {
    const seen: string[] = [];
    const run = debounce(300, (q: string) => seen.push(q));
    run('a');
    run('ab');
    vi.advanceTimersByTime(299);
    expect(seen).toEqual([]);
    run('abc');
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(['abc']);
  });

  it('a pending call is dropped when its owner is destroyed', () => {
    let destroy = () => {};
    const ref = { onDestroy: (fn: () => void) => (destroy = fn) } as unknown as DestroyRef;
    const seen: string[] = [];
    const run = debounce(300, (q: string) => seen.push(q), ref);
    run('left the page');
    destroy();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });
});

describe('Latest', () => {
  it('only the newest question is current', () => {
    const latest = new Latest();
    const first = latest.next();
    const second = latest.next();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
  });
});

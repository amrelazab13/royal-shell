import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { NeedsAnswer, needsCount, needsLabel, needsState } from './needs';

const items = [
  { key: 'leads.overdue', count: 3 },
  { key: 'leads.today', count: 2 },
  { key: 'leadsx', count: 7 },
  { key: 'approvals', count: 1 },
];

describe('needsCount', () => {
  it('sums a rail item from everything under it', () => {
    expect(needsCount(items, 'leads')).toBe(5);
  });

  it('counts a tab on its own', () => {
    expect(needsCount(items, 'leads.overdue')).toBe(3);
  });

  it('never counts a key that only starts with the same letters', () => {
    // `leadsx` is not under `leads`.
    expect(needsCount([{ key: 'leadsx', count: 7 }], 'leads')).toBe(0);
  });

  it('never shows a server bug as a count', () => {
    expect(
      needsCount(
        [
          { key: 'a', count: -2 },
          { key: 'a.b', count: Number.NaN },
          { key: 'a.c', count: 2.7 },
        ],
        'a',
      ),
    ).toBe(2);
  });
});

describe('needsLabel', () => {
  it('draws nothing for nothing, and caps at 99+', () => {
    expect(needsLabel(0)).toBe('');
    expect(needsLabel(1)).toBe('1');
    expect(needsLabel(99)).toBe('99');
    expect(needsLabel(100)).toBe('99+');
  });
});

describe('needsState', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('asks on start, a failed ask keeps the last counts, and a resolved item goes', async () => {
    const answers: Array<NeedsAnswer | Error> = [
      { as_of: 'A', items: [{ key: 'leads.overdue', count: 3 }] },
      new Error('offline'),
      { as_of: 'C', items: [] },
    ];
    let asked = 0;
    const needs = TestBed.runInInjectionContext(() =>
      needsState(() => {
        asked++;
        const next = answers.shift()!;
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      }, 60_000),
    );
    // Asked while the first ask is still travelling: it asks once more after
    // it, because that answer may predate what the person just resolved.
    await needs.refresh();
    expect(asked).toBe(2);
    // The second ask failed (offline): the counts from the first stay.
    expect(needs.count('leads')).toBe(3);
    expect(needs.asOf()).toBe('A');

    // Resolved on the server: the count goes, without anybody "seeing" it.
    await needs.refresh();
    expect(asked).toBe(3);
    expect(needs.count('leads')).toBe(0);
    expect(needs.asOf()).toBe('C');
  });
});

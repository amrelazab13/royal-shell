import { describe, expect, it } from 'vitest';
import { narrow } from './narrow';

/** No always-shown person, said at the call rather than defaulted. */
const NOBODY = { always: () => false };

interface Person {
  id: string;
  reports?: Person[];
}

/** a → b → c → d, plus a second branch a → e. */
const tree = (): Person[] => [
  {
    id: 'a',
    reports: [{ id: 'b', reports: [{ id: 'c', reports: [{ id: 'd' }] }] }, { id: 'e' }],
  },
];

const ids = (nodes: Person[]): string[] => nodes.flatMap((n) => [n.id, ...ids(n.reports ?? [])]);
const find = (nodes: Person[], id: string): Person | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const deeper = find(n.reports ?? [], id);
    if (deeper) return deeper;
  }
  return undefined;
};

describe('narrow', () => {
  it('keeps everybody when `keep` admits everybody', () => {
    expect(ids(narrow(tree(), () => true, NOBODY)).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('LIFTS a hidden manager’s reports to the nearest shown person above', () => {
    // `b` is hidden; `c` must hang under `a`, not vanish and not go to the root.
    const out = narrow(tree(), (n) => n.id !== 'b', NOBODY);
    expect(ids(out)).not.toContain('b');
    expect(
      find(out, 'a')!
        .reports!.map((n) => n.id)
        .sort(),
    ).toEqual(['c', 'e']);
  });

  it('lifts THROUGH SEVERAL hidden levels, not just one', () => {
    // The case a one-level implementation gets wrong: b AND c hidden, so d
    // must reach `a`. This is why children are narrowed before the parent is
    // decided.
    const out = narrow(tree(), (n) => n.id !== 'b' && n.id !== 'c', NOBODY);
    expect(
      find(out, 'a')!
        .reports!.map((n) => n.id)
        .sort(),
    ).toEqual(['d', 'e']);
  });

  it('promotes reports to the ROOT when every ancestor is hidden', () => {
    const out = narrow(tree(), (n) => n.id === 'd', NOBODY);
    expect(out.map((n) => n.id)).toEqual(['d']);
  });

  it('`always` overrides `keep` — rule 9, the owner is never hidden', () => {
    const out = narrow(tree(), () => false, { always: (n) => n.id === 'a' });
    expect(out.map((n) => n.id)).toEqual(['a']);
  });

  it('a kept-by-`always` node still carries its narrowed reports', () => {
    const out = narrow(tree(), (n) => n.id === 'd', { always: (n) => n.id === 'a' });
    expect(ids(out)).toEqual(['a', 'd']);
  });

  it('NEVER MUTATES the input', () => {
    // The chart a module holds is often a signal's value; narrowing it for one
    // module's view must not rewrite the book's own copy.
    const original = tree();
    const snapshot = JSON.stringify(original);
    narrow(original, (n) => n.id === 'a', NOBODY);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('handles a node with no `reports` key at all', () => {
    expect(narrow([{ id: 'x' }], () => true, NOBODY)).toEqual([{ id: 'x', reports: [] }]);
  });
});

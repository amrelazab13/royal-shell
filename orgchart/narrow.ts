/**
 * Show only some people, without breaking the lines above them.
 *
 * **The owner's rule 9** (5 Oct 2026): every module shows HR's org chart
 * "narrowed to its own people" — only those whose door to THAT module is
 * open — and "somebody whose manager is not shown hangs under the nearest
 * shown person above them". **The owner is always in every module's chart**
 * ("Always shown"), by his name and HR title.
 *
 * **Why this lives in royal-shell and not in each module.** Every consumer
 * needs the LIFT identically, and the lift is the only part that is easy to
 * get wrong: dropping a manager must not drop their reports, and must not
 * leave them at the root either — they belong under whoever is still shown
 * above them, however many levels that is. A module that re-implemented it
 * would draw a chart that looks right until somebody mid-tree is hidden.
 *
 * **`always` is separate from `keep` on purpose.** The shared half cannot
 * know who the owner is — that is an identity question each module answers
 * (HR's `wearsCrown`, a server flag) — but rule 9 is not optional, so it is a
 * named argument rather than something a consumer is trusted to OR into
 * `keep` and might forget. A caller passing no `always` gets a chart that can
 * omit him, which rule 9 forbids; the docstring says so here because the
 * compiler cannot.
 */
/**
 * A node that may have reports of its OWN type — self-referential on purpose.
 *
 * `reports?: Lineage[]` would type the children as the base rather than as
 * `T`, so the recursive call needs a cast — and a cast is exactly where this
 * silently stops being type-checked. `T extends Tree<T>` keeps the children
 * the same type as the parent and the recursion needs no cast at all.
 */
export interface Tree<T> {
  id: string;
  reports?: T[];
}

export interface NarrowOptions<T> {
  /**
   * Kept whatever `keep` says: rule 9's "the owner is always shown". REQUIRED,
   * so no module can build a chart that silently omits him (a module with no
   * such person passes `() => false` and says so at the call).
   */
  always: (node: T) => boolean;
}

/**
 * The people `keep` admits, with everyone else's reports lifted to the
 * nearest kept ancestor. The input is never mutated: each kept node is
 * copied with its narrowed `reports`.
 */
export function narrow<T extends Tree<T>>(
  nodes: readonly T[],
  keep: (node: T) => boolean,
  options: NarrowOptions<T>,
): T[] {
  const { always } = options;
  const out: T[] = [];
  for (const node of nodes) {
    // Narrow the children FIRST, so a dropped node splices in children that
    // are themselves already narrowed. That is what makes the lift reach the
    // nearest shown ancestor rather than only one level up: three hidden
    // managers in a row still land their reports on the fourth.
    const kids = narrow(node.reports ?? [], keep, options);
    if (keep(node) || always(node)) {
      out.push({ ...node, reports: kids } as T);
    } else {
      out.push(...kids);
    }
  }
  return out;
}

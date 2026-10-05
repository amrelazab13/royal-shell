import { DestroyRef, Signal, inject, signal } from '@angular/core';

/**
 * "What needs me": the red counters that lead a person to the thing they
 * must act on (the owner, 27 Sep 2026: "each tab in the side bar includes a
 * notification has a red counter ... and when i open the tap another red dot
 * appear where i should go to resolve this notification, and so on").
 *
 * The rules (bible §3.7):
 * - Red counts only what the person MUST act on. News and FYI stay in the bell.
 * - The count is exact: the number opens a list showing exactly that many.
 * - It clears when the thing is RESOLVED, never when it is looked at. The
 *   server computes the counts from the data every time; nothing here
 *   remembers "seen".
 * - A trail: the rail item, then the tab or section, then the filter chip,
 *   then the row, each with its own count or dot.
 *
 * The module's server answers one call, `GET <api>/needs-me/`:
 *
 *     { "as_of": "2026-09-27T21:04:00+03:00",
 *       "items": [ { "key": "leads.overdue", "count": 3 },
 *                  { "key": "leads.today", "count": 2 } ] }
 *
 * A key is a path of the trail, dot-separated: the first part is the rail
 * item, the next the tab or section, the next the chip. The rail's `leads`
 * shows 5 (the sum of everything under it), the `overdue` tab shows 3. A row
 * is marked by the list endpoint itself (`needs_me: true` on the row), so the
 * row's dot and the list's count come from the same query.
 */
export interface NeedsItem {
  key: string;
  count: number;
  /** The server's own words for this item, in the reader's language. Optional:
   *  a module that sends it lets a screen draw a chip without a dictionary
   *  entry of its own (Mobile CRM, 5 Oct 2026). Only the CRM sends it today. */
  title?: string;
  /** Where the number leads: the list that shows exactly `count` rows, as a
   *  route and its query (the CRM sends `{ path: "/leads", query: {...} }`:
   *  "the query IS the link"). The trail rule (bible §3.7) is that the number
   *  opens what it counted. Optional: today only the CRM sends it (measured
   *  5 Oct 2026; HR and the portal send key and count alone), so read it
   *  defensively. */
  link?: { path: string; query?: Record<string, string | number | boolean> };
}

export interface NeedsAnswer {
  as_of: string;
  items: NeedsItem[];
}

/** The total under `path`: the key itself and everything below it. */
export function needsCount(items: readonly NeedsItem[], path: string): number {
  let total = 0;
  for (const item of items) {
    if (item.key === path || item.key.startsWith(path + '.')) {
      // A negative or fractional count is a server bug; never show it as one.
      total += Number.isFinite(item.count) && item.count > 0 ? Math.floor(item.count) : 0;
    }
  }
  return total;
}

/** What the counter reads: nothing for 0, "99+" above 99. */
export function needsLabel(n: number): string {
  if (!(n > 0)) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}

export interface Needs {
  /** The last answer's items. Kept when a poll fails: a counter that
   *  vanishes because the network blinked is a worse answer than one half a
   *  minute old. */
  readonly items: Signal<readonly NeedsItem[]>;
  /** When the server last answered, or null before the first answer. */
  readonly asOf: Signal<string | null>;
  /** The live total under a path, for a template: `needs.count('leads')`. */
  count(path: string): number;
  /** Ask again now (after the person resolved something). */
  refresh(): Promise<void>;
}

/**
 * The state, polled. Call it in the shell component (an injection context):
 *
 *     readonly needs = needsState(() => firstValueFrom(this.http.get<NeedsAnswer>('/api/v1/needs-me/')));
 *
 * Asks on start, every `everyMs` while the tab is visible, when the tab comes
 * back into view, and on `refresh()`. Stops when the shell is destroyed.
 */
export function needsState(fetch: () => Promise<NeedsAnswer>, everyMs = 30_000): Needs {
  const items = signal<readonly NeedsItem[]>([]);
  const asOf = signal<string | null>(null);
  let inFlight: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    // One question at a time, so an old answer can never land on top of a
    // newer one. Asked again while one is on its way (the person just
    // resolved something), it asks ONCE more after it: the answer already
    // travelling may predate what they did.
    if (inFlight) {
      return (queued ??= inFlight.then(() => {
        queued = null;
        return refresh();
      }));
    }
    inFlight = fetch()
      .then((answer) => {
        items.set(Array.isArray(answer?.items) ? answer.items : []);
        asOf.set(answer?.as_of ?? null);
      })
      .catch(() => undefined)
      .finally(() => (inFlight = null));
    return inFlight;
  };

  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const timer = setInterval(() => visible() && void refresh(), everyMs);
  const onShow = () => visible() && void refresh();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onShow);
  inject(DestroyRef).onDestroy(() => {
    clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onShow);
  });
  void refresh();

  return {
    items: items.asReadonly(),
    asOf: asOf.asReadonly(),
    count: (path) => needsCount(items(), path),
    refresh,
  };
}

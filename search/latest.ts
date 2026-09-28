/**
 * Which question is currently being asked.
 *
 * A screen that fires a request per keystroke puts several in the air at
 * once, and without this whichever the server answered LAST won — a slower
 * answer to an abandoned query would put the wrong rows under the current
 * search with nothing on screen saying so. A list read from the server on
 * every change needs this; a list filtered in the browser from rows already
 * in hand does not, and a token there would guard nothing.
 *
 * One instance per independent question. Take a token before the request,
 * and drop the answer if the token is no longer current when it lands:
 *
 *     const token = this.latest.next();
 *     const page = await this.api.list(query);
 *     if (!this.latest.isCurrent(token)) return;
 *
 * The CRM's contract, shared from royal-shell since 28 Sep 2026.
 */
export class Latest {
  private seq = 0;

  /** A new question: everything asked before it is now stale. */
  next(): number {
    return ++this.seq;
  }

  /** Whether the answer to `token` is still the one being waited for. */
  isCurrent(token: number): boolean {
    return token === this.seq;
  }
}

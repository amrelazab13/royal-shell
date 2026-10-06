/**
 * The canvas as a COMPONENT, which is the whole point of step 1 (O-252).
 *
 * `chart.spec.ts` drives this through the page and is the proof that nothing
 * anybody can see changed in the extraction — 25 specs, unaltered, still
 * green. This file tests the thing the page cannot: the CONTRACT the
 * Permissions tab will hold it by.
 *
 * Two inputs and one output are that contract: the tree comes in, whether
 * this reader may move anybody comes in, and a move goes OUT rather than
 * being written. The tab passes `editable` false and never hears `moved`;
 * the chart page writes what it hears.
 *
 * PORTED FROM HR (O-368, 6 Oct 2026) with the component: every spec HR's
 * `org-chart.spec.ts` held is here, unchanged but for the providers (a fake
 * `SHELL_WORDS` instead of HR's `I18nService`) and the fixtures (HR's own,
 * copied in). The specs after HR's are what sharing added: the words, the
 * narrowing (`keep`), the always-shown person and the read-only chart.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SHELL_WORDS, ShellWords } from '../words';
import { CardMarks, Chart, ChartNode, Department, Move, OrgChart } from './org-chart';

/* ── fixtures: HR's own (`core/testing.ts`), carried here because a shared
   spec may import nothing of any module's ──────────────────────────────── */

/** A tick, then change detection, so a signal set late is painted. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

function person(extra: Partial<ChartNode> & { id: string }): ChartNode {
  return {
    full_name_en: '',
    full_name_ar: '',
    title_en: '',
    title_ar: '',
    department: 'sales',
    band: 'E2',
    band_name_en: 'Professional',
    band_name_ar: 'محترف',
    rank: 140,
    hat: null,
    is_key: false,
    line_in_question: '',
    reports: [],
    ...extra,
  };
}

/** HR's chart fixture: a director with one report, and a driver on the bench. */
function chart(): Chart {
  const ali = person({
    id: 'e1',
    full_name_en: 'Card Alpha',
    title_en: 'Senior Sales Consultant',
  });
  const dina = person({
    id: 'e2',
    full_name_en: 'Card Delta',
    title_en: 'Sales Director',
    band: 'D1',
    band_name_en: 'Director',
    band_name_ar: 'مدير',
    rank: 60,
    is_key: true,
    reports: [ali],
  });
  const driver = person({
    id: 'e3',
    full_name_en: 'Card Hotel',
    title_en: 'Driver',
    department: 'administration',
    band: 'A2',
    band_name_en: 'General Support',
    band_name_ar: '',
    rank: 170,
  });
  return { tree: [dina], reports_to_nobody: [driver] };
}

function department(extra: Partial<Department> = {}): Department {
  return { slug: 'sales', name_en: 'Sales', name_ar: 'المبيعات', ...extra };
}

/** A module whose words hold no `chart.*` key: `t` answers the key itself,
 *  so every word on the chart is the chart's own. */
const ENGLISH: ShellWords = { t: (key) => key, isRtl: () => false };

/** Nobody is always shown, said at the call (the always input is required). */
const NOBODY = () => false;

describe('OrgChart', () => {
  async function draw(editable = false, drawn: Chart | null = chart()) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [OrgChart],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: SHELL_WORDS, useValue: ENGLISH },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OrgChart);
    fixture.componentRef.setInput('always', NOBODY);
    fixture.componentRef.setInput('chart', drawn);
    fixture.componentRef.setInput('departments', [
      department({ slug: 'sales', name_en: 'Sales', name_ar: 'المبيعات' }),
    ]);
    fixture.componentRef.setInput('editable', editable);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** The same canvas, with the host asking for marks on each card. */
  async function decorated(
    marks: (node: ChartNode) => CardMarks,
    extra: { hint?: string } = {},
  ): Promise<{
    fixture: ComponentFixture<OrgChart>;
    el: HTMLElement;
    ticked: { person: ChartNode; on: boolean }[];
  }> {
    const { fixture, el } = await draw();
    const ticked: { person: ChartNode; on: boolean }[] = [];
    fixture.componentInstance.ticked.subscribe((e) => ticked.push(e));
    fixture.componentRef.setInput('decorate', marks);
    if (extra.hint !== undefined) fixture.componentRef.setInput('hint', extra.hint);
    await settle(fixture);
    return { fixture, el, ticked };
  }

  /** The tick on one person's card, found by the name beside it. */
  function tickOf(el: HTMLElement, name: string): HTMLInputElement | null {
    const card = [...el.querySelectorAll('.ocard')].find((c) =>
      (c.querySelector('.nm') as HTMLElement | null)?.textContent?.includes(name),
    );
    return (card?.querySelector('.tick input') as HTMLInputElement | null) ?? null;
  }

  function cardOf(el: HTMLElement, name: string): HTMLElement {
    const card = [...el.querySelectorAll('.ocard')].find((c) =>
      (c.querySelector('.nm') as HTMLElement | null)?.textContent?.includes(name),
    );
    if (!card) throw new Error(`no card for ${name}`);
    return card as HTMLElement;
  }

  it('draws the chart from an INPUT, with no fetching of its own', async () => {
    // No HttpTestingController expectations at all: the canvas asks the
    // network for nothing, which is what lets two screens host it.
    const { el } = await draw();
    expect(el.querySelectorAll('.ocard').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.bandline').length).toBeGreaterThan(0);
  });

  it('says it is loading when it has no chart yet', async () => {
    const { el } = await draw(false, null);
    expect(el.textContent).toContain('Loading');
    expect(el.querySelectorAll('.ocard').length).toBe(0);
  });

  it('is NOT draggable when the host says it may not edit', async () => {
    const { el } = await draw(false);
    for (const card of el.querySelectorAll('.ocard')) {
      expect(card.getAttribute('draggable')).not.toBe('true');
    }
  });

  it('IS draggable when the host says it may', async () => {
    const { el } = await draw(true);
    const draggable = [...el.querySelectorAll('.ocard')].filter(
      (c) => c.getAttribute('draggable') === 'true',
    );
    expect(draggable.length).toBeGreaterThan(0);
  });

  it('ASKS for a move rather than writing one', async () => {
    // The contract: the canvas emits, the host performs. The chart page
    // sends this to `book.updatePerson`; the Permissions tab never gets
    // here at all, because it passes `editable` false.
    const { fixture, el } = await draw(true);
    const moves: Move[] = [];
    fixture.componentInstance.moved.subscribe((m) => moves.push(m));

    // THE KEYBOARD PATH, which is the same two calls the mouse makes and is
    // the one jsdom can run: `DragEvent` does not exist there, which is why
    // the page's own suite reaches a move this way too.
    const pick = (text: string) => {
      const card = [...el.querySelectorAll<HTMLElement>('.ocard')].find((c) =>
        c.textContent?.includes(text),
      )!;
      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    };
    pick('Card Hotel');
    await settle(fixture);
    pick('Card Delta');
    await settle(fixture);

    expect(moves.length).toBe(1);
    expect(moves[0].manager).toBe('e2');
    expect(moves[0].person.full_name_en).toContain('Card Hotel');
  });

  it('folds and unfolds through its PUBLIC api, which the masthead drives', async () => {
    // The page's fold button reaches these through a template reference, so
    // they are public on purpose and a rename would break that silently.
    const { fixture, el } = await draw();
    const canvas = fixture.componentInstance;
    expect(typeof canvas.foldAll).toBe('function');
    expect(typeof canvas.allFolded).toBe('function');
    expect(typeof canvas.zoom).toBe('function');

    const open = el.querySelectorAll('.ocard').length;
    canvas.foldAll();
    await settle(fixture);
    expect(el.querySelectorAll('.ocard').length).toBeLessThan(open);
    expect(canvas.allFolded()).toBe(true);
    canvas.foldAll();
    await settle(fixture);
    expect(el.querySelectorAll('.ocard').length).toBe(open);
  });

  it('zooms through the public api and keeps the floor and the ceiling', async () => {
    const { fixture } = await draw();
    const canvas = fixture.componentInstance;
    canvas.zoom(-99);
    expect(canvas.scale()).toBe(canvas.minScale);
    canvas.zoom(99);
    expect(canvas.scale()).toBe(canvas.maxScale);
  });

  it('opens three levels deep the FIRST time and not again', async () => {
    // The fold that used to live beside the page's fetch. Once only: a
    // re-fold on every refresh would shut a branch the reader had opened.
    const { fixture, el } = await draw();
    const folded = el.querySelectorAll('.ocard').length;
    fixture.componentInstance.foldAll(); // open them all
    await settle(fixture);
    const opened = el.querySelectorAll('.ocard').length;
    // A new chart arriving must NOT re-fold what the reader just opened.
    fixture.componentRef.setInput('chart', chart());
    await settle(fixture);
    expect(el.querySelectorAll('.ocard').length).toBe(opened);
    expect(opened).not.toBe(folded);
  });

  /* ── O-252 Part 1, step 3: the marks the Permissions tab asks for ──────
     The canvas knows a person's band and reports; it does not know what
     the screen around it is for. These specs are the whole of what the tab
     may ask of it. */

  it('draws NO tick when the host asks for none, which is every other screen', async () => {
    const { el } = await decorated(() => ({}));
    expect(el.querySelectorAll('.tick').length).toBe(0);
    // And the chart page, which passes no `decorate` at all.
    const plain = await draw();
    expect(plain.el.querySelectorAll('.tick').length).toBe(0);
  });

  it('draws a tick per card, ON for whoever may open it', async () => {
    const { el } = await decorated((n) => ({ tick: n.id === 'e1' ? 'on' : 'off' }));
    expect(tickOf(el, 'Card Alpha')!.checked).toBe(true);
    expect(tickOf(el, 'Card Delta')!.checked).toBe(false);
    // The bench is people too, and his sentence says "everyone".
    expect(tickOf(el, 'Card Hotel')).not.toBeNull();
  });

  it('DIMS whoever may not open it, and never hides them', async () => {
    const { el } = await decorated((n) => ({ tick: 'off', dimmed: n.id !== 'e1' }));
    expect(cardOf(el, 'Card Delta').classList).toContain('dimmed');
    expect(cardOf(el, 'Card Alpha').classList).not.toContain('dimmed');
    // Still drawn, still reachable: ticking a dimmed card is how he grants.
    expect(tickOf(el, 'Card Delta')!.disabled).toBe(false);
  });

  it('says "edited" on a card whose door is not the default', async () => {
    const { el } = await decorated((n) => ({ tick: 'on', edited: n.id === 'e1' }));
    expect(cardOf(el, 'Card Alpha').classList).toContain('edited');
    expect(cardOf(el, 'Card Alpha').querySelector('.edited')!.textContent).toContain('edited');
    expect(cardOf(el, 'Card Delta').querySelector('.edited')).toBeNull();
  });

  it('ASKS for a tick rather than deciding one, with the INVERSE of what is held', async () => {
    const { el, ticked } = await decorated(() => ({ tick: 'off' }));
    tickOf(el, 'Card Alpha')!.click();
    expect(ticked.length).toBe(1);
    expect(ticked[0].person.id).toBe('e1');
    expect(ticked[0].on).toBe(true);
  });

  it('asks to CLOSE a door that is open', async () => {
    const { el, ticked } = await decorated(() => ({ tick: 'on' }));
    tickOf(el, 'Card Alpha')!.click();
    expect(ticked[0].on).toBe(false);
  });

  it('draws a disabled tick for a reader who may not press, and never hides it', async () => {
    // A-128: HR's three SEE who holds the door and cannot change it. A
    // hidden tick would hide the answer along with the power.
    const { el, ticked } = await decorated(() => ({ tick: 'on', tickDisabled: true }));
    const box = tickOf(el, 'Card Alpha')!;
    expect(box).not.toBeNull();
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    // And a synthesised press on it asks for nothing.
    box.dispatchEvent(new Event('click', { bubbles: true }));
    expect(ticked.length).toBe(0);
  });

  it('puts a disabled box BACK when something presses it anyway', async () => {
    // The guard is asked of `marks`, not of the box, so a click dispatched
    // past `disabled` cannot leave the screen showing a door nobody opened.
    const { el, ticked } = await decorated(() => ({ tick: 'off', tickDisabled: true }));
    const box = tickOf(el, 'Card Alpha')!;
    box.checked = true;
    box.dispatchEvent(new Event('click', { bubbles: true }));
    expect(ticked.length).toBe(0);
    expect(box.checked).toBe(false);
  });

  it('keeps the chart page\u2019s own hint when the host says nothing', async () => {
    const { el } = await draw(true);
    expect(el.querySelector('.notice')!.textContent).toContain('Drag somebody');
  });

  it('takes the host\u2019s hint when it is given one', async () => {
    const { el } = await decorated(() => ({}), { hint: 'Tick a card to open the CRM' });
    expect(el.querySelector('.notice')!.textContent).toContain('Tick a card to open the CRM');
    expect(el.querySelector('.notice')!.textContent).not.toContain('Drag somebody');
  });

  it('asks the host AGAIN when its answer changes, rather than once at build', async () => {
    // The fault written down as "a value read once at the wrong moment": a
    // map handed in would be read when the cards were built and then go
    // stale, so the tick would never follow the server's answer.
    const { fixture, el } = await decorated(() => ({ tick: 'off' }));
    expect(tickOf(el, 'Card Alpha')!.checked).toBe(false);
    fixture.componentRef.setInput('decorate', () => ({ tick: 'on' }) as CardMarks);
    await settle(fixture);
    expect(tickOf(el, 'Card Alpha')!.checked).toBe(true);
  });

  it('a tick never moves anybody, whatever the host allows', async () => {
    // The tab passes `editable` false; this proves the two are separate
    // powers even when a screen holds both.
    const { fixture, el } = await draw(true);
    const moves: Move[] = [];
    fixture.componentInstance.moved.subscribe((m) => moves.push(m));
    fixture.componentRef.setInput('decorate', () => ({ tick: 'off' }) as CardMarks);
    await settle(fixture);
    tickOf(el, 'Card Alpha')!.click();
    expect(moves.length).toBe(0);
  });

  /* ── O-252 Part 2: a card that opens a panel ──────────────────────────── */

  it('leaves the name a LINK on the chart page, which does not open a panel', async () => {
    const { el } = await draw();
    const name = el.querySelector('.ocard .nm')!;
    expect(name.tagName.toLowerCase()).toBe('a');
    expect(name.getAttribute('href')).toContain('/people/');
  });

  it('makes the name PLAIN TEXT where a card opens a panel', async () => {
    // One click on a link would navigate away before the second arrived, so
    // the tab's cards carry no link at all.
    const { fixture, el } = await draw();
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    const name = el.querySelector('.ocard .nm')!;
    expect(name.tagName.toLowerCase()).toBe('span');
    expect(el.querySelectorAll('.ocard a.nm').length).toBe(0);
  });

  it('ASKS to open on a SINGLE press, naming the person', async () => {
    const { fixture, el } = await draw();
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    // A SINGLE click since 5 Oct 2026 (the owner: "ticking only opens, but
    // clicking on the card it self opens the permissions"). It was a
    // double-click, and this test asserted that.
    cardOf(el, 'Card Alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened.map((n) => n.id)).toEqual(['e1']);
  });

  it('opens from the KEYBOARD too, with Enter on the card', async () => {
    const { fixture, el } = await draw();
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    const card = cardOf(el, 'Card Delta');
    expect(card.getAttribute('tabindex')).toBe('0');
    expect(card.getAttribute('role')).toBe('button');
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(opened.map((n) => n.id)).toEqual(['e2']);
  });

  it('opens from the BENCH as well — it is people too', async () => {
    const { fixture, el } = await draw();
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    cardOf(el, 'Card Hotel').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(opened.map((n) => n.id)).toEqual(['e3']);
  });

  it('opens NOTHING when the host did not ask for it', async () => {
    const { fixture, el } = await draw();
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    await settle(fixture);
    cardOf(el, 'Card Alpha').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(opened.length).toBe(0);
  });

  /* ── O-351: the wheel is the PAGE's, the chart moves by dragging ────────── */

  /** A press, a move and a release on the frame, as a pointer would. */
  function dragOn(target: EventTarget, from: [number, number], to: [number, number]): void {
    const opts = { bubbles: true, pointerId: 1, pointerType: 'mouse' } as PointerEventInit;
    target.dispatchEvent(
      new PointerEvent('pointerdown', { ...opts, clientX: from[0], clientY: from[1] }),
    );
    target.dispatchEvent(
      new PointerEvent('pointermove', { ...opts, clientX: to[0], clientY: to[1] }),
    );
    target.dispatchEvent(
      new PointerEvent('pointerup', { ...opts, clientX: to[0], clientY: to[1] }),
    );
  }

  it('A PLAIN WHEEL OVER THE CHART IS LEFT TO THE PAGE', async () => {
    const { el } = await draw();
    const wrap = el.querySelector('.canvaswrap')!;
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 });
    wrap.dispatchEvent(wheel);
    // Not consumed: the browser is free to scroll the page with it. The owner,
    // 5 Oct 2026: "the scroll from mouse or trackpad is only for the page not
    // the org chart".
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('but ctrl + wheel is still the PINCH, and is consumed', async () => {
    const { el } = await draw();
    const wrap = el.querySelector('.canvaswrap')!;
    const pinch = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
      ctrlKey: true,
    });
    wrap.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
  });

  it('the frame does not SCROLL ITSELF: no overflow for the wheel to eat', async () => {
    // The fault was CSS, not a handler — `overflow: auto` with
    // `overscroll-behavior: contain` is "eat the scroll and pass none on".
    // Asserted on the class so a future tidy-up cannot put it back unseen;
    // jsdom applies no stylesheet, so the computed value cannot be read here.
    const { el } = await draw();
    expect(el.querySelector('.canvaswrap')).not.toBeNull();
    const css = OrgChart as unknown as { ɵcmp?: { styles?: string[] } };
    const styles = (css.ɵcmp?.styles ?? []).join(' ').replace(/\s+/g, '');
    // Whitespace stripped: the compiled sheet keeps the author's spacing, and
    // a test that depends on `overflow: hidden` vs `overflow:hidden` is a test
    // about a formatter.
    expect(styles).toContain('.canvaswrap');
    expect(styles).toContain('overflow:hidden');
    expect(styles).not.toContain('overscroll-behavior:contain');
    expect(styles).not.toContain('overflow:auto');
  });

  it('A DRAG IN EMPTY SPACE DOES NOT OPEN A CARD, even released over one', async () => {
    const { fixture, el } = await draw();
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    const wrap = el.querySelector('.canvaswrap')!;
    // Press on empty space, travel well past the slop, then let go — and the
    // click the browser sends afterwards lands on a card.
    wrap.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 10,
        clientY: 10,
      }),
    );
    wrap.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 90,
        clientY: 40,
      }),
    );
    wrap.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 90,
        clientY: 40,
      }),
    );
    cardOf(el, 'Card Alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened).toEqual([]);
  });

  it('a press that barely moves is still a CLICK and opens the card', async () => {
    const { fixture, el } = await draw();
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    const wrap = el.querySelector('.canvaswrap')!;
    // Two pixels of shake: a hand, not a drag.
    dragOn(wrap, [10, 10], [12, 11]);
    cardOf(el, 'Card Alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened.map((n) => n.id)).toEqual(['e1']);
  });

  it('A CARD IS NEVER A PAN HANDLE: dragging one does not move the chart', async () => {
    // The owner, 5 Oct 2026: "scrolling the org chart is dragging in empty
    // space, dragging a card moves the card". So a press that begins on a
    // card never pans — not even a card nobody may move.
    const { fixture, el } = await draw();
    const wrap = el.querySelector('.canvaswrap') as HTMLElement;
    let written = 0;
    Object.defineProperty(wrap, 'scrollLeft', {
      configurable: true,
      get: () => 0,
      set: () => {
        written += 1;
      },
    });
    await settle(fixture);
    dragOn(cardOf(el, 'Card Alpha'), [10, 10], [120, 60]);
    expect(written).toBe(0);
  });

  it('a drag in EMPTY SPACE does move the chart', async () => {
    const { fixture, el } = await draw();
    const wrap = el.querySelector('.canvaswrap') as HTMLElement;
    const written: number[] = [];
    Object.defineProperty(wrap, 'scrollLeft', {
      configurable: true,
      get: () => 0,
      set: (v: number) => {
        written.push(v);
      },
    });
    await settle(fixture);
    dragOn(wrap, [100, 50], [40, 50]);
    // Dragging left shows what is to the right: the content follows the hand.
    expect(written.length).toBeGreaterThan(0);
    expect(written[0]).toBe(60);
  });

  /* ── O-351: the tick box and the card are different targets ─────────────── */

  it('A CLICK ON THE TICK BOX DOES NOT ALSO OPEN THE CARD', async () => {
    const { fixture, el, ticked } = await decorated(() => ({ tick: 'off' }));
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    tickOf(el, 'Card Alpha')!.click();
    expect(ticked.map((t) => t.on)).toEqual([true]);
    expect(opened).toEqual([]);
  });

  it('SPACE ON A CARD TOGGLES THE BOX, and does not open the panel', async () => {
    const { fixture, el, ticked } = await decorated(() => ({ tick: 'off' }));
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    cardOf(el, 'Card Alpha').dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
    );
    expect(ticked.map((t) => t.on)).toEqual([true]);
    expect(opened).toEqual([]);
  });

  it('space does NOT toggle a box that is not his to press', async () => {
    const { fixture, el, ticked } = await decorated(() => ({ tick: 'off', tickDisabled: true }));
    await settle(fixture);
    cardOf(el, 'Card Alpha').dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
    );
    expect(ticked).toEqual([]);
  });

  it('A DOUBLE CLICK NEVER TOGGLES THE DOOR TWICE', async () => {
    // A double-click is two clicks, and a click on the CARD only opens the
    // panel — the door moves on the box alone.
    const { fixture, el, ticked } = await decorated(() => ({ tick: 'off' }));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    const card = cardOf(el, 'Card Alpha');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(ticked).toEqual([]);
  });
});

/* ── O-368: what sharing added ──────────────────────────────────────────── */

describe('OrgChart, shared', () => {
  interface Mount {
    words?: ShellWords | null;
    chart?: Chart | null;
    keep?: (node: ChartNode) => boolean;
    always?: (node: ChartNode) => boolean;
    editable?: boolean;
    decorate?: (node: ChartNode) => CardMarks;
  }

  async function mount(opts: Mount = {}) {
    TestBed.resetTestingModule();
    const words = opts.words === undefined ? ENGLISH : opts.words;
    await TestBed.configureTestingModule({
      imports: [OrgChart],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        ...(words ? [{ provide: SHELL_WORDS, useValue: words }] : []),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OrgChart);
    fixture.componentRef.setInput('always', opts.always ?? NOBODY);
    if (opts.keep) fixture.componentRef.setInput('keep', opts.keep);
    if (opts.decorate) fixture.componentRef.setInput('decorate', opts.decorate);
    fixture.componentRef.setInput('editable', opts.editable ?? false);
    fixture.componentRef.setInput('chart', opts.chart === undefined ? chart() : opts.chart);
    fixture.componentRef.setInput('departments', [department()]);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** The names drawn on the canvas (not the bench), in DOM order. */
  function canvasNames(el: HTMLElement): string[] {
    return [...el.querySelectorAll('.canvas .ocard .nm')].map((n) => n.textContent!.trim());
  }
  function benchNames(el: HTMLElement): string[] {
    return [...el.querySelectorAll('.bench .ocard .nm')].map((n) => n.textContent!.trim());
  }
  function cardNamed(el: HTMLElement, name: string): HTMLElement {
    const card = [...el.querySelectorAll<HTMLElement>('.ocard')].find((c) =>
      c.querySelector('.nm')?.textContent?.includes(name),
    );
    if (!card) throw new Error(`no card for ${name}`);
    return card;
  }

  /**
   * A chairman over a director over a manager over an agent — three levels
   * below the top, so hiding the two in the middle is a lift of TWO levels.
   * Role words, not people.
   */
  function company(): Chart {
    const agent = person({ id: 'agent', full_name_en: 'Card Agent', rank: 140 });
    const manager = person({
      id: 'manager',
      full_name_en: 'Card Manager',
      band: 'M1',
      rank: 100,
      reports: [agent],
    });
    const director = person({
      id: 'director',
      full_name_en: 'Card Director',
      band: 'D1',
      rank: 60,
      reports: [manager],
    });
    const chair = person({
      id: 'chair',
      full_name_en: 'Card Chair',
      band: 'B1',
      rank: 10,
      hat: 'chair',
      reports: [director],
    });
    return { tree: [chair], reports_to_nobody: [] };
  }

  /* ── the words ── */

  it('speaks its OWN words when the module has none, in English', async () => {
    const { el } = await mount({ chart: null });
    expect(el.textContent).toContain('Loading…');
  });

  it('speaks its own ARABIC when the page reads right to left', async () => {
    const { el } = await mount({ chart: null, words: { t: (k) => k, isRtl: () => true } });
    expect(el.textContent).toContain('جارٍ التحميل…');
  });

  it('asks the MODULE first, and the module’s word wins', async () => {
    const { el } = await mount({
      chart: null,
      words: { t: (k) => (k === 'common.loading' ? 'One moment' : k), isRtl: () => false },
    });
    expect(el.textContent).toContain('One moment');
    expect(el.textContent).not.toContain('Loading…');
  });

  it('never trusts a module whose `t` throws on a key it does not hold', async () => {
    const { el } = await mount({
      chart: null,
      words: {
        t: () => {
          throw new Error('unknown key');
        },
        isRtl: () => false,
      },
    });
    expect(el.textContent).toContain('Loading…');
  });

  it('with no module words at all, the page’s own direction decides', async () => {
    document.documentElement.dir = 'rtl';
    try {
      const { el } = await mount({ chart: null, words: null });
      expect(el.textContent).toContain('جارٍ التحميل…');
    } finally {
      document.documentElement.dir = '';
    }
  });

  it('names people in ARABIC SCRIPT on an Arabic page, and in English where none is held', async () => {
    const drawn = chart();
    // Not people: "Agent Alpha" and "Director Beta", in Arabic script.
    drawn.tree[0].full_name_ar = 'المدير بيتا';
    drawn.tree[0].reports[0].full_name_ar = 'الوكيل ألفا';
    const { el } = await mount({ chart: drawn, words: { t: (k) => k, isRtl: () => true } });
    expect(canvasNames(el)).toEqual(expect.arrayContaining(['المدير بيتا', 'الوكيل ألفا']));
    // The bench driver holds no Arabic name: HR's `pick` falls back to English.
    expect(benchNames(el)).toEqual(['Card Hotel']);
    expect(el.querySelector('.ocard .dp')!.textContent).toContain('المبيعات');
  });

  /* ── keep: only this module's people ── */

  it('draws only the people `keep` admits', async () => {
    // The director, not the agent: the agent starts folded away (three
    // levels open), so hiding it would pass with no narrowing at all.
    const { el } = await mount({
      chart: company(),
      keep: (n) => n.id !== 'director',
    });
    expect(canvasNames(el)).not.toContain('Card Director');
    expect(canvasNames(el)).toEqual(expect.arrayContaining(['Card Chair', 'Card Manager']));
  });

  it('A HIDDEN MANAGER’S PEOPLE HANG UNDER THE NEAREST SHOWN PERSON ABOVE', async () => {
    // Director and manager hidden: the agent is lifted two levels, onto the
    // chair, rather than dropped or stood at the top on its own.
    const { fixture, el } = await mount({
      chart: company(),
      keep: (n) => n.id === 'chair' || n.id === 'agent',
    });
    expect(canvasNames(el).sort()).toEqual(['Card Agent', 'Card Chair']);
    // One tree, not two: the agent hangs under the chair...
    expect(el.querySelectorAll('.plot').length).toBe(1);
    expect(el.querySelectorAll('.links path').length).toBe(1);
    // ...and the chair's branch counts exactly the one person under it.
    const pill = cardNamed(el, 'Card Chair').querySelector('.fold .count')!;
    expect(pill.textContent!.trim()).toBe('1');
    // The input was not touched: the host still holds its whole company.
    const whole = fixture.componentInstance.chart()!;
    expect(whole.tree[0].reports[0].id).toBe('director');
  });

  it('where nobody above is shown, the lifted person stands at the top', async () => {
    const { el } = await mount({ chart: company(), keep: (n) => n.id === 'agent' });
    expect(canvasNames(el)).toEqual(['Card Agent']);
  });

  it('narrows the BENCH as well, lifting a hidden person’s reports onto it', async () => {
    const drawn = chart();
    const stray = person({ id: 'stray', full_name_en: 'Card Stray', rank: 170 });
    drawn.reports_to_nobody[0].reports = [stray];
    const { el } = await mount({ chart: drawn, keep: (n) => n.id !== 'e3' });
    expect(benchNames(el)).toEqual(['Card Stray']);
  });

  /* ── always: the owner is in every chart ── */

  it('THE ALWAYS-SHOWN PERSON IS DRAWN WHATEVER `keep` SAYS', async () => {
    const { el } = await mount({
      chart: company(),
      keep: (n) => n.id === 'agent',
      always: (n) => n.id === 'chair',
    });
    expect(canvasNames(el).sort()).toEqual(['Card Agent', 'Card Chair']);
    expect(el.querySelectorAll('.links path').length).toBe(1);
  });

  it('and is drawn whatever `keep` says even when it refuses EVERYBODY', async () => {
    const { el } = await mount({
      chart: company(),
      keep: () => false,
      always: (n) => n.id === 'chair',
    });
    expect(canvasNames(el)).toEqual(['Card Chair']);
  });

  it('never carries the seat badge on the always-shown person’s card', async () => {
    const drawn = company();
    drawn.tree[0].reports[0].hat = 'board';
    const { el } = await mount({ chart: drawn, always: (n) => n.id === 'chair' });
    expect(cardNamed(el, 'Card Chair').querySelector('.seat')).toBeNull();
    // Anybody else with a seat still shows it, as HR's chart did.
    expect(cardNamed(el, 'Card Director').querySelector('.seat')).not.toBeNull();
  });

  /* ── read-only outside HR ── */

  it('A NARROWED CHART IS READ-ONLY: nothing is draggable, whatever `editable` says', async () => {
    const { el } = await mount({ chart: company(), keep: () => true, editable: true });
    for (const card of el.querySelectorAll('.ocard')) {
      expect(card.getAttribute('draggable')).not.toBe('true');
    }
    // And it says the reading hint, not the dragging one.
    expect(el.querySelector('.notice')!.textContent).toContain('One line per band');
    expect(el.querySelector('.notice')!.textContent).not.toContain('Drag somebody');
  });

  it('a narrowed chart moves nobody from the keyboard either', async () => {
    const { fixture, el } = await mount({
      chart: chart(),
      keep: () => true,
      editable: true,
    });
    const moves: Move[] = [];
    fixture.componentInstance.moved.subscribe((m) => moves.push(m));
    const space = () => new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    cardNamed(el, 'Card Hotel').dispatchEvent(space());
    await settle(fixture);
    cardNamed(el, 'Card Delta').dispatchEvent(space());
    await settle(fixture);
    expect(moves).toEqual([]);
    expect(el.querySelector('.carrying')).toBeNull();
  });

  it('a narrowed chart draws NO tick, whatever the host asks', async () => {
    const { fixture, el } = await mount({
      chart: chart(),
      keep: () => true,
      decorate: () => ({ tick: 'off' }),
    });
    const ticked: unknown[] = [];
    fixture.componentInstance.ticked.subscribe((t) => ticked.push(t));
    expect(el.querySelectorAll('.tick').length).toBe(0);
    cardNamed(el, 'Card Alpha').dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    expect(ticked).toEqual([]);
  });

  it('a narrowed chart still opens a card, which is how a module shows details', async () => {
    const { fixture, el } = await mount({ chart: chart(), keep: () => true });
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    cardNamed(el, 'Card Alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened.map((n) => n.id)).toEqual(['e1']);
  });

  it('WITHOUT `keep` the host’s own objects come back on every output', async () => {
    // HR's screens look people up by what they are handed; a copy would be
    // a different object with the same id.
    const drawn = chart();
    const { fixture, el } = await mount({ chart: drawn });
    const opened: ChartNode[] = [];
    fixture.componentInstance.cardOpen.subscribe((n) => opened.push(n));
    fixture.componentRef.setInput('opens', true);
    await settle(fixture);
    cardNamed(el, 'Card Alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(opened[0]).toBe(drawn.tree[0].reports[0]);
  });

  /* ── where a card's name goes ── */

  it('links a name wherever the host says', async () => {
    const { fixture, el } = await mount({ chart: chart() });
    fixture.componentRef.setInput('cardLink', (n: ChartNode) => ({ commands: ['/team', n.id] }));
    await settle(fixture);
    const name = cardNamed(el, 'Card Alpha').querySelector('.nm')!;
    expect(name.tagName.toLowerCase()).toBe('a');
    expect(name.getAttribute('href')).toBe('/team/e1');
  });

  it('draws a plain name where the host gives a card nowhere to go', async () => {
    const { fixture, el } = await mount({ chart: chart() });
    fixture.componentRef.setInput('cardLink', () => null);
    await settle(fixture);
    expect(el.querySelectorAll('.ocard a.nm').length).toBe(0);
    expect(el.querySelectorAll('.ocard span.nm').length).toBeGreaterThan(0);
  });
});

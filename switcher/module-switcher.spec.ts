import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  ModuleSwitcher,
  SwitchableAnswer,
  SwitchableModule,
  SwitcherWords,
  showsSwitcher,
} from './module-switcher';

/**
 * The masthead module switcher — A-338, and the owner's rule of 6 Nov: no other
 * module open, no button; the list holds only what the person can switch into.
 * HR's server filters the list; these specs are about the control drawing
 * exactly what it was given.
 */

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

const WORDS: SwitcherWords = {
  title: 'Switch module',
  what: 'No password needed',
  failed: 'Could not ask',
  couldNotMove: 'Could not move',
  loading: 'One moment',
};

function row(extra: Partial<SwitchableModule> & { module: string }): SwitchableModule {
  return {
    host: `${extra.module}.test.invalid`,
    name_en: extra.module,
    name_ar: '',
    ...extra,
  };
}

function answer(modules: SwitchableModule[], standing = 'hr'): SwitchableAnswer {
  return { standing_in: standing, modules };
}

describe('showsSwitcher', () => {
  it('shows the button for at least one row', () => {
    expect(showsSwitcher(answer([row({ module: 'me' })]))).toBe(true);
  });

  it('shows no button with no other module open', () => {
    expect(showsSwitcher(answer([]))).toBe(false);
  });

  it('shows no button while loading, or after failing: the host holds null', () => {
    expect(showsSwitcher(null)).toBe(false);
  });

  it('says no to an answer with no modules, rather than throwing in the template', () => {
    expect(showsSwitcher({} as SwitchableAnswer)).toBe(false);
  });
});

describe('ModuleSwitcher', () => {
  async function draw(
    said: SwitchableAnswer | null,
    opts: { failed?: boolean; arabic?: boolean } = {},
  ) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ModuleSwitcher],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ModuleSwitcher);
    fixture.componentRef.setInput('words', WORDS);
    fixture.componentRef.setInput('answer', said);
    if (opts.failed !== undefined) fixture.componentRef.setInput('failed', opts.failed);
    if (opts.arabic !== undefined) fixture.componentRef.setInput('arabic', opts.arabic);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('draws exactly the rows it is given, each one a button, nothing greyed', async () => {
    const { el } = await draw(
      answer([
        row({ module: 'me', name_en: 'Royal Me' }),
        row({ module: 'portal', name_en: 'CEO Portal' }),
      ]),
    );
    const buttons = Array.from(el.querySelectorAll('[data-test="sw-module"]'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Royal Me', 'CEO Portal']);
    expect(buttons.every((b) => b.tagName === 'BUTTON')).toBe(true);
    expect(el.querySelector('small')).toBeNull();
    expect(el.querySelector('[class*="off"]')).toBeNull();
  });

  it('EMITS the row that was pressed', async () => {
    const { fixture, el } = await draw(answer([row({ module: 'me' }), row({ module: 'portal' })]));
    const chosen: SwitchableModule[] = [];
    fixture.componentInstance.chose.subscribe((r) => chosen.push(r));
    el.querySelectorAll<HTMLButtonElement>('[data-test="sw-module"]')[1].click();
    await settle(fixture);
    expect(chosen.map((r) => r.module)).toEqual(['portal']);
  });

  it('says it COULD NOT ASK when the host says so', async () => {
    const { el } = await draw(null, { failed: true });
    expect(el.querySelector('[data-test="sw-failed"]')?.textContent).toContain('Could not ask');
    expect(el.querySelector('[data-test="sw-module"]')).toBeNull();
  });

  it('a switch that FAILED keeps the list up and says it could not move, not that it could not ask', async () => {
    const { el } = await draw(answer([row({ module: 'me' })]), { failed: true });
    expect(el.querySelector('[data-test="sw-could-not-move"]')?.textContent).toContain(
      'Could not move',
    );
    expect(el.querySelector('[data-test="sw-failed"]')).toBeNull();
    expect(el.querySelectorAll('[data-test="sw-module"]').length).toBe(1);
  });

  it('shows the ARABIC name when the page reads right to left', async () => {
    const { el } = await draw(
      answer([row({ module: 'me', name_en: 'Royal Me', name_ar: 'رويال مي' })]),
      { arabic: true },
    );
    expect(el.querySelector('[data-test="sw-module"]')?.textContent).toContain('رويال مي');
  });

  it('falls back to the English name when a module has no Arabic one', async () => {
    const { el } = await draw(answer([row({ module: 'me', name_en: 'Royal Me', name_ar: '' })]), {
      arabic: true,
    });
    expect(el.querySelector('[data-test="sw-module"]')?.textContent).toContain('Royal Me');
  });

  it('draws NOTHING but a note while the answer is on its way', async () => {
    const { el } = await draw(null);
    expect(el.textContent).toContain('One moment');
    expect(el.querySelector('[data-test="sw-module"]')).toBeNull();
  });
});

import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModuleSwitcher, SwitchableAnswer, SwitchableModule, SwitcherWords } from './module-switcher';

/**
 * The masthead module switcher — A-338.
 *
 * It decides NOTHING about who may switch: HR sends `may` and `why_not`, and
 * these specs are about the control drawing both honestly. A second opinion
 * here is how a control comes to offer what its own door refuses.
 */

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

const WORDS: SwitcherWords = {
  title: 'Switch module',
  what: 'No password needed',
  cannotOpen: 'You cannot open this',
  failed: 'Could not ask',
  loading: 'One moment',
  reasons: {
    not_on_hr_identity: 'Not ready for one sign-in yet',
    could_not_ask: 'We could not check this one',
    door_shut: 'You do not have access',
    already_here: 'You are here',
  },
};

function row(extra: Partial<SwitchableModule> & { module: string }): SwitchableModule {
  return {
    host: `${extra.module}.test.invalid`,
    name_en: extra.module,
    name_ar: '',
    may: true,
    why_not: '',
    ...extra,
  };
}

function answer(modules: SwitchableModule[], standing = 'hr'): SwitchableAnswer {
  return { standing_in: standing, modules };
}

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

  it('offers a module HR said may be switched into', async () => {
    const { el } = await draw(answer([row({ module: 'me', name_en: 'Royal Me' })]));
    const button = el.querySelector<HTMLButtonElement>('[data-test="sw-module"]');
    expect(button?.textContent).toContain('Royal Me');
  });

  it('DRAWS a refused module, greyed, WITH ITS REASON', async () => {
    // A name missing on purpose is a name somebody hunts for — the same
    // confusion as a drag that refuses without saying why.
    const { el } = await draw(
      answer([
        row({ module: 'me', name_en: 'Royal Me' }),
        row({ module: 'portal', name_en: 'CEO Portal', may: false, why_not: 'not_on_hr_identity' }),
      ]),
    );
    const off = el.querySelector('[data-test="sw-module-off"]');
    expect(off?.textContent).toContain('CEO Portal');
    expect(el.querySelector('[data-test="sw-why"]')?.textContent).toContain(
      'Not ready for one sign-in yet',
    );
    // THE CONTROL — the offered one is still a button, so "greyed" is a
    // decision about one row and not what this control does to everything.
    expect(el.querySelectorAll('[data-test="sw-module"]').length).toBe(1);
  });

  it('a refused row is NOT A BUTTON, so a keyboard cannot start it either', async () => {
    const { el } = await draw(
      answer([row({ module: 'portal', may: false, why_not: 'door_shut' })]),
    );
    expect(el.querySelector('[data-test="sw-module-off"]')?.tagName).not.toBe('BUTTON');
    expect(el.querySelectorAll('button').length).toBe(0);
  });

  it('EMITS the row that was pressed, and nothing for a refused one', async () => {
    const { fixture, el } = await draw(
      answer([
        row({ module: 'me' }),
        row({ module: 'portal', may: false, why_not: 'door_shut' }),
      ]),
    );
    const chosen: SwitchableModule[] = [];
    fixture.componentInstance.chose.subscribe((r) => chosen.push(r));
    el.querySelector<HTMLButtonElement>('[data-test="sw-module"]')!.click();
    await settle(fixture);
    expect(chosen.map((r) => r.module)).toEqual(['me']);
  });

  it('refuses to emit a row HR said no to, even asked directly', async () => {
    // The screen being honest, not the protection — the server refuses again.
    // But a stale answer must not be able to start a switch HR refused.
    const { fixture } = await draw(answer([row({ module: 'portal', may: false, why_not: 'door_shut' })]));
    const chosen: SwitchableModule[] = [];
    fixture.componentInstance.chose.subscribe((r) => chosen.push(r));
    (fixture.componentInstance as unknown as { press(r: SwitchableModule): void }).press(
      row({ module: 'portal', may: false, why_not: 'door_shut' }),
    );
    expect(chosen).toEqual([]);
  });

  it('says it COULD NOT ASK rather than showing an empty list', async () => {
    const { el } = await draw(null, { failed: true });
    expect(el.querySelector('[data-test="sw-failed"]')?.textContent).toContain('Could not ask');
    expect(el.querySelector('[data-test="sw-module"]')).toBeNull();
  });

  it('and an answer of ALL REFUSALS is not read as an empty list', async () => {
    // The reasons stay on screen beneath the note: the person can see which
    // modules exist and why each is shut, which "nothing here" would hide.
    const { el } = await draw(
      answer([
        row({ module: 'portal', may: false, why_not: 'not_on_hr_identity' }),
        row({ module: 'salesops', may: false, why_not: 'could_not_ask' }),
      ]),
    );
    expect(el.querySelector('[data-test="sw-none-offered"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-test="sw-module-off"]').length).toBe(2);
  });

  it('falls back to a plain refusal for a reason the host has no sentence for', async () => {
    // HR may add a reason word before a module adds its sentence. An empty
    // space would read as a module refused for nothing.
    const { el } = await draw(
      answer([row({ module: 'portal', may: false, why_not: 'something_new' })]),
    );
    expect(el.querySelector('[data-test="sw-why"]')?.textContent).toContain(
      'You cannot open this',
    );
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

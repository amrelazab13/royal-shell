import { Component, computed, input, output } from '@angular/core';

/**
 * The masthead's module switcher — A-338.
 *
 * **The owner, 3 November 2026:** *"one universal password, and i should be
 * able to switch modules without reentering my password IF I AM ALLOWED AS PER
 * THE HR MODULE (this is extremely crucial) and every switch will be audited
 * as well"*.
 *
 * **IT IMPORTS NOTHING OF ANY MODULE'S, deliberately**, exactly as
 * `viewas/view-as-picker` does: it takes an answer and a bag of words through
 * inputs and emits what somebody pressed. No HTTP, no i18n service, no icon
 * component. The host asks HR for the list, asks for the ticket, and posts the
 * redeem; this draws the list and reports a choice.
 *
 * **EVERY MODULE IS DRAWN, including the ones that cannot be offered**, each
 * with its reason. A list that silently dropped them would leave somebody
 * hunting for a name that is missing on purpose — the same confusion as a drag
 * that refuses without saying why, which is what O-831 was about at the other
 * end of the same masthead. HR decides `may` and `why_not`; this never
 * re-decides either, because a second opinion about who may switch is how a
 * control comes to offer what its own door refuses.
 */

/** One module, exactly as `auth/switchable/` serves it. Every field is
 *  required because HR sets every one of them on every row — read from its
 *  own `out.append`, not assumed. */
export interface SwitchableModule {
  module: string;
  host: string;
  name_en: string;
  name_ar: string;
  may: boolean;
  why_not: string;
}

/** The whole answer. `standing_in` is the module the person is on now, which
 *  HR works out from the host and which this draws as "you are here" rather
 *  than as a refusal. */
export interface SwitchableAnswer {
  standing_in: string | null;
  modules: SwitchableModule[];
}

/**
 * Every word this control says, supplied by whoever hosts it.
 *
 * `reasons` is keyed by HR's own reason WORDS — `not_on_hr_identity`,
 * `could_not_ask`, `door_shut`, `already_here`. A key the host has no sentence
 * for falls back to `cannotOpen`, so a reason HR adds later reads as a plain
 * refusal instead of an empty space.
 */
export interface SwitcherWords {
  title: string;
  what: string;
  cannotOpen: string;
  failed: string;
  loading: string;
  reasons: Record<string, string>;
}

@Component({
  selector: 'royal-module-switcher',
  standalone: true,
  templateUrl: './module-switcher.html',
  styleUrl: './module-switcher.scss',
})
export class ModuleSwitcher {
  /** `null` while the answer is on its way. */
  readonly answer = input<SwitchableAnswer | null>(null);
  readonly words = input.required<SwitcherWords>();
  /** The reader's language, for which of the two names to show. */
  readonly arabic = input(false);
  /** The host could not ask. **NOT the same as an empty list**, which would be
   *  a claim that this person may switch nowhere. */
  readonly failed = input(false);

  readonly chose = output<SwitchableModule>();

  protected name(row: SwitchableModule): string {
    const first = this.arabic() ? row.name_ar : row.name_en;
    return first || row.name_en || row.name_ar || row.module;
  }

  /** The sentence for a module that cannot be opened, in the host's words. */
  protected reason(row: SwitchableModule): string {
    const words = this.words();
    return words.reasons[row.why_not] || words.cannotOpen;
  }

  protected readonly rows = computed(() => this.answer()?.modules ?? []);

  /** Whether anything at all can be switched into, for the empty state. A
   *  list of refusals is not an empty list, and must not read as one. */
  protected readonly anyOffered = computed(() => this.rows().some((row) => row.may));

  protected readonly showsNobody = computed(() => {
    const said = this.answer();
    return !!said && said.modules.length === 0;
  });

  protected press(row: SwitchableModule): void {
    // **The guard is here as well as in the template.** A row HR refused is
    // drawn as a button nowhere, but a keyboard or a stale answer must not be
    // able to start a switch HR said no to — and the server refuses it again
    // anyway, which is the door. This is the screen being honest, not the
    // protection.
    if (!row.may) return;
    this.chose.emit(row);
  }
}

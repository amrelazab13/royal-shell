import { Component, computed, input, output } from '@angular/core';

/**
 * The masthead's module switcher — A-338.
 *
 * **The owner, 3 November 2026:** *"one universal password, and i should be
 * able to switch modules without reentering my password IF I AM ALLOWED AS PER
 * THE HR MODULE (this is extremely crucial) and every switch will be audited
 * as well"*.
 *
 * **The owner, 6 November 2026:** *"the switch module button shouldnt be visisble
 * to anyone excepts he/she is allowed to other modules, and only those modules
 * would show to him/her"*.
 *
 * **IT IMPORTS NOTHING OF ANY MODULE'S, deliberately**, exactly as
 * `viewas/view-as-picker` does: it takes an answer and a bag of words through
 * inputs and emits what somebody pressed. No HTTP, no i18n service, no icon
 * component. The host asks HR for the list, asks for the ticket, and posts the
 * redeem; this draws the list and reports a choice.
 *
 * **It draws exactly the rows it is given.** HR's server sends only the modules
 * this person can switch into, and this control never decides who may switch.
 * The host loads the list when the shell opens and shows the button only when
 * `showsSwitcher` says so, so loading or failing shows no button at all.
 */

/** One module this person can switch into, as `auth/switchable/` serves it. */
export interface SwitchableModule {
  module: string;
  host: string;
  name_en: string;
  name_ar: string;
}

/** The whole answer. `standing_in` is the module the person is on now, which
 *  HR works out from the host. */
export interface SwitchableAnswer {
  standing_in: string | null;
  modules: SwitchableModule[];
}

/** Whether the host shows the button: at least one row. Not loaded yet, or not
 *  loaded at all, is `null`, and that shows no button either. */
export function showsSwitcher(answer: SwitchableAnswer | null): boolean {
  return (answer?.modules?.length ?? 0) > 0;
}

/** Every word this control says, supplied by whoever hosts it. */
export interface SwitcherWords {
  title: string;
  what: string;
  failed: string;
  loading: string;
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
  /** The host could not ask, or a switch it started failed. */
  readonly failed = input(false);

  readonly chose = output<SwitchableModule>();

  protected name(row: SwitchableModule): string {
    const first = this.arabic() ? row.name_ar : row.name_en;
    return first || row.name_en || row.name_ar || row.module;
  }

  protected readonly rows = computed(() => this.answer()?.modules ?? []);
}

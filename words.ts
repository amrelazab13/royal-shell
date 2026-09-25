import { InjectionToken, Provider, Type } from '@angular/core';

/**
 * How a shared control asks the module it lives in for words.
 *
 * The package holds no copy of any module's vocabulary — that is the rule the
 * rail already follows with `shell.showMenu` / `shell.hideMenu`. A control
 * that must speak (the date range: "Start Date", the presets) carries its own
 * English and Arabic as a fallback, and asks the module first, so a module
 * that has its own word for a key wins and a module that has none still reads
 * correctly in both languages.
 *
 * Anything with these two members fits. The CRM's `I18nService` already does.
 */
export interface ShellWords {
  /** The module's word for `key`, or `key` itself when it has none. */
  t(key: string): string;
  /** True while the page reads right to left. */
  isRtl(): boolean;
}

export const SHELL_WORDS = new InjectionToken<ShellWords>('royal-shell.words');

/**
 * In the app's providers — `provideShellWords(I18nService)` in the CRM, or
 * `provideShellWords(ROYAL_WORDS)` in a module that already hands its words
 * to `royal-ui`.
 *
 * `useExisting`, so the shared controls follow the module's own language
 * switch rather than a second copy of it.
 */
export function provideShellWords(
  source: Type<ShellWords> | InjectionToken<ShellWords>,
): Provider {
  return { provide: SHELL_WORDS, useExisting: source };
}

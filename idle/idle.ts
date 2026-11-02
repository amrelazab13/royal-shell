import { Component, Injectable, inject, signal } from '@angular/core';

import { Icon } from '../icons/icons';
import { SHELL_WORDS, ShellWords } from '../words';

/**
 * The warning before an idle sign-out (O-783), the same in every module.
 *
 * The owner, 1 Nov 2026: the idle sign-out and its warning are HR's settings
 * (`idle_sign_out_minutes`, `idle_warning_seconds`, kit
 * contracts/system-settings.json), served to every module. The module's own
 * idle service keeps its clock and its server call; it calls `warn()` when the
 * warning window opens and `clear()` on activity or sign-out. This shows the
 * countdown and the one choice, "Stay signed in", which runs the module's
 * `stay` (a request that slides the server's session) and closes.
 *
 *   providers: IdleWarning is root-provided; `<app-idle-warning />` once in
 *   the root component, beside `<app-new-version />`.
 */
@Injectable({ providedIn: 'root' })
export class IdleWarning {
  /** Seconds left before the sign-out, or null while no warning shows. */
  readonly left = signal<number | null>(null);
  private tick: ReturnType<typeof setInterval> | null = null;
  private stayFn: (() => unknown) | null = null;

  /** Open the warning for `seconds`; `stay` runs if the person chooses to stay. */
  warn(seconds: number, stay: () => unknown): void {
    this.clear();
    this.stayFn = stay;
    const ends = Date.now() + seconds * 1000;
    const count = () => this.left.set(Math.max(0, Math.ceil((ends - Date.now()) / 1000)));
    count();
    this.tick = setInterval(count, 1000);
  }

  clear(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.stayFn = null;
    this.left.set(null);
  }

  stay(): void {
    const fn = this.stayFn;
    this.clear();
    fn?.();
  }
}

/** Its own words, in both languages; the module's win. */
export const IDLE_WORDS: Record<string, { en: string; ar: string }> = {
  'idle.warning': {
    en: 'You have been inactive. You will be signed out in',
    ar: 'بسبب عدم النشاط، سيتم تسجيل خروجك خلال',
  },
  'idle.seconds': { en: 'seconds', ar: 'ثانية' },
  'idle.stay': { en: 'Stay signed in', ar: 'البقاء مسجّل الدخول' },
};

function wordsFor(module: ShellWords | null): ShellWords {
  const isRtl = () =>
    module?.isRtl() ?? (typeof document !== 'undefined' && document.documentElement.dir === 'rtl');
  return {
    isRtl,
    t: (key: string) => {
      let said: string | undefined;
      try {
        said = module?.t(key);
      } catch {
        said = undefined;
      }
      if (said && said !== key) return said;
      return IDLE_WORDS[key]?.[isRtl() ? 'ar' : 'en'] ?? key;
    },
  };
}

@Component({
  selector: 'app-idle-warning',
  imports: [Icon],
  template: `
    @if (idle.left() !== null) {
      <div class="idlewarn" role="alertdialog" aria-live="assertive">
        <app-icon name="clock" />
        <span>{{ i18n.t('idle.warning') }} {{ idle.left() }} {{ i18n.t('idle.seconds') }}</span>
        <button type="button" (click)="idle.stay()">{{ i18n.t('idle.stay') }}</button>
      </div>
    }
  `,
  styleUrl: './idle.scss',
})
export class IdleWarningNotice {
  protected readonly idle = inject(IdleWarning);
  protected readonly i18n = wordsFor(inject(SHELL_WORDS, { optional: true }));
}

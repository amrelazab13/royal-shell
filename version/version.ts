import {
  Component,
  DestroyRef,
  EnvironmentInjector,
  EnvironmentProviders,
  Injectable,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { Icon } from '../icons/icons';
import { SHELL_WORDS, ShellWords } from '../words';

/**
 * Everyone on the latest version, without anybody losing what they typed.
 *
 * The owner, 28 Sep 2026, asked for a hard refresh on every screen so that
 * everyone gets the latest version. The problem underneath is that a module
 * is a single page: it stays loaded in a tab for days, and a release reaches
 * nobody until they happen to reload. A hard refresh on every screen would
 * cure that at the cost of a slow app and lost drafts, so this does it the
 * quiet way ("go", with the notice shown to him first):
 *
 * - Every minute while the tab is visible, and whenever it comes back into
 *   view, the app asks its own server for the page it would load today and
 *   compares the name of the main script with the one it is running. Every
 *   build names that script by its content (`main-XXXX.js`), so a different
 *   name means a new release. No build step, no version file.
 * - Once a newer version is live, the next move to another screen loads it
 *   fully, instead of switching inside the old one. Nobody notices more than
 *   one slower screen.
 * - While something is being written (the module says so through `unsaved`),
 *   it never reloads. It shows the notice below, and waits.
 *
 * The page itself is served `no-cache` (royal-ui's nginx, the CRM's), so a
 * fresh load gets the newest build.
 */
export interface VersionCheck {
  /** How often to ask, in ms. A minute by default. */
  everyMs?: number;
  /** True while the person has unsaved work on screen. */
  unsaved?: () => boolean;
}

export const VERSION_CHECK = new InjectionToken<VersionCheck>('royal-shell.version');

/** The main script a page loads: `main-XXXX.js`, or null when it has none. */
export function mainScriptOf(html: string): string | null {
  const found = /<script[^>]+src="([^"]*\bmain-[A-Za-z0-9_-]+\.js)"/.exec(html);
  return found ? found[1].replace(/^.*\//, '') : null;
}

/** The main script this tab is running. */
export function runningScript(doc: Document = document): string | null {
  for (const s of Array.from(doc.querySelectorAll('script[src]'))) {
    const name = (s.getAttribute('src') ?? '').replace(/^.*\//, '');
    if (/^main-[A-Za-z0-9_-]+\.js$/.test(name)) return name;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class Version {
  /** True once a newer version is live than the one this tab runs. */
  readonly ready = signal(false);

  private readonly running = typeof document === 'undefined' ? null : runningScript();
  private asking = false;

  /** Ask the server which version it would load today. */
  async check(fetchPage: () => Promise<string> = defaultFetch): Promise<void> {
    // A dev server has no hashed main script: nothing to compare with.
    if (!this.running || this.ready() || this.asking) return;
    this.asking = true;
    try {
      const live = mainScriptOf(await fetchPage());
      // An answer without a main script (an error page, a proxy's page) is
      // no evidence of a new version.
      if (live && live !== this.running) this.ready.set(true);
    } catch {
      // Offline or refused: ask again next time.
    } finally {
      this.asking = false;
    }
  }

  /** Load the new version now, here. */
  reload(): void {
    window.location.reload();
  }

  /** Load the new version at `url`, fully rather than inside this one. */
  load(url: string): void {
    window.location.assign(url);
  }
}

function defaultFetch(): Promise<string> {
  return fetch(document.baseURI || '/', {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'text/html' },
  }).then((r) => (r.ok ? r.text() : ''));
}

/**
 * In the app's providers: `provideVersionCheck({ unsaved: () => … })`.
 * Draw `<app-new-version />` once in the shell.
 */
export function provideVersionCheck(config: VersionCheck = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: VERSION_CHECK, useValue: config },
    provideEnvironmentInitializer(() => {
      if (typeof window === 'undefined') return;
      const version = inject(Version);
      const router = inject(Router, { optional: true });
      // Asked from a router event, which is outside any injection context: run
      // it inside the app's, so a module's `unsaved` may `inject()` what it
      // needs (HR found it would otherwise throw in production, 28 Sep 2026).
      const injector = inject(EnvironmentInjector);
      const unsaved = () =>
        config.unsaved ? runInInjectionContext(injector, config.unsaved) : false;
      const visible = () => document.visibilityState !== 'hidden';
      const ask = () => visible() && void version.check();
      const timer = setInterval(ask, config.everyMs ?? 60_000);
      document.addEventListener('visibilitychange', ask);
      // The next move to another screen loads the new version fully, never
      // while something is being written.
      const moves = router?.events.subscribe((event) => {
        if (event instanceof NavigationStart && version.ready() && !unsaved()) {
          version.load(event.url);
        }
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', ask);
        moves?.unsubscribe();
      });
    }),
  ]);
}

function pageIsRtl(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}

/** The notice's own words, in both languages; the module's win. */
export const VERSION_WORDS: Record<string, { en: string; ar: string }> = {
  'version.ready': {
    en: 'A new version is ready. It opens when you move to another screen.',
    ar: 'نسخة جديدة جاهزة. ستُفتح عند انتقالك إلى شاشة أخرى.',
  },
  'version.reload': { en: 'Reload now', ar: 'أعد التحميل الآن' },
};

function wordsFor(module: ShellWords | null): ShellWords {
  // No module words: the page's own direction decides, never English by
  // default on an Arabic screen (HR, 28 Sep 2026).
  const isRtl = () => module?.isRtl() ?? pageIsRtl();
  return {
    isRtl,
    t: (key: string) => {
      // A module's `t` may throw on a key it does not hold (Royal Me's did, and
      // the notice never rendered, silently). A shared control never trusts it.
      let said: string | undefined;
      try {
        said = module?.t(key);
      } catch {
        said = undefined;
      }
      if (said && said !== key) return said;
      return VERSION_WORDS[key]?.[isRtl() ? 'ar' : 'en'] ?? key;
    },
  };
}

/**
 * The notice: shown only once a newer version is live. Quiet by design: it
 * never covers the work, never takes focus, and "Reload now" is a choice.
 * A module with unsaved work guards the reload the way it guards leaving
 * (its own discard question, or the browser's `beforeunload`).
 */
@Component({
  selector: 'app-new-version',
  imports: [Icon],
  template: `
    @if (version.ready()) {
      <div class="newver" role="status">
        <app-icon name="refresh" />
        <span>{{ i18n.t('version.ready') }}</span>
        <button type="button" (click)="version.reload()">
          {{ i18n.t('version.reload') }}
        </button>
      </div>
    }
  `,
  styleUrl: './version.scss',
})
export class NewVersion {
  protected readonly version = inject(Version);
  protected readonly i18n = wordsFor(inject(SHELL_WORDS, { optional: true }));
}

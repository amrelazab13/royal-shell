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
import { HttpInterceptorFn } from '@angular/common/http';
import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { finalize } from 'rxjs';
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
 * - Once a newer version is live, the page RELOADS ITSELF, there and then,
 *   on the screen the person is looking at. The owner, 29 Sep 2026, after
 *   opening Users & teams nine minutes after a release and seeing the old
 *   layout: "why didnt it do that on itself, didnt we fix that??". The first
 *   version waited for a move to another screen, and a person who stays on
 *   the screen that changed never makes one.
 * - Never while something is being written: the module's `unsaved`, or the
 *   cursor in a box (a search half typed is not "unsaved work" to a module
 *   but it is to the person). Then it shows the notice below, loads on the
 *   next move to another screen, and reloads the moment the box is left.
 *
 * The owner, 5 Oct 2026: "i want all modules to force hard refresh if there
 * is an update, unless the user in writing something or in the middle of
 * doing something then it forces hard refresh the moment he/she finishes,
 * instantly not after a minute". So, since then:
 * - it asks at once when the app starts (a tab opened on an old page, or a
 *   sign-in screen served from a cache, finds out before the first click),
 *   whenever the tab comes back into view or the window regains focus, after
 *   every move to another screen, and every 15 seconds while visible;
 * - "in the middle of doing something" is wider than typing: an open dialog
 *   (`<dialog open>` or `aria-modal`), and a save still on its way (any
 *   request that is not a read, counted by `versionWrites`, which the module
 *   adds to its HTTP interceptors);
 * - once a newer version is held back, the moment the person finishes is
 *   watched for, not waited for: leaving a box, releasing a pointer or a key,
 *   a dialog closing, a save landing, all settle at once, and a half-second
 *   look (no network) catches anything those miss.
 *
 * The page itself is served `no-cache` (royal-ui's nginx, the CRM's), so a
 * fresh load gets the newest build.
 */
export interface VersionCheck {
  /** How often to ask the server, in ms. 15 seconds by default. */
  everyMs?: number;
  /** How often, once a new version is held back, to look whether the person
   *  has finished, in ms. No network. Half a second by default. */
  watchMs?: number;
  /** True while the person has unsaved work on screen. */
  unsaved?: () => boolean;
  /** How long a new build must be answered, unchanged, before this tab moves
   *  to it, in ms. 30 seconds by default: the owner wants a release on every
   *  screen at once, so this is the shortest wait that outlasts a rollout. A
   *  release replaces its pods one at a time, and a tab sent over mid-way can
   *  be handed the new page by one pod and asked for its pieces by an old one,
   *  which has none of them. */
  settleMs?: number;
}

export const VERSION_CHECK = new InjectionToken<VersionCheck>('royal-shell.version');

/** The main script a page loads: `main-XXXX.js`, or null when it has none. */
export function mainScriptOf(html: string): string | null {
  const found = /<script[^>]+src="([^"]*\bmain-[A-Za-z0-9_-]+\.js)"/.exec(html);
  return found ? found[1].replace(/^.*\//, '') : null;
}

/** True while the cursor is in something a person types into. */
export function typing(doc: Document = document): boolean {
  const el = doc.activeElement as HTMLElement | null;
  if (!el || el === doc.body) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** True while a dialog is open over the page: the person is mid-task. */
export function dialogOpen(doc: Document = document): boolean {
  return !!doc.querySelector('dialog[open], [aria-modal="true"]');
}

/** Saves still on their way: every request that is not a read. */
export const writesInFlight = signal(0);

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Add to the module's interceptors (`withInterceptors([..., versionWrites])`)
 * so a reload never cuts a save off halfway.
 */
export const versionWrites: HttpInterceptorFn = (req, next) => {
  if (READS.has(req.method.toUpperCase())) return next(req);
  writesInFlight.update((n) => n + 1);
  return next(req).pipe(finalize(() => writesInFlight.update((n) => Math.max(0, n - 1))));
};

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
  private readonly settleMs = inject(VERSION_CHECK, { optional: true })?.settleMs ?? 30_000;
  private asking = false;
  /** The new build first answered, and when; forgotten the moment any answer
   *  names another (the old build again, mid-release, or a newer one). */
  private seen: { script: string; at: number } | null = null;

  /**
   * Ask the server which version it would load today.
   *
   * READY ONLY ONCE THE NEW BUILD HAS SETTLED (the owner, 6 Oct 2026: the CRM
   * went blank as he moved from the dashboard, five minutes after a release,
   * and a refresh drew it fine). The first answer naming a new build is the
   * release BEGINNING: some pods serve it and some do not, and a tab reloaded
   * then can get the new page from one and a 404 for its scripts from
   * another. So the same new build must be answered for `settleMs`, with no
   * answer in between naming anything else, before this tab moves.
   */
  async check(
    fetchPage: () => Promise<string> = defaultFetch,
    now: number = Date.now(),
  ): Promise<void> {
    // A dev server has no hashed main script: nothing to compare with.
    if (!this.running || this.ready() || this.asking) return;
    this.asking = true;
    try {
      const live = mainScriptOf(await fetchPage());
      // An answer without a main script (an error page, a proxy's page) is
      // no evidence of a new version, and no evidence against one either.
      if (!live) return;
      if (live === this.running) {
        this.seen = null; // the old build again: the release is not done
        return;
      }
      if (this.seen?.script !== live) this.seen = { script: live, at: now };
      if (now - this.seen.at >= this.settleMs) this.ready.set(true);
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
      // Reload here and now when nothing on screen would be lost. ONCE: the
      // check and leaving a box can both arrive at a safe moment together,
      // and a second reload is noise at best (HR found the test flaking one
      // run in three on exactly that race, 29 Sep 2026).
      let reloading = false;
      const midTask = () => unsaved() || typing() || dialogOpen() || writesInFlight() > 0;
      const settle = () => {
        if (reloading) return;
        if (visible() && version.ready() && !midTask()) {
          reloading = true;
          version.reload();
        }
      };
      const ask = () => {
        if (!visible()) return;
        void version.check().then(settle);
      };
      // The moment the person finishes is any of these; each settles at once.
      const finished = () => setTimeout(settle, 0);
      const FINISHES = ['focusout', 'pointerup', 'keyup', 'close'] as const;
      // Ask at once on start, not a period later (the owner, 5 Oct 2026:
      // "instantly not after a minute").
      const first = setTimeout(ask, 0);
      const timer = setInterval(ask, config.everyMs ?? 15_000);
      // Once held back, look every half second whether the task has ended:
      // local state only, no request.
      const watch = setInterval(() => {
        if (version.ready()) settle();
      }, config.watchMs ?? 500);
      document.addEventListener('visibilitychange', ask);
      window.addEventListener('focus', ask);
      for (const name of FINISHES) document.addEventListener(name, finished, true);
      // The next move to another screen loads the new version fully, never
      // while something is being written; and every arrival asks again.
      const moves = router?.events.subscribe((event) => {
        if (event instanceof NavigationStart && version.ready() && !unsaved()) {
          version.load(event.url);
        } else if (event instanceof NavigationEnd) {
          ask();
        } else if (event instanceof NavigationError && piecesMissing(event.error)) {
          recover(version, event.url);
        }
      });
      // A piece of the app asked for outside a navigation fails the same way.
      const rejected = (e: PromiseRejectionEvent) => {
        if (piecesMissing(e.reason)) recover(version, location.pathname + location.search);
      };
      window.addEventListener('unhandledrejection', rejected);
      inject(DestroyRef).onDestroy(() => {
        clearTimeout(first);
        clearInterval(timer);
        clearInterval(watch);
        document.removeEventListener('visibilitychange', ask);
        window.removeEventListener('focus', ask);
        for (const name of FINISHES) document.removeEventListener(name, finished, true);
        window.removeEventListener('unhandledrejection', rejected);
        moves?.unsubscribe();
      });
    }),
  ]);
}

/**
 * The screen asked for a piece of the app the server no longer has (or does
 * not have yet): the tab is running one build and the server serves another.
 * Left alone that is a blank page. Each browser words it its own way.
 */
export function piecesMissing(error: unknown): boolean {
  const said = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    said,
  );
}

const RECOVERED = 'royal-shell.version.recovered';

/**
 * Load the screen the person was going to, fully, so the page and its
 * pieces come from one build. ONCE a minute at most: if the fresh page fails
 * the same way, something else is wrong and reloading forever would hide it.
 */
export function recover(version: Version, url: string, now: number = Date.now()): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RECOVERED) ?? 0);
  } catch {
    last = 0;
  }
  if (now - last < 60_000) return false;
  try {
    sessionStorage.setItem(RECOVERED, String(now));
  } catch {
    // no storage: still recover once; the next failure will try again
  }
  version.load(url);
  return true;
}

function pageIsRtl(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}

/** The notice's own words, in both languages; the module's win. */
export const VERSION_WORDS: Record<string, { en: string; ar: string }> = {
  'version.ready': {
    en: 'A new version is ready. It opens as soon as you finish what you are writing.',
    ar: 'نسخة جديدة جاهزة. ستُفتح فور انتهائك مما تكتبه.',
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

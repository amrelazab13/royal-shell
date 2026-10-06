import { inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpResponse } from '@angular/common/http';
import { NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Subject, of } from 'rxjs';

import { SHELL_WORDS } from '../words';
import {
  NewVersion,
  Version,
  dialogOpen,
  mainScriptOf,
  piecesMissing,
  recover,
  provideVersionCheck,
  runningScript,
  versionWrites,
  writesInFlight,
} from './version';

const page = (main: string) =>
  `<!doctype html><html><head><link rel="stylesheet" href="styles-AB12.css"></head>` +
  `<body><app-root></app-root><script src="polyfills-ZZ.js" type="module"></script>` +
  `<script src="${main}" type="module" nonce="n1"></script></body></html>`;

describe('mainScriptOf', () => {
  it('reads the hashed main script a page loads', () => {
    expect(mainScriptOf(page('main-OLD123.js'))).toBe('main-OLD123.js');
    expect(mainScriptOf(page('/crm/main-X_y-9.js'))).toBe('main-X_y-9.js');
  });

  it('finds none in a page with no main script (an error page)', () => {
    expect(mainScriptOf('<html><body>502 Bad Gateway</body></html>')).toBeNull();
  });
});

function running(main: string | null) {
  document.querySelectorAll('script[data-test]').forEach((s) => s.remove());
  if (main) {
    const s = document.createElement('script');
    s.setAttribute('src', main);
    s.setAttribute('data-test', '');
    s.type = 'application/json'; // never executed
    document.body.appendChild(s);
  }
}

describe('Version.check', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => running(null));

  it('is ready only when the server loads a different main script', async () => {
    running('main-OLD123.js');
    const v = TestBed.inject(Version);
    await v.check(async () => page('main-OLD123.js'), 0);
    expect(v.ready()).toBe(false);
    await v.check(async () => page('main-NEW456.js'), 0);
    await v.check(async () => page('main-NEW456.js'), 30_000);
    expect(v.ready()).toBe(true);
  });

  it('NOT on the first answer naming a new build: that is the release beginning', async () => {
    running('main-OLD123.js');
    const v = TestBed.inject(Version);
    await v.check(async () => page('main-NEW456.js'), 0);
    expect(v.ready()).toBe(false);
    await v.check(async () => page('main-NEW456.js'), 29_999);
    expect(v.ready()).toBe(false);
  });

  it('an OLD answer mid-release starts the wait again (pods still mixed)', async () => {
    running('main-OLD123.js');
    const v = TestBed.inject(Version);
    await v.check(async () => page('main-NEW456.js'), 0);
    await v.check(async () => page('main-OLD123.js'), 30_000);
    await v.check(async () => page('main-NEW456.js'), 55_000);
    expect(v.ready()).toBe(false); // 25 s settled, not 30
    await v.check(async () => page('main-NEW456.js'), 85_000);
    expect(v.ready()).toBe(true);
  });

  it('an error page or a failed ask is no evidence of a new version', async () => {
    running('main-OLD123.js');
    const v = TestBed.inject(Version);
    await v.check(async () => '<html>502</html>', 0);
    await v.check(async () => {
      throw new Error('offline');
    }, 200_000);
    expect(v.ready()).toBe(false);
  });

  it('a dev build with no hashed main script never asks', async () => {
    running(null);
    expect(runningScript()).toBeNull();
    const v = TestBed.inject(Version);
    let asked = 0;
    await v.check(async () => {
      asked++;
      return page('main-NEW456.js');
    });
    expect(asked).toBe(0);
    expect(v.ready()).toBe(false);
  });
});

describe('provideVersionCheck', () => {
  let events: Subject<unknown>;
  let assigned: string[];
  let unsaved = false;

  function boot() {
    events = new Subject();
    assigned = [];
    running('main-OLD123.js');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: { events } },
        provideVersionCheck({ everyMs: 3_600_000, unsaved: () => unsaved }),
      ],
    });
    const v = TestBed.inject(Version);
    vi.spyOn(v, 'load').mockImplementation((url: string) => {
      assigned.push(url);
    });
    return v;
  }

  afterEach(() => running(null));

  it('the next move to another screen loads the new version fully', () => {
    unsaved = false;
    const v = boot();
    events.next(new NavigationStart(1, '/leads'));
    expect(assigned).toEqual([]); // nothing new yet: an ordinary move
    v.ready.set(true);
    events.next(new NavigationStart(2, '/leads/52374'));
    expect(assigned).toEqual(['/leads/52374']);
  });

  it('asks `unsaved` inside the app injector, so it may inject', () => {
    events = new Subject();
    assigned = [];
    running('main-OLD123.js');
    TestBed.resetTestingModule();
    let injected: unknown = null;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: { events } },
        provideVersionCheck({
          everyMs: 3_600_000,
          unsaved: () => {
            injected = inject(Version);
            return true;
          },
        }),
      ],
    });
    const v = TestBed.inject(Version);
    vi.spyOn(v, 'load').mockImplementation((url: string) => assigned.push(url));
    v.ready.set(true);
    events.next(new NavigationStart(1, '/leads'));
    expect(injected).toBe(v);
    expect(assigned).toEqual([]);
  });

  /** The tab comes into view and the server answers with a new build. */
  async function aNewBuildIsFound(v: Version) {
    vi.spyOn(v, 'check').mockImplementation(async () => v.ready.set(true));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
  }

  it('reloads by itself on the screen the person is on (the owner, 29 Sep)', async () => {
    unsaved = false;
    const v = boot();
    const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
    await aNewBuildIsFound(v);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(assigned).toEqual([]); // no move was needed
  });

  it('holds while the cursor is in a box, and reloads when the box is left', async () => {
    unsaved = false;
    const v = boot();
    const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
    const box = document.createElement('input');
    document.body.appendChild(box);
    box.focus();
    try {
      await aNewBuildIsFound(v);
      expect(reload).not.toHaveBeenCalled();
      box.blur();
      await new Promise((r) => setTimeout(r, 0));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      box.remove();
    }
  });

  it('reloads once, even when the check and leaving a box both arrive', async () => {
    unsaved = false;
    const v = boot();
    const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
    await aNewBuildIsFound(v);
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new FocusEvent('focusout'));
    document.dispatchEvent(new FocusEvent('focusout'));
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads by itself while something is unsaved', async () => {
    unsaved = true;
    const v = boot();
    const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
    await aNewBuildIsFound(v);
    document.dispatchEvent(new FocusEvent('focusout'));
    await new Promise((r) => setTimeout(r, 0));
    expect(reload).not.toHaveBeenCalled();
  });

  it('never while something is being written', () => {
    unsaved = true;
    const v = boot();
    v.ready.set(true);
    events.next(new NavigationStart(1, '/leads'));
    expect(assigned).toEqual([]);
  });

  // The owner, 5 Oct 2026: "... it forces hard refresh the moment he/she
  // finishes, instantly not after a minute".

  it('asks the server at once when the app starts, not a period later', async () => {
    unsaved = false;
    events = new Subject();
    running('main-OLD123.js');
    TestBed.resetTestingModule();
    const asked = vi.spyOn(Version.prototype, 'check').mockResolvedValue(undefined);
    try {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          { provide: Router, useValue: { events } },
          provideVersionCheck({ everyMs: 3_600_000 }),
        ],
      });
      TestBed.inject(Version);
      await new Promise((r) => setTimeout(r, 0));
      expect(asked).toHaveBeenCalled();
    } finally {
      asked.mockRestore();
    }
  });

  it('asks again on every arrival at a screen', async () => {
    unsaved = false;
    const v = boot();
    const asked = vi.spyOn(v, 'check').mockResolvedValue(undefined);
    asked.mockClear();
    events.next(new NavigationEnd(1, '/leads', '/leads'));
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('reloads the moment unsaved work is done, with no move and no new ask', async () => {
    unsaved = true;
    // No ask may settle anything here: only the half-second look is tested.
    const asked = vi.spyOn(Version.prototype, 'check').mockResolvedValue(undefined);
    try {
      const v = boot();
      await new Promise((r) => setTimeout(r, 0));
      const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
      v.ready.set(true);
      await new Promise((r) => setTimeout(r, 600));
      expect(reload).not.toHaveBeenCalled();
      unsaved = false; // saved: nothing else happens on the page
      await new Promise((r) => setTimeout(r, 600)); // one half-second look
      expect(reload).toHaveBeenCalledTimes(1);
      expect(assigned).toEqual([]);
    } finally {
      asked.mockRestore();
    }
  });

  it('holds while a dialog is open, and reloads as it closes', async () => {
    unsaved = false;
    const v = boot();
    const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    document.body.appendChild(dlg);
    try {
      expect(dialogOpen()).toBe(true);
      await aNewBuildIsFound(v);
      expect(reload).not.toHaveBeenCalled();
      dlg.remove();
      document.dispatchEvent(new PointerEvent('pointerup'));
      await new Promise((r) => setTimeout(r, 0));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      dlg.remove();
    }
  });

  it('holds while a save is on its way, and reloads when it lands', async () => {
    unsaved = false;
    const asked = vi.spyOn(Version.prototype, 'check').mockResolvedValue(undefined);
    const v = boot();
    await new Promise((r) => setTimeout(r, 0));
    const reload = vi.spyOn(v, 'reload').mockImplementation(() => undefined);
    const landed = new Subject<HttpResponse<unknown>>();
    const sub = versionWrites(new HttpRequest('POST', '/api/leads/', {}), () => landed).subscribe();
    try {
      expect(writesInFlight()).toBe(1);
      v.ready.set(true);
      await new Promise((r) => setTimeout(r, 600));
      expect(reload).not.toHaveBeenCalled();
      landed.next(new HttpResponse({ status: 201 }));
      landed.complete();
      expect(writesInFlight()).toBe(0);
      await new Promise((r) => setTimeout(r, 600));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      sub.unsubscribe();
      writesInFlight.set(0);
      asked.mockRestore();
    }
  });
});

describe('a missing piece of the app', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('is recognised in each browser\u2019s words, and nothing else is', () => {
    expect(piecesMissing(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-AB.js'))).toBe(true);
    expect(piecesMissing(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(piecesMissing(new Error('error loading dynamically imported module'))).toBe(true);
    expect(piecesMissing(new Error('Http failure response for /api/v1/leads/: 500'))).toBe(false);
    expect(piecesMissing(undefined)).toBe(false);
  });

  it('loads the screen the person was going to, fully, ONCE a minute', () => {
    const v = TestBed.inject(Version);
    const loads: string[] = [];
    vi.spyOn(v, 'load').mockImplementation((u: string) => loads.push(u));
    expect(recover(v, '/leads/abc?x=1', 1_000_000)).toBe(true);
    expect(recover(v, '/leads/abc?x=1', 1_030_000)).toBe(false); // same failure again: stop
    expect(recover(v, '/leads/abc?x=1', 1_061_000)).toBe(true);
    expect(loads).toEqual(['/leads/abc?x=1', '/leads/abc?x=1']);
  });

  it('a navigation that failed for a missing piece recovers to its own url', () => {
    const events = new Subject<unknown>();
    running('main-OLD123.js');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: { events } },
        provideVersionCheck({ everyMs: 3_600_000 }),
      ],
    });
    const v = TestBed.inject(Version);
    const loads: string[] = [];
    vi.spyOn(v, 'load').mockImplementation((u: string) => loads.push(u));
    vi.spyOn(v, 'check').mockImplementation(async () => undefined);
    events.next(new NavigationError(1, '/reports', new Error('Http failure 500')));
    expect(loads).toEqual([]); // an ordinary failure is not ours to hide
    events.next(
      new NavigationError(2, '/leads/abc', new TypeError('Failed to fetch dynamically imported module: /chunk-Z.js')),
    );
    expect(loads).toEqual(['/leads/abc']);
    running(null);
  });
});

describe('versionWrites', () => {
  it('counts writes and never reads', () => {
    writesInFlight.set(0);
    const read = versionWrites(new HttpRequest('GET', '/api/leads/'), () =>
      of(new HttpResponse({ status: 200 })),
    ).subscribe();
    expect(writesInFlight()).toBe(0);
    read.unsubscribe();
    const open = new Subject<HttpResponse<unknown>>();
    const write = versionWrites(
      new HttpRequest('PATCH', '/api/leads/1/', {}),
      () => open,
    ).subscribe();
    expect(writesInFlight()).toBe(1);
    write.unsubscribe(); // a cancelled save also stops counting
    expect(writesInFlight()).toBe(0);
  });
});

describe('NewVersion', () => {
  it("renders its own words when the module's t() throws on an unknown key", async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: SHELL_WORDS,
          useValue: {
            t: () => {
              throw new TypeError("Cannot read properties of undefined (reading 'ar')");
            },
            isRtl: () => false,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(NewVersion);
    TestBed.inject(Version).ready.set(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('A new version is ready');
  });

  it('reads Arabic from the page when the module gives no words', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    document.documentElement.dir = 'rtl';
    try {
      const fixture = TestBed.createComponent(NewVersion);
      TestBed.inject(Version).ready.set(true);
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain('نسخة جديدة جاهزة');
    } finally {
      document.documentElement.dir = '';
    }
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('draws nothing until a new version is live, then the notice and its button', async () => {
    const fixture = TestBed.createComponent(NewVersion);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.newver')).toBeNull();
    TestBed.inject(Version).ready.set(true);
    await fixture.whenStable();
    const notice = fixture.nativeElement.querySelector('.newver');
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('A new version is ready');
    expect(notice.querySelector('button').textContent.trim()).toBe('Reload now');
  });
});

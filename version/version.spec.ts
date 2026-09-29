import { inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { SHELL_WORDS } from '../words';
import { NewVersion, Version, mainScriptOf, provideVersionCheck, runningScript } from './version';

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
    await v.check(async () => page('main-OLD123.js'));
    expect(v.ready()).toBe(false);
    await v.check(async () => page('main-NEW456.js'));
    expect(v.ready()).toBe(true);
  });

  it('an error page or a failed ask is no evidence of a new version', async () => {
    running('main-OLD123.js');
    const v = TestBed.inject(Version);
    await v.check(async () => '<html>502</html>');
    await v.check(async () => {
      throw new Error('offline');
    });
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

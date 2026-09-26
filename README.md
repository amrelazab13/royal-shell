# royal-shell

The pieces of the app shell that must look and behave the same in every
Royal module — CRM, CEO, HR, Me, and whatever comes next.

Consumed as a git submodule at `frontend/src/shared`, so there is one source
of truth and each app pins the commit it has tested against.

## What is in here, and why only this

Only the parts that are genuinely the same everywhere:

- `rail/rail.scss` — the retracted rail, the hover-peek, the hamburger.
- `rail/rail.ts` — the state behind it: retracted by default, a pointer
  that opens it, a hamburger that pins it.
- `rail/rail-burger.ts` — the button's glyph, three lines and a chevron
  pointing the way the rail will move.

- `date-range/` — the one date control: two pills, seven presets, month and
  year, the range shaded across the grid, Cairo's calendar. The CRM's own,
  moved here on 25 Sep 2026 so there is one original and no copies.
- `dates/dates.ts` — Cairo time for everything a module sends: `todayInCairo`,
  `shiftIsoDate`, `monthEndOf`, `toCairoIso` and the rest. Never
  `toISOString().slice(0, 10)` for "today".
- `icons/icons.ts` — the sprite (`<app-icon-sprite />`, once, in the root
  component) and `<app-icon name="…" />`. 54 symbols.
- `words.ts` — `SHELL_WORDS`, how a shared control asks the module for words.
- `tools/design-system-check.mjs` — the gate.
- `tools/dates-check.mjs` — the dates gate: a timestamp's UTC day, calendar
  arithmetic through the reader's midnight, or a day parsed as local midnight
  fails the build, naming the `dates/` helper to use. Opt out per line with
  `// dates-ok: <reason>`. Run it beside the design gate:
  `node src/shared/tools/dates-check.mjs`. (Written by the CEO portal, 26 Sep
  2026, after F14.)
- `tools/unused-css.mjs` — REPORT ONLY, never a gate: lists class names in a
  global stylesheet that the app never draws, and the places that build class
  names at run time, which it cannot see. Deleting is the dangerous half: do it
  by construction, then compare the rendered pages before and after on the
  fixture server — same origin, same fixtures, same minute, geometry left out.
  (Written by the CEO portal, 26 Sep 2026, after removing 40% of its sheet.)
  The first pass (whole top-level rules whose every class is dead) is a clean
  cut; the second (a selector with ANY dead class, inside `@media` and comma
  lists) needs a real CSS parser such as postcss, not a hand-rolled brace
  matcher. Keep a known-good copy, and prune → build → compare renders, in
  that order: a mangled sheet fails the build loudly, cheaply, first.
  A matching before/after capture proves nothing on its own — a server that
  never rebuilt gives the same answer twice. Also record what was actually
  SERVED (the phone: 917 rules before, 725 after): same rendering,
  demonstrably different stylesheet. And read every place the app builds a
  class name; no report can do that for you.
- `tools/fixture-server.mjs` — look at a module's real production build in a
  browser without anyone's password: serves `dist/` on 127.0.0.1 only, with
  API answers from the module's own `fixtures/local.mjs` (**invented people
  only — never data copied from production**). `ng build --configuration
  production`, then `node src/shared/tools/fixture-server.mjs`. Layout faults
  (F17) cannot be caught in jsdom; this is how they are looked at. (Written by
  the CEO portal, 26 Sep 2026.)
- `masthead/masthead.scss` — the masthead and the page head, shared (bible
  §3.3, §3.5). The ORDER is decided here, by `data-slot` on each direct child
  of `<header class="top">`: burger, logo, module, search, online, bell, role,
  language, theme, me. A child without a known slot is not drawn. The module
  name beside the logo and the `.phead` title, caption and actions are here
  too. Load it globally after the rail. (26 Sep 2026, after the owner saw five
  modules side by side.)
- `tools/masthead-check.mjs` — refuses a masthead with an unknown or missing
  slot, slots out of order, a date control, or a sign-out outside the avatar
  menu. `node src/shared/tools/masthead-check.mjs` finds the shell itself
  (`--shell` to point at it); exits 2 if it finds no masthead at all.
- `tools/global-class-check.mjs` — the global sheet reaching INTO a component
  (F45): lists every component rule that restates a property the global
  sheet sets on a bare `.class`, and exits 1. Reuse of a shared class is fine;
  restating its values is the fault. `node src/shared/tools/global-class-check.mjs`
  (reads `src/styles.scss` or `src/styles.css`; `--global` to point elsewhere).
  Placement (margin, padding, inset, top/left, order, flex, grid placement) is not
  compared: where a thing sits is the screen's business, how it looks is what
  drifts. On 26 Sep 2026 it found CRM 65, HR 34; Me, SalesOps and the portal 0, so each
  module clears its list before it adds the check to CI. (Written by the CEO
  portal, c2c705d.)

**Formatting tools must not walk into the shared packages.** A module's
`prettier --write "src/**"` rewrites `src/shared/` (this package) and
`src/royal-ui/`, and the change would go up in the module's commit looking
legitimate (found by the CEO portal and SalesOps, 26 Sep 2026). Every module's
`.prettierignore` lists `src/shared/` and `src/royal-ui/`; this package keeps
itself prettier-clean.

What is **not** in here, deliberately: the nav items, the counts, the
capabilities and the routes. Those differ per module and belong to it. A
shared thing that tries to own them becomes a second place to edit every
time a module grows a screen.

## Using it

```bash
git submodule add git@github.com:amrelazab13/royal-shell.git frontend/src/shared
```

CI needs `submodules: recursive` on its checkout step, or the build arrives
without this directory and fails on the import.

Then, in the app:

```scss
/* styles.scss */
@use 'shared/rail/rail';
```

```ts
// shell.ts
import { railState } from '../shared/rail/rail';
import { RailBurger } from '../shared/rail/rail-burger';

protected readonly rail = railState();
```

```html
<!-- shell.html -->
<button class="burger" type="button" (click)="rail.toggle()"
        [attr.aria-label]="i18n.t(rail.collapsed() ? 'shell.showMenu' : 'shell.hideMenu')">
  <royal-rail-burger [collapsed]="rail.collapsed()" />
</button>

<aside class="side" (mouseenter)="rail.peeking.set(true)"
                    (mouseleave)="rail.peeking.set(false)">
```

The two labels are the app's own, in its own language files: this package
holds no copy. `shell.showMenu` / `shell.hideMenu`.

### The date control, the dates and the icons

```ts
// app.config.ts — let the shared controls use the module's own words
import { provideShellWords } from '../shared/words';
providers: [provideShellWords(I18nService)]     // or provideShellWords(ROYAL_WORDS)

// wherever it is used
import { DateRangeControl, DateRange } from '../shared/date-range/date-range';
import { Icon, IconSprite } from '../shared/icons/icons';
import { todayInCairo } from '../shared/dates/dates';
```

The control carries its own English and Arabic (`CAL`) and asks the module
first, so a module needs no `cal.*` keys unless it wants different words.
Without `provideShellWords` it speaks English, left to right.

**Moving a module over** is three imports and one provider. The quickest way
keeps every existing import path working: replace the module's old file with
a one-line re-export —

```ts
// core/date-range.ts
export * from '../../shared/date-range/date-range';
```

— then delete its old `.html`, `.scss` and spec (the package's own specs run
in the module's suite, since they sit under `src/`). Proven on 25 Sep 2026:
the CRM moved this way passes all 856 tests and builds clean; the CEO portal,
with `royal-ui`'s copies deleted, passes all 234.

## The rules it encodes

**Retracted is the default, always** — on every load, at every width. A pin
lasts as long as the tab does; a reload starts retracted again. It is not
remembered, deliberately: a remembered pin lets the app train itself open one
accidental press at a time. HR used to remember it and no longer does.

**The panel is laid over the page, never into it.** The grid column stays at
the rail's width while the panel grows on top, so opening it costs the page
nothing. Getting this wrong once squeezed a whole dashboard into 60px.

**The chevron points the way the rail will move** — out to open, in to close —
and mirrors under RTL, where the rail is on the right.

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

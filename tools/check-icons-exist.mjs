/**
 * Every icon name this module asks for is drawn in the shared sprite — O-513.
 * Written by the CEO portal (12 Oct 2026, it found 8 dead names there);
 * shared from royal-shell so every module runs the same check.
 *
 * `<app-icon name="alert" />` with no `i-alert` in the sprite renders an empty
 * `<svg>`: the right size, the right colour, and nothing in it. No test fails,
 * the build is green, and the row simply has no symbol. It is the same silent
 * shape as a class with no rule (`check:classes`) and a comment that never
 * closes (`check:comments`), and the day a module adopts a dictionary of
 * thirty-eight new names is the day a typo is most likely.
 *
 * **Two sources, because the name reaches the template two ways.**
 *   · written in a template: `<app-icon name="exit" />`;
 *   · written in TypeScript and bound: `{ icon: 'alert' }`, `MODULE_ICONS`,
 *     then `[name]="item.icon"`.
 * Both are string literals in this module's own source, so both are read.
 *
 * **Ceiling, stated rather than discovered later:** a name ASSEMBLED at run
 * time (`'mod-' + slug`) is invisible here, exactly as it is to
 * `unused-css.mjs` and `check:classes`. Nothing in this module assembles one
 * today; if something starts to, this gate will not cover it and the screen
 * is the only witness.
 *
 * The sprite is royal-shell's and is read where it lives — never a copy of
 * the list, which would be a second dictionary and could disagree.
 *
 * Run from frontend/: `node src/shared/tools/check-icons-exist.mjs
 *   --anchor=dash,exit,…` (names THIS module is known to ask for; required,
 * so a collector that narrows is caught); `--self-test` proves it bites.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SPRITE = 'src/shared/icons/icons.ts';

/** Every `id="i-<name>"` the shared sprite defines. */
export function drawn(source) {
  return new Set([...source.matchAll(/id="i-([\w-]+)"/g)].map((m) => m[1]));
}

/** Every icon name this module's own source asks for, with where it asked. */
export function asked(files) {
  const out = [];
  for (const { path, text } of files) {
    // A template: <app-icon name="x" /> — the literal attribute only, never
    // `[name]="expr"`, whose value is not here to read.
    for (const m of text.matchAll(/<app-icon\b[^>]*\bname="([\w-]+)"/g)) {
      out.push({ name: m[1], path });
    }
    // TypeScript: `icon: 'x'` in a nav item or an icon map; SalesOps writes
    // the sprite id itself (`icon: 'i-users'`), so a leading `i-` is dropped.
    for (const m of text.matchAll(/\bicon:\s*'(?:i-)?([\w-]+)'/g)) out.push({ name: m[1], path });
    // A bare sprite reference: `<use href="#i-users">` (SalesOps draws its own <svg>).
    for (const m of text.matchAll(/#i-([\w-]+)/g)) out.push({ name: m[1], path });
    // An icon map's values: `hr: 'mod-hr',` inside MODULE_ICONS.
    const map = text.match(/MODULE_ICONS[^=]*=\s*\{([\s\S]*?)\n\};/);
    if (map) {
      for (const m of map[1].matchAll(/:\s*'([\w-]+)'/g)) out.push({ name: m[1], path });
    }
  }
  return out;
}

function ourFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts')) {
        out.push({ path, text: readFileSync(path, 'utf8') });
      }
    }
  };
  walk('src/app');
  return out;
}

if (process.argv.includes('--self-test')) {
  const sprite = 'id="i-alert" ... id="i-exit" ... id="i-mod-hr"';
  const cases = [
    ['a name that is drawn', '<app-icon name="alert" />', true],
    ['a name that is NOT drawn', '<app-icon name="alertt" />', false],
    ['a TS literal that is drawn', "{ icon: 'exit' }", true],
    ['a TS literal that is NOT drawn', "{ icon: 'roadmap' }", false],
    ['a bound name is invisible, not a finding', '<app-icon [name]="item.icon" />', true],
    ['an i- prefixed TS literal that is drawn', "{ icon: 'i-exit' }", true],
    ['a use href that is drawn', '<use href="#i-mod-hr" />', true],
    ['a use href that is NOT drawn', '<use href="#i-nope" />', false],
    ['an assembled href is invisible, not a finding', "'#i-' + name()", true],
  ];
  const have = drawn(sprite);
  let wrong = 0;
  for (const [what, text, shouldPass] of cases) {
    const bad = asked([{ path: 'x', text }]).filter((a) => !have.has(a.name));
    const passed = bad.length === 0;
    if (passed !== shouldPass) wrong += 1;
    console.log(`  ${passed === shouldPass ? 'ok  ' : 'WRONG'}  ${what}`);
  }
  // And the reader of the sprite is not matching everything.
  if (have.size !== 3 || !have.has('mod-hr')) {
    console.log('  WRONG  the sprite reader found ' + [...have].join(','));
    wrong += 1;
  } else {
    console.log('  ok     the sprite reader found exactly alert, exit, mod-hr');
  }
  console.log(wrong ? `\n${wrong} case(s) wrong` : '\nevery case right');
  process.exit(wrong ? 1 : 0);
}

const have = drawn(readFileSync(SPRITE, 'utf8'));
const wanted = asked(ourFiles());

// A gate over nothing passes loudest. Both ends: the sprite must have been
// read, and this module must have been found asking for something.
if (have.size < 20) {
  console.error(`icons: only ${have.size} icon(s) in ${SPRITE} — the sprite was not read`);
  process.exit(2);
}
if (wanted.length < 10) {
  console.error(`icons: only ${wanted.length} icon use(s) found — this gate read nothing`);
  process.exit(2);
}
// THE ANCHOR: names this module is known to ask for. A collector that
// narrowed — a changed element name, a lost folder — would come back short
// while every name it still found was fine.
const anchorArg = process.argv.find((a) => a.startsWith('--anchor='));
if (!anchorArg) {
  console.error('icons: pass --anchor=<names this module asks for>, or the gate cannot tell it narrowed');
  process.exit(2);
}
for (const known of anchorArg.slice('--anchor='.length).split(',').filter(Boolean)) {
  if (!wanted.some((a) => a.name === known)) {
    console.error(`icons: nothing asks for \`${known}\` any more — this gate has narrowed`);
    process.exit(2);
  }
}

const missing = wanted.filter((a) => !have.has(a.name));
if (missing.length) {
  console.error(`${missing.length} icon name(s) that the sprite does not draw:\n`);
  for (const { name, path } of missing) console.error(`  ${name.padEnd(18)} ${path}`);
  console.error(`\nThey render as an empty <svg>. Names live in ${SPRITE}.`);
  process.exit(1);
}
console.log(
  `icons: ${new Set(wanted.map((a) => a.name)).size} name(s) asked for, every one drawn ` +
    `(${have.size} in the sprite).`,
);

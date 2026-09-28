/**
 * A component may not quietly re-state a property the GLOBAL sheet already
 * sets on the same class (fault register F45, INCONSISTENCIES §11).
 *
 * Angular's view encapsulation stops a component's styles leaking OUT. It does
 * nothing about the global sheet reaching IN: a component that writes
 * `class="side"` gets the rail's styling whether it wanted it or not (HR's
 * Valu differences screen, 26 Sep 2026), and a component that re-declares a
 * global class's property ends up in a fight only the cascade settles.
 *
 * What this checks, and nothing more: classes the global sheet styles with a
 * BARE `.class {}` selector, because those reach everywhere. A global
 * `tbody tr.open` is scoped to its own context and meeting it is a design
 * question, not a leak. A guard that cries wolf gets skipped.
 *
 * Reuse is not the fault: `.drv`, `.empty`, `.num` and the rail's classes are
 * the shared vocabulary. Re-stating their VALUES is the fault.
 *
 * Written by the CEO portal (royal-ceo c2c705d), shared from here so every
 * module runs the same check.
 *
 *   node src/shared/tools/global-class-check.mjs [--src src] [--global src/styles.scss|.css]
 *
 * Exits 1 on any finding, so it can gate CI.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const src = resolve(arg('--src', 'src'));
const globalSheet = resolve(
  arg(
    '--global',
    [join(src, 'styles.scss'), join(src, 'styles.css')].find(existsSync) ??
      join(src, 'styles.scss'),
  ),
);
if (!existsSync(globalSheet)) {
  // Say it rather than pass: a check that read nothing proves nothing (F40).
  console.error(`No global sheet at ${globalSheet}. Pass --global <path>.`);
  process.exit(2);
}

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * The global sheet without its `@media print` blocks. A print rule is not "the
 * global value" of a class on SCREEN: a component setting `overflow` for the
 * screen is not fighting a print-only `overflow: visible !important` (a false
 * positive the CEO portal hit, 28 Sep 2026, F75). `rules()` reads innermost
 * braces, so without this a rule inside `@media print {}` looked global.
 */
function withoutPrint(css) {
  let out = '';
  let i = 0;
  const re = /@media\s+print\b[^{]*\{/g;
  for (let m; (m = re.exec(css));) {
    out += css.slice(i, m.index);
    let depth = 1;
    let j = re.lastIndex;
    while (j < css.length && depth) ((depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0), j++);
    i = re.lastIndex = j;
  }
  return out + css.slice(i);
}
const globalCss = withoutPrint(strip(readFileSync(globalSheet, 'utf8')));

function rules(css) {
  return [...strip(css).matchAll(/([^@{}\n][^{}]*)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    sel: sel.trim(),
    props: [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(([, p, v]) => [p.trim(), v.trim()]),
  }));
}

/** Classes the global sheet styles with nothing else in the selector. */
const globals = new Map();
for (const { sel, props } of rules(globalCss)) {
  for (const part of sel.split(',')) {
    const bare = part.trim().match(/^\.([A-Za-z][\w-]*)$/);
    if (!bare) continue;
    const held = globals.get(bare[1]) ?? new Map();
    for (const [p, v] of props) held.set(p, v);
    globals.set(bare[1], held);
  }
}

/**
 * A class the global sheet styles ONLY through variants — `.tagm.late`,
 * `.tagm.gate` — and never on its own.
 *
 * The variants being global makes the class shared vocabulary, so its BASE
 * must be global too. When the base sits in one component instead, Angular
 * scopes it there and every other screen writing that class gets the colour
 * with none of the shape. The CEO portal's permissions screen rendered its
 * door level as a bare 14.5px line while its own comment said it was using
 * "the shared `.tagm` pill" — and this check passed, because it only ever
 * looked at classes the global sheet styled BARE (F55, 27 Sep 2026).
 *
 * Two DIFFERENT variants, not one, so a component's own `.p-card` meeting an
 * unrelated global `.p-card.wide` is not dragged in: a base is a thing several
 * variants modify. And only the FIRST class of a compound is a base: in
 * `.fsel.dim` and `.btn.go` the base is `fsel` and `btn`, while `dim` and `go`
 * are modifiers that a component may use as its own word (the CRM's first run,
 * 27 Sep 2026, flagged exactly those). A guard that cries wolf gets skipped.
 */
const variantOnly = new Set();
{
  const variants = new Map(); // base -> the distinct modifier sets seen on it
  for (const { sel } of rules(globalCss)) {
    for (const part of sel.split(',')) {
      const compound =
        part
          .trim()
          .split(/\s*[\s>+~]\s*/)
          .pop() ?? '';
      const [base, ...mods] = [...compound.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);
      if (!base || !mods.length) continue;
      const seen = variants.get(base) ?? new Set();
      seen.add(mods.sort().join('.'));
      variants.set(base, seen);
    }
  }
  for (const [c, seen] of variants) if (seen.size >= 2 && !globals.has(c)) variantOnly.add(c);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'shared' || name === 'royal-ui') return [];
    if (statSync(path).isDirectory()) return walk(path);
    if (/\.(s?css)$/.test(path)) return [path];
    // Components that keep their CSS inline, in `styles:` (SalesOps does,
    // almost everywhere). Without these the check reads nothing and passes.
    if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) return [path];
    return [];
  });
}

/** The CSS a file carries: the whole of a stylesheet, or a component's inline `styles:`. */
function cssOf(file) {
  const text = readFileSync(file, 'utf8');
  if (!file.endsWith('.ts')) return text;
  const block = text.match(/styles\s*:\s*(\[[\s\S]*?\]|`[\s\S]*?`)\s*[,}]/);
  if (!block) return null;
  return [...block[1].matchAll(/`([\s\S]*?)`/g)].map((m) => m[1]).join('\n');
}

/**
 * Where a thing sits is the screen's own business; how it looks is what
 * drifts. A global `margin: 0` is a reset, and a screen placing the element
 * is not a fight with it (Royal Me, 26 Sep 2026). So placement is not compared.
 */
const PLACEMENT =
  /^(margin|padding|inset)(-.*)?$|^(top|right|bottom|left|order|align-self|justify-self|place-self|grid-area|grid-column|grid-row|flex|flex-grow|flex-shrink|flex-basis)$/;

const files = walk(src)
  .filter((f) => f !== globalSheet)
  .map((f) => [f, cssOf(f)])
  .filter(([, css]) => css);
const found = [];
for (const [file, css] of files) {
  for (const { sel, props } of rules(css)) {
    for (const part of sel.split(',')) {
      // The rule lands on the LAST compound of the selector: in `.field input`
      // that is the input, not `.field`, so only a class in that compound counts.
      const compound =
        part
          .trim()
          .split(/\s*[\s>+~]\s*/)
          .pop() ?? '';
      const last = [...compound.matchAll(/\.([A-Za-z][\w-]*)/g)].pop();
      if (!last) continue;
      const held = globals.get(last[1]);
      if (!held) continue;
      for (const [prop, value] of props) {
        if (!PLACEMENT.test(prop) && held.has(prop) && held.get(prop) !== value) {
          found.push(
            `${relative(process.cwd(), file)}: \`${part.trim()}\` sets ${prop}: ${value} — ` +
              `the global \`.${last[1]}\` already says ${held.get(prop)}`,
          );
        }
      }
    }
  }
}

/**
 * A page-level condition written in a COMPONENT sheet (F65, Royal Me, 28 Sep
 * 2026). `[dir='rtl'] .go` in a component compiles to
 * `[dir='rtl'][_ngcontent-x] .go[_ngcontent-x]`: it asks for `dir` on an
 * element INSIDE the component, and `dir` is on `<html>`, so it never
 * matches. It reads as normal, a build passes, and an arrow points the wrong
 * way on every Arabic screen. The component form is
 * `:host-context(html[dir='rtl']) .go`, which compiles to
 * `html[dir=rtl] [_nghost-x] .go[_ngcontent-x]` and does match.
 */
const pageCondition = [];
for (const [file, css] of files) {
  for (const { sel } of rules(css)) {
    for (const part of sel.split(',')) {
      const p = part.trim();
      if (/^(html|body|:root)?\[(dir|lang)\b/.test(p)) {
        pageCondition.push(
          `${relative(process.cwd(), file)}: \`${p}\` can never match in a component ` +
            `sheet. Write \`:host-context(html[dir='rtl']) …\` (or [lang='ar']) instead.`,
        );
      }
    }
  }
}
if (pageCondition.length) {
  console.error('A page condition in a component sheet (it never matches):\n');
  for (const line of pageCondition) console.error('  ' + line);
  process.exit(1);
}

/** A component holding the base of a class the global sheet only varies. */
const owned = [];
for (const [file, css] of files) {
  for (const { sel } of rules(css)) {
    for (const part of sel.split(',')) {
      const bare = part.trim().match(/^\.([A-Za-z][\w-]*)$/);
      if (bare && variantOnly.has(bare[1])) {
        owned.push(
          `${relative(process.cwd(), file)}: \`.${bare[1]}\` is styled here, but the global ` +
            `sheet carries its variants — so every OTHER screen using \`${bare[1]}\` gets those ` +
            `variants with no base. Move the base into the global sheet.`,
        );
      }
    }
  }
}
if (owned.length) {
  console.error('A shared part owned by one screen:\n');
  for (const line of owned) console.error('  ' + line);
  console.error(
    "\nAngular scopes a component's styles to that component. A class the global\n" +
      'sheet varies is shared vocabulary: its base belongs beside its variants.',
  );
  process.exit(1);
}

if (found.length) {
  console.error('Component styles fighting the global sheet:\n');
  for (const line of found) console.error('  ' + line);
  console.error(
    '\nUse the shared value, or give the element a name of its own. A screen that\n' +
      'restates a shared property is a screen that drifts from every other one.',
  );
  process.exit(1);
}
console.log(
  `Global classes: clean. ${globals.size} bare global classes, ${files.length} component styles read (sheets and inline).`,
);

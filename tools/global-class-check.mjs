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
  arg('--global', [join(src, 'styles.scss'), join(src, 'styles.css')].find(existsSync) ?? join(src, 'styles.scss')),
);
if (!existsSync(globalSheet)) {
  // Say it rather than pass: a check that read nothing proves nothing (F40).
  console.error(`No global sheet at ${globalSheet}. Pass --global <path>.`);
  process.exit(2);
}

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function rules(css) {
  return [...strip(css).matchAll(/([^@{}\n][^{}]*)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    sel: sel.trim(),
    props: [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(([, p, v]) => [p.trim(), v.trim()]),
  }));
}

/** Classes the global sheet styles with nothing else in the selector. */
const globals = new Map();
for (const { sel, props } of rules(readFileSync(globalSheet, 'utf8'))) {
  for (const part of sel.split(',')) {
    const bare = part.trim().match(/^\.([A-Za-z][\w-]*)$/);
    if (!bare) continue;
    const held = globals.get(bare[1]) ?? new Map();
    for (const [p, v] of props) held.set(p, v);
    globals.set(bare[1], held);
  }
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
const PLACEMENT = /^(margin|padding|inset)(-.*)?$|^(top|right|bottom|left|order|align-self|justify-self|place-self|grid-area|grid-column|grid-row|flex|flex-grow|flex-shrink|flex-basis)$/;

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
      const compound = part.trim().split(/\s*[\s>+~]\s*/).pop() ?? '';
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

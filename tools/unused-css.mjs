#!/usr/bin/env node
/**
 * Which rules in a global stylesheet does nothing in this app use?
 *
 * Dead CSS is the one kind of dead code no suite anywhere will tell you
 * about. A stylesheet never fails for holding a rule it no longer needs: it
 * simply ships, to every reader, for ever. And it does not sit quietly — a
 * class name that means nothing today means whatever the next person assumes
 * tomorrow. The CEO portal's copy of the CRM's prototype sheet had a filter
 * panel stacked UNDER the scrim meant to cover it, the same inversion that
 * made a menu unclickable in another module, waiting years for somebody to
 * reuse the name (INCONSISTENCIES §11, F27 and F28).
 *
 * Every module that started from the CRM's stylesheet carries some of this.
 * The CRM's own should be small — it is the original — and a module that
 * copied it and then wrote three screens should be large.
 *
 *   node src/shared/tools/unused-css.mjs [stylesheet …]
 *
 * Default: `src/styles.scss`. Always exits 0.
 *
 * **REPORT ONLY, AND IT MUST STAY THAT WAY.** It cannot see a class built at
 * run time — `'p-' + light`, `'is-' + tone`, a name in a data file — so some
 * of what it lists is alive. It prints the places it found building names, so
 * the reader knows what it could not see. A gate that is wrong some of the
 * time teaches people to ignore it; this is a list for a person to judge.
 *
 * Deleting: a rule whose EVERY class is on this list cannot match anything,
 * which is the only safe way to delete in bulk. Then look at the rendered
 * pages rather than trusting the tests — the tests will pass either way,
 * which is the whole problem.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
// `--strict` makes it a gate: exit 1 when any name is dead and no `built:`
// prefix covers it (Royal Me, 1 Oct 2026: a step that can only pass is
// decoration). Without it, it stays a list to judge by hand.
const STRICT = process.argv.includes('--strict');
const ARGS = process.argv.slice(2).filter((a) => a !== '--strict');
const SHEETS = ARGS.length ? ARGS : ['src/styles.scss'];
const LOOK_IN = 'src';
const SOURCE = ['.html', '.ts', '.scss'];

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    // A spec is not a use: a class named only in a test is a class the app
    // does not draw, and counting it alive hides exactly what this looks for.
    else if (SOURCE.some((e) => name.endsWith(e)) && !name.endsWith('.spec.ts')) out.push(path);
  }
  return out;
}

/** Comments out, so a class name in prose is not read as a selector. */
const uncomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const sources = walk(join(ROOT, LOOK_IN)).filter(
  (file) => !SHEETS.some((sheet) => file.endsWith(sheet.replace(/^\.\//, ''))),
);
const haystack = sources.map((file) => readFileSync(file, 'utf8')).join('\n');
const usedWhole = (name) =>
  new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`).test(haystack);

// Where a class name is assembled rather than written. Whatever these build,
// this tool cannot see — so it says so rather than pretending to be complete.
const BUILDERS = [/\[class\]\s*=/, /classList\.(add|toggle|remove)/, /class\s*=\s*"[^"]*\{\{/];
const building = sources
  .flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines
      .map((line, i) => ({ file: relative(ROOT, file), line: i + 1, text: line.trim() }))
      .filter((row) => BUILDERS.some((re) => re.test(row.text)));
  })
  .slice(0, 12);

let total = 0;
const dead = [];
// A sheet that cannot be read is an ERROR, never skipped: a gate over a
// list that resolved to nothing reported "0 of 0 (0%)" and exit 0 under
// --strict (HR and Royal Me, 1 Oct 2026: an unsplit path, a stale glob).
const unread = [];

for (const sheet of SHEETS) {
  let css;
  try {
    css = readFileSync(join(ROOT, sheet), 'utf8');
  } catch {
    console.error(`no stylesheet at ${sheet}`);
    unread.push(sheet);
    continue;
  }
  const lines = css.split('\n');
  const seen = new Set();
  // A family built at run time (`'st-' + state`) is declared once, beside its
  // rules, so it is not reported as dead: /* built: st-* */. Only a prefix
  // somebody wrote down is trusted — the tool never guesses one. (SalesOps.)
  const built = [...css.matchAll(/\/\*\s*built:\s*([\w-]+)\*\s*\*\//g)].map((m) => m[1]);
  const stripped = uncomment(css).split('\n');
  stripped.forEach((line, i) => {
    // Only the selector part, never a declaration: `border-bottom: 1px`
    // holds no class. A selector is what stands before a `{` — on its own
    // line (`.a .b {`) or with the rule on the same line (`.a { x: y; }`),
    // which a line-ends-in-`{` test missed (the CRM, 1 Oct 2026: a one-line
    // dead rule read as 0 dead) — or a line of a list ending in `,`.
    const brace = line.indexOf('{');
    const selector = brace >= 0 ? line.slice(0, brace) : /,\s*$/.test(line) ? line : '';
    if (!selector) return;
    for (const [, name] of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      if (seen.has(name)) continue;
      seen.add(name);
      total += 1;
      // A WHOLE name, never a substring: `row--btn` was found inside
      // `mrow--btn` and reported as used after a rename left the rule dead
      // (Royal Me, 1 Oct 2026). A class name is letters, digits, `-` and
      // `_`, so anything else on either side is a boundary.
      if (!usedWhole(name) && !built.some((prefix) => name.startsWith(prefix))) {
        dead.push({ sheet, line: i + 1, name, text: lines[i].trim() });
      }
    }
  });
}

if (unread.length || total === 0) {
  console.error(
    bold(
      `\nCOULD NOT CHECK: ${unread.length} stylesheet(s) unreadable and ${total} class name(s) read. ` +
        'Nothing was proved dead or alive; this is an error, not a result.',
    ),
  );
  process.exit(2);
}
const share = Math.round((dead.length / total) * 100);
console.log(
  bold(`\n${dead.length} of ${total} class names (${share}%) appear nowhere this app renders.\n`),
);
for (const row of dead) {
  console.log(`  ${row.sheet}:${row.line}  .${row.name}`);
}
if (building.length) {
  console.log(
    dim(
      `\n  It cannot see a class built at run time. ${building.length} place${building.length === 1 ? '' : 's'} in this app build one:`,
    ),
  );
  for (const row of building) console.log(dim(`    ${row.file}:${row.line}`));
}
console.log(
  dim(
    '\n  A list to judge (a gate only with --strict). A rule whose EVERY class is listed cannot match\n' +
      '  anything, which is the only safe way to delete in bulk — then look at the rendered\n' +
      '  pages, because the tests pass either way and that is the whole problem.\n',
  ),
);
process.exit(STRICT && dead.length ? 1 : 0);

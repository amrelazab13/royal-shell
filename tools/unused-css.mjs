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
const SHEETS = process.argv.slice(2).length ? process.argv.slice(2) : ['src/styles.scss'];
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

for (const sheet of SHEETS) {
  let css;
  try {
    css = readFileSync(join(ROOT, sheet), 'utf8');
  } catch {
    console.error(`no stylesheet at ${sheet}`);
    continue;
  }
  const lines = css.split('\n');
  const seen = new Set();
  const stripped = uncomment(css).split('\n');
  stripped.forEach((line, i) => {
    // Only a selector line, not a declaration: `border-bottom: 1px` holds no
    // class, and `.a, .b {` and `.a .b {` both do.
    if (!/\{\s*$/.test(line) && !/,\s*$/.test(line)) return;
    for (const [, name] of line.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      if (seen.has(name)) continue;
      seen.add(name);
      total += 1;
      if (!haystack.includes(name)) {
        dead.push({ sheet, line: i + 1, name, text: lines[i].trim() });
      }
    }
  });
}

const share = total ? Math.round((dead.length / total) * 100) : 0;
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
    '\n  A list to judge, never a gate. A rule whose EVERY class is listed cannot match\n' +
      '  anything, which is the only safe way to delete in bulk — then look at the rendered\n' +
      '  pages, because the tests pass either way and that is the whole problem.\n',
  ),
);
process.exit(0);

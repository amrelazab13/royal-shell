#!/usr/bin/env node
/**
 * A class a template writes must have a rule that can REACH it.
 *
 * Two faults, both found by hand on 12 October 2026 and neither catchable by
 * anything this module runs. They look different and they are the same fault:
 * CSS fails silently. A selector that matches nothing and a class that has no
 * selector both ship, for ever, to everybody, and no suite anywhere goes red.
 *
 *   1. **No rule at all.** Three screens marked their page-head sentence
 *      `.m-hint`, a class nothing in this app has ever defined. They had been
 *      rendering as a bare `<p>` — the browser's margin, the inherited colour
 *      — since the day they were written.
 *
 *   2. **A rule that cannot reach it.** `.mbody` and `.mfoot` are written by
 *      the SCREENS and projected into `<app-dialog>` through `<ng-content>`.
 *      Angular's emulated encapsulation stamps projected nodes with the
 *      PROJECTING component's attribute, so the dialog's own stylesheet —
 *      where those two rules lived — never matched them. Unstyled on every
 *      dialog in this module since they were introduced.
 *
 * `unused-css.mjs` runs the other way: it asks which RULES nothing uses. The
 * question here is which CLASSES nothing rules, and a module needs both.
 *
 * **The model, and it is Angular's, not an approximation.** A class written
 * in component A's template is reachable from:
 *   · a GLOBAL sheet — the ones `angular.json` lists, plus anything they
 *     `@use` (royal-shell's tokens, rail, masthead, needs, dialog);
 *   · A's OWN `styleUrl`, and only A's.
 * A rule in component B's sheet is invisible to A. That is case 2 above, and
 * it is the half a flat "is this name defined anywhere" check would miss.
 *
 * **It reads STATIC `class="…"` only**, so a name built at run time
 * (`[class]="'chip ' + tone(row)"`, `[ngClass]`, `[class.open]`) is invisible
 * to it and cannot produce a false finding. The cost is that it cannot prove
 * such a name has a rule either; `unused-css.mjs` says the same of itself
 * from the other side.
 *
 * **One class of name is not a finding, and it is a rule rather than an
 * allowlist.** A BEM block root is often written only to name its elements:
 * `<li class="m-card ask">` carries the visual weight in `.m-card`, and `.ask`
 * exists so `.ask__who` and `.ask__title` have a block to belong to. A bare
 * `.ask {}` rule would be empty. So a class with no rule of its own passes if
 * some sheet that CAN reach the template defines an element of it (`ask__…`).
 * That is BEM's own definition, not an exception carved for a file.
 *
 * There is no allowlist beyond that, on purpose: the first name in an
 * allowlist is the day a gate starts teaching people to scroll past it.
 *
 *   node build/check-classes-have-rules.mjs
 *
 * Exits 1 on any finding, 2 if it could not read what it was told to read —
 * a check that read nothing proves nothing (F40).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const APP = resolve(ROOT, 'src/app');
const ANGULAR = resolve(ROOT, 'angular.json');

const read = (f) => readFileSync(f, 'utf8');
/** Comments hold class names too — this file's own docstring is full of them. */
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const classesIn = (css) => new Set(strip(css).match(/\.[a-zA-Z_][\w-]*/g)?.map((c) => c.slice(1)));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const at = join(dir, name);
    if (statSync(at).isDirectory()) walk(at, out);
    else out.push(at);
  }
  return out;
}

const problems = [];

// ── the global sheets: what angular.json lists, and what those @use ──────────
// Read from angular.json rather than named here, so a sheet added to the build
// is covered without anybody remembering this file. The file carries comments,
// which JSON.parse will not: this wants the string values, so a regex over the
// styles array is both enough and immune to that.
if (!existsSync(ANGULAR)) {
  console.error(`No angular.json at ${ANGULAR}. Run this from frontend/.`);
  process.exit(2);
}
const stylesBlock = read(ANGULAR).match(/"styles"\s*:\s*\[([\s\S]*?)\]/);
if (!stylesBlock) {
  console.error('angular.json has no "styles" array; this check cannot know what is global.');
  process.exit(2);
}
const globalSheets = [...stylesBlock[1].matchAll(/"([^"]+\.s?css)"/g)].map((m) =>
  resolve(ROOT, m[1]),
);
if (globalSheets.length === 0) {
  console.error('angular.json lists no global stylesheet; nothing to check against.');
  process.exit(2);
}

const global = new Set();
const seen = new Set();
function addSheet(file, into) {
  const at = resolve(file);
  if (seen.has(at)) return;
  seen.add(at);
  if (!existsSync(at)) {
    problems.push(`a sheet this check was told to read is missing: ${relative(ROOT, at)}`);
    return;
  }
  const css = read(at);
  for (const c of classesIn(css)) into.add(c);
  // `@use './shared/dialog/dialog';` → src/shared/dialog/_dialog.scss. Sass
  // finds the partial's underscore; so does this. Stripped first: these files
  // document their own `@use` line in a comment, and a comment imports nothing.
  for (const [, spec] of strip(css).matchAll(/@use\s+['"]([^'"]+)['"]/g)) {
    const base = resolve(dirname(at), spec);
    const candidate = [`${base}.scss`, `${base}.css`, join(dirname(base), `_${base.split('/').pop()}.scss`)].find(
      existsSync,
    );
    if (candidate) addSheet(candidate, into);
    else problems.push(`@use '${spec}' in ${relative(ROOT, at)} resolves to no file`);
  }
}
for (const sheet of globalSheets) addSheet(sheet, global);

// ── each component: the template it writes, the one sheet that can reach it ──
const files = walk(APP);
/** Every class any COMPONENT sheet defines, so a finding can say which of the
    two faults it is without re-reading the tree once per finding. */
const inSomeComponentSheet = new Set();
for (const css of files.filter((f) => f.endsWith('.css'))) {
  for (const c of classesIn(read(css))) inSomeComponentSheet.add(c);
}
const findings = [];
let templatesRead = 0;

for (const ts of files.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
  const source = read(ts);
  const own = new Set(global);
  for (const [, href] of source.matchAll(/styleUrls?\s*:\s*\[?\s*'([^']+)'/g)) {
    const sheet = resolve(dirname(ts), href);
    if (!existsSync(sheet)) {
      problems.push(`${relative(ROOT, ts)} names a styleUrl that is not there: ${href}`);
      continue;
    }
    for (const c of classesIn(read(sheet))) own.add(c);
  }

  const templates = [];
  for (const [, href] of source.matchAll(/templateUrl\s*:\s*'([^']+)'/g)) {
    const html = resolve(dirname(ts), href);
    if (!existsSync(html)) {
      problems.push(`${relative(ROOT, ts)} names a templateUrl that is not there: ${href}`);
      continue;
    }
    templates.push([relative(ROOT, html), read(html)]);
  }
  const inline = source.match(/template\s*:\s*`([\s\S]*?)`\s*,?\n/);
  if (inline) templates.push([relative(ROOT, ts), inline[1]]);

  for (const [where, markup] of templates) {
    templatesRead++;
    for (const [, written] of markup.matchAll(/\sclass="([^"{}]*)"/g)) {
      for (const name of written.split(/\s+/).filter(Boolean)) {
        if (own.has(name)) continue;
        // A BEM block root whose ELEMENTS are styled here needs no rule of
        // its own; see the note at the top.
        if ([...own].some((c) => c.startsWith(`${name}__`))) continue;
        findings.push({
          name,
          where,
          // The two faults read differently to whoever fixes them, so say which.
          why: inSomeComponentSheet.has(name)
            ? "another component's sheet has it, which cannot reach this template"
            : 'no rule anywhere',
        });
      }
    }
  }
}

if (templatesRead === 0) {
  console.error('No templates were read. Nothing was proved; this is an error, not a result.');
  process.exit(2);
}
if (problems.length) {
  console.error(`could not check properly:\n  ${problems.join('\n  ')}`);
  process.exit(2);
}

if (findings.length) {
  console.error(`${findings.length} class(es) written with no rule that can reach them:\n`);
  for (const f of findings) console.error(`  .${f.name.padEnd(24)} ${f.where}\n    ${f.why}`);
  console.error(
    `\nRead ${templatesRead} template(s) against ${global.size} global class name(s).` +
      '\nNothing goes red for these: they ship, and the screen just looks slightly wrong.',
  );
  process.exit(1);
}
console.log(
  `classes: every class in ${templatesRead} template(s) has a rule that reaches it ` +
    `(${global.size} global names).`,
);

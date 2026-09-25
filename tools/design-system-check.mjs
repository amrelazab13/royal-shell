#!/usr/bin/env node
/**
 * The design system, enforced rather than agreed.
 *
 * `royal-shell` holds one palette, one type scale, one set of radii and
 * shadows, and every Royal module consumes it as a submodule. Nothing stopped
 * a module redefining a token or hardcoding the hex behind one, which is how
 * the coverage drifted apart in the first place — the CRM defined 118 tokens,
 * HR 74, the CEO portal 47, and the apps with fewer reached for literals.
 *
 * Two rules, both about duplication and neither about taste:
 *
 *   1. Do not REDEFINE a token the shared package already names. A new token
 *      of your own is fine; a second `--ground` is not, because then there
 *      are two answers to one question.
 *   2. Do not HARDCODE a value the shared package already names. `#04161F`
 *      is `var(--ground)`; written as a literal it stops following the
 *      palette the moment the palette moves.
 *
 * Anything the shared package does not name is yours and is not checked.
 *
 * An exception, where one is genuinely needed:
 *     color: #04161F; /* design-system-ok: printed page, never themed *​/
 * The reason is required — an escape hatch with no reason is a silent opt-out.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TOKENS = 'src/shared/tokens/tokens.scss';
const SHARED = 'src/shared';
const LOOK_IN = 'src';
const EXTENSIONS = ['.scss', '.css', '.html', '.ts'];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (relative(ROOT, path).startsWith(SHARED)) continue;
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (EXTENSIONS.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

/** `#abc` -> `#aabbcc`, lowercased, so the two spellings compare equal. */
function normaliseHex(hex) {
  let value = hex.toLowerCase();
  if (value.length === 4) value = '#' + [...value.slice(1)].map((c) => c + c).join('');
  return value;
}

let tokensFile;
try {
  tokensFile = readFileSync(join(ROOT, TOKENS), 'utf8');
} catch {
  console.error(red(`\nThe shared design system is missing: ${TOKENS}`));
  console.error(
    `This module consumes it as a git submodule. Run:\n` +
      `  git submodule update --init --recursive\n` +
      `and make sure CI checks out with \`submodules: recursive\`.\n`,
  );
  process.exit(1);
}

// Comments out first. The file documents itself, and its header names
// `--ground: #04161F` and half a dozen others in prose; parsed as
// declarations those give a token a value that is the rest of a sentence.
const declarations = tokensFile.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

// name -> the value it is defined as, for the message.
const named = new Map();
for (const [, name, value] of declarations.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  if (!named.has(name)) named.set(name, value.trim());
}

// value -> the token that names it, read ONLY from the default `:root` block.
//
// The themes are the reason. `--surface` is #0a2233 on a dark page and
// #ffffff on a light one, so a map built from the whole file would answer
// "#fff is --surface" — and telling somebody to replace white with a token
// that is dark navy half the time is worse advice than saying nothing. One
// theme decides the names; the rest are that theme's alternatives.
const defaultBlock = declarations.slice(
  declarations.indexOf(':root'),
  (() => {
    const i = declarations.search(/@media|\[data-theme/);
    return i === -1 ? declarations.length : i;
  })(),
);
const byValue = new Map();
for (const [, name, value] of defaultBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
  const clean = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(clean) && !byValue.has(normaliseHex(clean))) {
    byValue.set(normaliseHex(clean), name);
  }
}

const problems = [];
const EXCUSED = /design-system-ok:\s*\S/;
// `:root` and bare `html` set the value for the whole document; anything else
// is a context. `body.side-collapsed { --sw: 60px }` and
// `@media (max-width: 980px) { body { --sw: 0 } }` are the token being USED as
// custom properties are meant to be — a default, overridden where it differs.
// Only a global redefinition is a second answer to the same question.
const GLOBAL_SELECTOR = /^\s*(:root|html)\s*(,|\{)/;

// A COMPONENT stylesheet (anything under src/app) is scoped by Angular's
// emulated encapsulation, which stamps every compound in a selector with the
// component's attribute — `<html>` included. So `html[lang='ar'] .x` there
// compiles to `html[lang="ar"][_ngcontent-…] .x[_ngcontent-…]` and can never
// match: valid CSS, clean build, passing tests, unchanged screen (the CEO
// portal, 26 Sep 2026; INCONSISTENCIES §11, F22). In a component sheet it is
// `:host-context(html[lang='ar'])`; a plain `html[…]` belongs in a global one.
const COMPONENT_SHEET = /^src\/app\//;
const ANCESTOR_ON_HTML = /(^|[\s,(>~+])html\[(lang|dir|data-theme)\b/;

for (const file of walk(join(ROOT, LOOK_IN))) {
  const shown = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  let global = false;
  const component = COMPONENT_SHEET.test(shown.replaceAll('\\', '/'));
  lines.forEach((line, i) => {
    if (
      component &&
      ANCESTOR_ON_HTML.test(line) &&
      !line.includes(':host-context(') &&
      !/querySelector|document\.|\.setAttribute/.test(line) &&
      !(EXCUSED.test(line) || (i > 0 && EXCUSED.test(lines[i - 1])))
    ) {
      problems.push({
        file: shown,
        line: i + 1,
        kind: 'can never match',
        said: line.trim().slice(0, 60),
        instead:
          "a component sheet cannot see <html>: use :host-context(html[lang='ar']) — or move the rule to a global stylesheet",
      });
    }
    if (GLOBAL_SELECTOR.test(line)) global = true;
    else if (/^\s*\}/.test(line)) global = false;
    else if (/\{\s*$/.test(line)) global = false;

    if (EXCUSED.test(line) || (i > 0 && EXCUSED.test(lines[i - 1]))) return;

    if (global) {
      for (const [, name] of line.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
        if (named.has(name)) {
          problems.push({
            file: shown,
            line: i + 1,
            kind: 'redefines globally',
            said: name,
            instead: `the shared tokens already say ${named.get(name)}`,
          });
        }
      }
    }

    for (const [hex] of line.matchAll(/#[0-9a-f]{3}(?:[0-9a-f]{3}(?:[0-9a-f]{2})?)?\b/gi)) {
      const token = byValue.get(normaliseHex(hex));
      if (token) {
        problems.push({
          file: shown,
          line: i + 1,
          kind: 'hardcodes',
          said: hex,
          instead: `use var(${token})`,
        });
      }
    }
  });
}

if (!problems.length) {
  console.log(
    `Design system: clean. ${named.size} shared tokens, none redefined and none hardcoded; no component rule aimed at <html>.`,
  );
  process.exit(0);
}

console.error(
  red(
    `\nThe design system is one place, and this module has ${problems.length} second opinions:\n`,
  ),
);
for (const p of problems.slice(0, 60)) {
  console.error(`  ${p.file}:${p.line}  ${p.kind} ${red(p.said)}`);
  console.error(dim(`      ${p.instead}`));
}
if (problems.length > 60) console.error(dim(`  …and ${problems.length - 60} more.`));
console.error(`\nUse the shared token, or say why not:  /* design-system-ok: <reason> */\n`);
process.exit(1);

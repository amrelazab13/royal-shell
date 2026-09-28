/**
 * No native date or time picker anywhere a person sees it (bible §8 C-5,
 * decided 28 Sep 2026; INCONSISTENCIES §8d).
 *
 * The owner, on HR's attendance screen: "fields not consistent in design with
 * our design bible". HR had built its own date filter out of native
 * `<input type="date">` on nine screens while royal-shell's control sat unused,
 * and no gate asked. Ranges use `app-date-range`; one date uses
 * `app-date-pick`. This fails a module whose templates still carry a native
 * picker.
 *
 *   node src/shared/tools/native-date-check.mjs [--src src]
 *
 * It reads templates (`.html`) and inline templates in `.ts`. It never walks
 * `src/shared` or `src/royal-ui` (the shared packages have their own gate).
 * A deliberate exception is named in ALLOWED with its reason, never by a
 * wider pattern. It refuses to pass on an empty walk (F73): a floor of files
 * read, printed on every run.
 *
 * Exits 1 on any finding.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const src = resolve(arg('--src', 'src'));
if (!existsSync(src)) {
  console.error(`native-date-check: no source folder at ${src}. Pass --src <path>.`);
  process.exit(2);
}

/** path (relative to --src) -> why this one native picker is allowed. Empty on purpose. */
const ALLOWED = {};

/** The input types that open a browser's own date or time picker. */
const NATIVE = /<input\b[^>]*\btype\s*=\s*["'](date|time|datetime-local|month|week)["']/gi;

const FLOOR = 5;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (['node_modules', 'shared', 'royal-ui', 'dist', '.angular'].includes(name)) return [];
    if (statSync(path).isDirectory()) return walk(path);
    if (path.endsWith('.html')) return [path];
    if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) return [path];
    return [];
  });
}

const files = walk(src);
if (files.length < FLOOR) {
  console.error(
    `native-date-check: only ${files.length} template files under ${src}; expected at least ${FLOOR}. ` +
      'The walk is broken, not the code it checks.',
  );
  process.exit(2);
}

const findings = [];
for (const file of files) {
  const rel = relative(src, file);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(NATIVE)) {
    if (ALLOWED[rel]) continue;
    const line = text.slice(0, match.index).split('\n').length;
    findings.push(`  ${rel}:${line}  <input type="${match[1]}">`);
  }
}

if (findings.length) {
  console.error('Native date/time pickers (bible §8 C-5: use app-date-range or app-date-pick):\n');
  console.error(findings.join('\n'));
  console.error(`\n${findings.length} found in ${files.length} files read.`);
  process.exit(1);
}
console.log(`native-date-check: ${files.length} files read, 0 native date/time pickers.`);

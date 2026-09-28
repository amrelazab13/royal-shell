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

/**
 * A module's deliberate exceptions live in ITS OWN file (a module never edits
 * this shared tool): `native-date-allow.json` in the folder that HOLDS `src`
 * (for a frontend at `frontend/src`, that is `frontend/native-date-allow.json`),
 * shaped `{ "path/in/src#type": "why, and what ends it" }`, e.g.
 * `"app/features/attendance/attendance.html#time": "…"`.
 *
 * An entry names ONE type in ONE file (HR, 28 Sep 2026: a whole-file entry
 * would silently exempt a native DATE added to that file later). Every entry
 * needs a reason a reader can judge, and an entry with nothing left to allow
 * fails the run, so an exemption cannot outlive its cause.
 */
const allowFile = resolve(src, '..', 'native-date-allow.json');
const ALLOWED = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : {};
for (const [path, why] of Object.entries(ALLOWED)) {
  if (!/#(date|time|datetime-local|month|week|dynamic)$/.test(path)) {
    console.error(
      `native-date-check: the allowance "${path}" must name one type: "${path}#time" (or #date, #datetime-local, #month, #week).`,
    );
    process.exit(2);
  }
  if (typeof why !== 'string' || why.trim().length < 20) {
    console.error(
      `native-date-check: the allowance for ${path} needs a real reason (20+ characters).`,
    );
    process.exit(2);
  }
}

/** The input types that open a browser's own date or time picker. */
const NATIVE = /<input\b[^>]*\btype\s*=\s*["'](date|time|datetime-local|month|week)["']/gi;

/**
 * The same picker, reached WITHOUT the literal: a field list that says
 * `type: 'date'` and a template that binds `[type]="f.type"` (HR's person file,
 * 28 Sep 2026: the birth date rendered native, and a check reading
 * `type="date"` could never see it). Both halves are findings; a dynamic
 * binding that never carries a date (a password show/hide) is allowed by name
 * as `path#dynamic`.
 */
const CONFIGURED = /\btype\s*:\s*[`"'](date|time|datetime-local|month|week)[`"']/gi;
const DYNAMIC = /<input\b[^>]*\[(?:attr\.)?type\]\s*=\s*"([^"]*)"/gi;
const DATE_WORD = /^(date|time|datetime-local|month|week)$/i;
/** A bound type is safe only when it can hold nothing but fixed non-date
 *  words: one quoted word, or `condition ? 'a' : 'b'`. Anything that reads a
 *  value (`f.type`, `f.type ?? 'text'`) could hold 'date', and is a finding. */
const boundSafely = (expr) => {
  const e = expr.trim();
  if (e.includes('??')) return false;
  const single = e.match(/^'([^']*)'$/);
  const ternary = e.match(/^[^?'"]+\?\s*'([^']*)'\s*:\s*'([^']*)'$/);
  const words = single ? [single[1]] : ternary ? [ternary[1], ternary[2]] : null;
  return !!words && words.every((w) => !DATE_WORD.test(w));
};

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

/** Comments are not templates: a note that SAYS `<input type="date">` is not one. */
const stripComments = (text, isTs) =>
  isTs
    ? text
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
    : text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

const findings = [];
const allowedUsed = new Set();
for (const file of files) {
  const rel = relative(src, file);
  const text = stripComments(readFileSync(file, 'utf8'), file.endsWith('.ts'));
  const hits = [
    ...[...text.matchAll(NATIVE)].map((m) => [m, m[1].toLowerCase(), `<input type="${m[1]}">`]),
    ...[...text.matchAll(CONFIGURED)].map((m) => [
      m,
      m[1].toLowerCase(),
      `type: '${m[1]}' (a field list)`,
    ]),
    ...[...text.matchAll(DYNAMIC)]
      .filter((m) => !boundSafely(m[1]))
      .map((m) => [m, 'dynamic', `<input [type]="${m[1]}"> (bound at run time)`]),
  ];
  for (const [match, type, what] of hits) {
    const key = `${rel}#${type}`;
    if (ALLOWED[key]) {
      allowedUsed.add(key);
      continue;
    }
    const line = text.slice(0, match.index).split('\n').length;
    findings.push(`  ${rel}:${line}  ${what}`);
  }
}

const stale = Object.keys(ALLOWED).filter((path) => !allowedUsed.has(path));
if (stale.length) {
  console.error(
    `native-date-check: allowances with nothing left to allow (remove them): ${stale.join(', ')}`,
  );
  process.exit(1);
}

if (findings.length) {
  console.error('Native date/time pickers (bible §8 C-5: use app-date-range or app-date-pick):\n');
  console.error(findings.join('\n'));
  console.error(`\n${findings.length} found in ${files.length} files read.`);
  process.exit(1);
}
const allowedCount = Object.keys(ALLOWED).length;
console.log(
  `native-date-check: ${files.length} files read, 0 native date/time pickers` +
    (allowedCount ? `; ${allowedCount} file(s) allowed by name in native-date-allow.json.` : '.'),
);

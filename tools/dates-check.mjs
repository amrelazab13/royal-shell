#!/usr/bin/env node
/**
 * The company's day is Cairo's day, enforced rather than remembered.
 *
 * Every Royal module stores instants in UTC and shows days in Cairo, and the
 * gap between the two is three hours wide. For three hours every evening —
 * 21:00 to midnight Cairo, longer in winter — the UTC date is yesterday's.
 * A fault in that window is invisible for the other twenty-one hours, so it
 * survives review, survives CI, and is found by whoever happens to be
 * working late. The CEO portal shipped three of them and found them at 00:08
 * (INCONSISTENCIES §11, F14): a follow-up promised for tomorrow sat on the
 * calendar under today.
 *
 * Three shapes, all of them a day read from the wrong clock:
 *
 *   1. The UTC day of a TIMESTAMP, taken with `.slice(0, 10)`.
 *      `lead.next_follow_up_at.slice(0, 10)` is the first ten characters of
 *      an instant in UTC, which is not the day the company means.
 *          → isoDateInCairo(new Date(lead.next_follow_up_at))
 *
 *   2. Calendar arithmetic through the READER'S midnight: `setDate`,
 *      `setMonth`, `setFullYear` on a Date. These move the clock in whatever
 *      timezone the reader's machine keeps, and a day is not 24 hours in
 *      every one of them.
 *          → shiftIsoDate(day, n), monthEndOf(day)
 *
 *   3. A day parsed as LOCAL midnight: `new Date(day + 'T00:00:00')` with no
 *      `Z` and no offset. Same string, a different instant on every machine.
 *          → new Date(day + 'T00:00:00Z'), or the helpers above
 *
 * All three have an answer in the shared package already — royal-shell's
 * `dates/dates.ts` — so the message names it rather than leaving the author
 * to invent a fourth way.
 *
 * An exception, where one is genuinely needed:
 *     return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); // dates-ok: built in UTC, so the UTC day IS the day
 * The marker goes ON the line, or on the line DIRECTLY above it — a comment
 * block further up does not count, because a reason that drifts from its line
 * stops describing it.
 * The reason is required — an escape hatch with no reason is a silent
 * opt-out, and this is the rule most likely to be waved away in a hurry.
 * The shared package's own `dates.ts` is the honest case: it does its
 * arithmetic in UTC on a plain day, where no timezone is in play.
 *
 * Usage:  node src/shared/tools/dates-check.mjs [root]
 * Exits 1 on a finding, 0 on none. `src/shared` is not checked: it is the
 * shared package, and it is the thing being pointed at.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ? join(process.cwd(), process.argv[2]) : process.cwd();
const SHARED = 'src/shared';
const LOOK_IN = 'src';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (relative(ROOT, path).startsWith(SHARED)) continue;
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTENSIONS.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

/**
 * The rules. Each one finds a shape and says what to write instead.
 *
 * `find` is run per line and may match more than once; `said` is what the
 * message quotes back, so it is the matched text trimmed to something short
 * enough to read at the end of a line.
 */
// A value that came out of one of the shared Cairo helpers is already the
// company's day or clock (a call, possibly with one level of nested call in
// its arguments, ending right where the slice begins).
const CAIRO_SOURCE =
  /(?:toCairoInput|isoDateInCairo|toCairoIso|cairoClock|todayInCairo)\((?:[^()]|\([^()]*\))*\)\s*$/;

const RULES = [
  {
    kind: 'reads the UTC day of a timestamp',
    // `x.created_at.slice(0, 10)`, `l.next_follow_up_at!.slice(0, 10)`,
    // `row?.occurredAt?.substring(0, 10)`. The `!` and `?.` are TypeScript's,
    // and both sit between the name and the call.
    find: /\b([A-Za-z_$][\w$]*(?:_at|At))\b\s*[!?]*\.?\s*\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/g,
    instead: (m) =>
      `isoDateInCairo(new Date(${m[1]})) — the first ten characters are the UTC day, which is yesterday's for three hours every evening`,
  },
  {
    kind: 'reads the UTC day of an instant',
    find: /toISOString\(\)\s*\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/g,
    instead: () =>
      `isoDateInCairo(instant) for a timestamp, or say why the UTC day IS the day — a Date built with Date.UTC has no timezone in it`,
  },
  {
    kind: 'takes the first ten characters of an unknown value',
    // Whatever the name. The phone's repeat queue called its timestamp `iso`,
    // so the named rule above passed it and the fault stayed (26 Sep 2026).
    // A plain yyyy-mm-dd day is fine — say so on the line; a timestamp is F14.
    find: /\.(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/g,
    catchAll: true,
    slicesAString: true,
    instead: () =>
      `a TIMESTAMP becomes isoDateInCairo(new Date(x)); otherwise say why the line is right — a plain day, or a fault kept on purpose in a spec: // dates-ok: <reason>`,
  },
  {
    kind: 'takes the clock out of a timestamp string',
    // The other half of F14: `iso.slice(11, 16)` is the UTC hour and minute,
    // two or three hours behind the office. The phone's duplicates screen
    // showed the minute two records were entered on a clock nobody keeps.
    find: /\.(?:slice|substring|substr)\(\s*11\s*,\s*(?:16|19)\s*\)/g,
    slicesAString: true,
    instead: () =>
      `format the instant in Cairo (the shared dates helpers / the when pipe) — the characters after the T are UTC; or say why the line is right: // dates-ok: <reason>`,
  },
  {
    kind: "moves a day through the reader's midnight",
    // `.setUTCDate(` and friends are deliberate and do not match.
    find: /\.set(?:Date|Month|FullYear)\(/g,
    instead: () =>
      `shiftIsoDate(day, n) or monthEndOf(day) — a Date's setters move the clock in whatever timezone the machine keeps`,
  },
  {
    kind: 'parses a day as local midnight',
    // `new Date(iso + 'T00:00:00')`, with no Z and no offset after it.
    find: /['"`]T00:00(?::00(?:\.\d+)?)?['"`]/g,
    instead: () =>
      `append 'Z' — 'T00:00:00' with no zone is midnight on the reader's machine, a different instant in every timezone`,
  },
];

const EXCUSED = /dates-ok:\s*\S/;
const problems = [];

for (const file of walk(join(ROOT, LOOK_IN))) {
  const shown = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // A line of prose about the fault is not the fault. The comment above a
    // fix usually quotes the thing it replaced, and so does this file.
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (!code.trim() || /^\s*\*/.test(line)) return;
    // The excuse may sit on the line or on the line above it, because a long
    // line has nowhere left to put it.
    if (EXCUSED.test(line) || (i > 0 && EXCUSED.test(lines[i - 1]))) return;

    const taken = new Set();
    for (const rule of RULES) {
      rule.find.lastIndex = 0;
      for (const m of code.matchAll(rule.find)) {
        // The catch-all names only what no specific rule already named.
        const end = m.index + m[0].length;
        if (rule.catchAll && taken.has(end)) continue;
        // Slicing what a Cairo helper just returned is the recommended idiom,
        // not the fault: `toCairoInput(x).slice(11, 16)` IS the Cairo minute.
        // Asking about right code teaches people to mark without reading.
        if (rule.slicesAString && CAIRO_SOURCE.test(code.slice(0, m.index))) continue;
        taken.add(end);
        problems.push({
          file: shown,
          line: i + 1,
          kind: rule.kind,
          said: m[0].length > 46 ? m[0].slice(0, 45) + '…' : m[0],
          instead: rule.instead(m),
        });
      }
    }
  });
}

if (!problems.length) {
  console.log('Dates: clean. Every day in this module is the company’s day.');
  process.exit(0);
}

console.error(
  red(
    `\nThe company's day is Cairo's day, and ${problems.length} line${problems.length === 1 ? '' : 's'} read a different one:\n`,
  ),
);
for (const p of problems.slice(0, 60)) {
  console.error(`  ${p.file}:${p.line}  ${p.kind}: ${red(p.said)}`);
  console.error(dim(`      ${p.instead}`));
}
if (problems.length > 60) console.error(dim(`  …and ${problems.length - 60} more.`));
console.error(
  `\nThe helpers are in royal-shell: isoDateInCairo, todayInCairo, shiftIsoDate, monthEndOf.` +
    `\nOr say why the line is right:  // dates-ok: <reason>\n`,
);
process.exit(1);

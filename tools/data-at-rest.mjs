#!/usr/bin/env node
/**
 * What real data is lying around on this machine.
 *
 * 28 Sep 2026: Royal Me found a 598 MB copy of the CRM's customer book in its
 * scratch directory, forgotten. The CEO portal then found the same file, the
 * same size, taken the same day — so it was a habit rather than a mistake.
 * Both are deleted.
 *
 * The reason it sat there for three days is the part worth fixing. A scratch
 * directory is in no repository, so no gate, no review and no `git status`
 * was ever going to mention it. A line in a release request depends on
 * somebody remembering to look; this does not.
 *
 * **It prints counts, never values.** A tool written to find leaked data must
 * not be the thing that copies it into a CI log, a terminal scrollback or a
 * message to another conversation. Filenames, sizes and counts only.
 *
 * **It reads CONTENT, not file types.** The first draft only opened files that
 * were big or row-shaped, and the CRM then found 57 company addresses sitting
 * in ordinary `.txt` files and foreign phone numbers in scripts — which that
 * draft would have walked straight past. A copy of somebody's data does not
 * announce itself with an extension. So every readable file is read, with a
 * cap per file so a huge one cannot stall the sweep.
 *
 * **It tries not to cry wolf.** A guard that fires on every seed file is a
 * guard people learn to skip, so a database or a big file on its own is
 * reported and does NOT fail — only real-looking CONTENT does.
 *
 *   node src/shared/tools/data-at-rest.mjs                  # this tree, and the scratchpads
 *   node src/shared/tools/data-at-rest.mjs --in /some/dir   # somewhere else (repeatable)
 *   node src/shared/tools/data-at-rest.mjs --max-mb 20      # a different "big"
 *   node src/shared/tools/data-at-rest.mjs --quiet          # findings only
 *
 * Exit 1 when anything real is found.
 */
import { createReadStream, existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const MAX_MB = Number(flag('--max-mb', 5));
/** How much of one file to read. A copy of anything is visible in 32 MB. */
const READ_CAP = 32 * 1024 * 1024;
const QUIET = args.includes('--quiet');
const given = args.flatMap((a, i) => (a === '--in' ? [args[i + 1]] : []));

/** Directories whose contents are somebody else's, or are rebuilt from source. */
const SKIP = new Set([
  'node_modules',
  '.git',
  '.angular',
  '.venv',
  '__pycache__',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.mypy_cache',
  '.pytest_cache',
]);

/** Shapes that hold rows rather than code. */
const SHAPES =
  /\.(sqlite3?|db|sql|dump|bak|csv|tsv|xlsx?|parquet|ndjson|jsonl)$|\.(json|csv|sql)\.gz$|\.(tar\.gz|tgz|zip)$/i;

/**
 * An email at a domain that is not a test domain.
 *
 * The excluded list is every domain this system's fixtures are allowed to use
 * plus the reserved ones. A fixture at `@fixture.invalid` is the rule working;
 * anything else is somebody's address.
 */
// The lengths are BOUNDED on purpose, and 64 is the local part's real limit.
// Written open-ended (`+@`), this walks a megabyte of ordinary letters forward
// looking for an `@`, fails, steps back one character and does it again — and
// the scanner hung for ten minutes on a 2 MB file of nothing. A tool that
// stops when it meets a big file is a tool that never reports the big files,
// which are the ones worth reporting.
// The last label must be LETTERS. Without that, `@angular/common@22.1.7` in a
// lockfile reads as an address at the domain `22.1.7`, and the gate failed on
// a dependency list. Every real domain ends in letters; no version does.
const EMAIL =
  /[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,3}\.[A-Za-z]{2,24})/g;
const TEST_DOMAINS =
  /^(fixture\.invalid|example\.(com|org|net)|test|localhost|invalid|.*\.test|.*\.invalid|.*\.example)$/i;

/**
 * Addresses that belong to a machine, not a person.
 *
 * A Google service account in a deployment manifest is an infrastructure
 * identifier, committed on purpose and readable by anyone who can read the
 * repository. Failing a build over it teaches people that this tool is noise,
 * and the next real finding is skipped with it. Narrow on purpose: only
 * domains that cannot belong to a human being.
 */
const MACHINE_DOMAINS =
  /(^|\.)(iam\.gserviceaccount\.com|appspot\.gserviceaccount\.com|users\.noreply\.github\.com)$/i;

/** The company's own addresses, which are the clearest signal of all. */
const COMPANY = /@(?:[A-Za-z0-9-]+\.)?royal(?:dev|developments)[A-Za-z0-9-]*\.[A-Za-z]{2,}/gi;

/**
 * A phone number of ANY country, not just Egypt's.
 *
 * The CRM found foreign numbers sitting in scripts that an Egypt-only pattern
 * ignored. International form only (`+` and 8 to 15 digits), because a bare
 * run of digits is a version, a timestamp, an id or a hash far more often
 * than it is a person.
 */
const ANY_PHONE = /(?<![0-9A-Za-z])\+(?:[0-9][\s-]?){8,15}(?![0-9])/g;

/**
 * Arabic text, counted ONLY in files that are not source.
 *
 * This system's own code is full of Arabic — every screen is bilingual — so
 * counting it everywhere would report the entire repository and teach people
 * to ignore this. In a CSV, a dump, a log or a `.txt` it is somebody's name.
 */
const ARABIC = /[\u0600-\u06FF]{3,}/g;
const SOURCE = /\.(ts|tsx|js|mjs|cjs|jsx|py|scss|css|html|md|yml|yaml|json|toml|lock|sh|conf)$/i;

/** A picture of a live screen is a copy of what was on it. */
const SCREENSHOT = /\.(png|jpe?g|gif|webp|heic|pdf|mov|mp4)$/i;

/** An Egyptian mobile: 010/011/012/015 and eight digits, however it is spaced. */
// Any spacing a person might use: run together, grouped four and four, or
// in international form with the groups falling differently. The first draft
// fixed the grouping at four-and-four and missed the third, which the
// self-test caught by counting one where it had written two.
//
// Written as a description rather than as examples, because examples here are
// phone-shaped strings in a repository, which is the thing this reports.
const PHONE = /(?<![0-9])(?:\+?20[\s-]?|0)1[0125](?:[\s-]?[0-9]){8}(?![0-9])/g;

/** Where to look when nobody says. */
function defaultRoots() {
  const roots = [process.cwd()];
  // Session scratch directories. This is the place the fault actually lived,
  // and it is outside every repository by design.
  for (const base of ['/tmp', '/private/tmp']) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      if (!dir.startsWith('claude')) continue;
      walkForScratch(join(base, dir), roots, 0);
    }
  }
  // RESOLVED before de-duplicating: on macOS /tmp is a link to
  // /private/tmp, so every scratch file was read and counted twice (the
  // CRM, 1 Oct 2026: "78" was 39 files of its own). One real path, once.
  const real = roots.map((root) => {
    try {
      return realpathSync(root);
    } catch {
      return root;
    }
  });
  return [...new Set(real)];
}

function walkForScratch(dir, out, depth) {
  if (depth > 3) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'scratchpad') out.push(join(dir, e.name));
    else walkForScratch(join(dir, e.name), out, depth + 1);
  }
}

function* files(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* files(path);
    } else if (e.isFile()) {
      yield path;
    }
  }
}

/**
 * Count real-looking strings in a file, without holding it in memory and
 * without keeping a single one of them.
 */
async function countReal(path, { arabic = false } = {}) {
  const found = { emails: 0, company: 0, phones: 0, foreign: 0, arabic: 0 };
  let carry = '';
  let read = 0;
  const stream = createReadStream(path, { highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    // A cap per file: enough to find a copy of anything, bounded so one huge
    // file cannot stall a sweep that is meant to be run on every release.
    read += chunk.length;
    if (read > READ_CAP) break;
    // Latin-1 rather than utf8 so a chunk boundary cannot invent or destroy a
    // character; both patterns are ASCII, so nothing is missed.
    // Latin-1 keeps byte boundaries honest for the ASCII patterns; Arabic
    // needs the real characters, so it is read again as UTF-8.
    const text = carry + chunk.toString('latin1');
    for (const m of text.matchAll(EMAIL)) {
      if (TEST_DOMAINS.test(m[1]) || MACHINE_DOMAINS.test(m[1])) continue;
      // A company address is counted ONCE, as a company address. Counted as
      // both, a single company address (one mailbox at the company's domain) reached the "two is a list"
      // threshold on its own and turned every README into a finding.
      if (COMPANY.test('@' + m[1])) continue;
      found.emails += 1;
    }
    COMPANY.lastIndex = 0;
    found.company += [...text.matchAll(COMPANY)].length;
    found.phones += [...text.matchAll(PHONE)].length;
    found.foreign += [...text.matchAll(ANY_PHONE)].length;
    if (arabic) found.arabic += [...chunk.toString('utf8').matchAll(ARABIC)].length;
    // Keep the tail, in case a match straddles the boundary.
    carry = text.slice(-64);
  }
  return found;
}

const roots = given.length ? given : defaultRoots();
const looked = [];
const findings = [];
let seen = 0;

const pictures = [];

for (const root of roots) {
  if (!existsSync(root)) continue;
  for (const path of files(root)) {
    seen += 1;
    const size = statSync(path).size;
    const name = basename(path);
    if (SCREENSHOT.test(name)) {
      pictures.push({ path, size });
      continue;
    }
    looked.push({
      path,
      size,
      big: size > MAX_MB * 1024 * 1024,
      shaped: SHAPES.test(name),
      source: SOURCE.test(name),
    });
  }
}

for (const one of looked) {
  const counts = await countReal(one.path, { arabic: !one.source });
  const hits = counts.emails + counts.company + counts.phones + counts.foreign;
  // **One address is a contact; two is a list.**
  //
  // A README with the maintainer's address in it is documentation, and a tool
  // that fails a build over it is a tool people learn to skip — which is how
  // the 598 MB copy survived three days of everybody being careful. A copy of
  // somebody's book has ROWS. So a plain file needs two before it is a
  // finding, while a row-shaped or oversized file is a finding on one: a CSV
  // with a single person in it is still a copy of that person.
  const real = one.shaped || one.big ? hits : hits >= 2 ? hits : 0;
  // Arabic alone in a data file is reported but does not fail on its own: a
  // name list is a finding, a translated fixture is not, and only a person
  // can tell them apart.
  if (real || counts.arabic) findings.push({ ...one, ...counts, real });
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

if (!QUIET) {
  console.log(`data-at-rest: read ${looked.length} file(s) under ${roots.length} root(s).`);
  const notable = looked.filter((o) => o.big || o.shaped);
  for (const one of notable) {
    console.log(`  ${mb(one.size).padStart(9)}  ${one.shaped ? 'shaped' : 'large '}  ${one.path}`);
  }
}

if (pictures.length) {
  console.log(`\ndata-at-rest: ${pictures.length} picture(s) or recording(s).`);
  console.log('  A screenshot of a live screen is a copy of what was on it. List these to');
  console.log('  the owner and trash them on his word — this does not decide for him:');
  for (const one of pictures) console.log(`  ${mb(one.size).padStart(9)}  ${one.path}`);
}

const carrying = findings.filter((f) => f.real);
if (carrying.length) {
  console.error(
    `\ndata-at-rest: ${carrying.length} file(s) hold real-looking data. COUNTS ONLY:\n`,
  );
  for (const f of carrying) {
    const bits = [
      f.emails && `${f.emails} email(s) at a real domain`,
      f.company && `${f.company} COMPANY address(es)`,
      f.phones && `${f.phones} Egyptian mobile(s)`,
      f.foreign && `${f.foreign} international number(s)`,
      f.arabic && `${f.arabic} run(s) of Arabic text`,
    ].filter(Boolean);
    console.error(`  ${f.path}\n    ${mb(f.size)} · ${bits.join(' · ')}`);
  }
  console.error(
    `\nCount them, name them to the owner, then delete them. No copy of production` +
      `\nlives on a laptop (Royal New System/CLAUDE.md). Nothing above is a value —` +
      `\nand do not paste one anywhere to "check": the count is the check.`,
  );
  process.exit(1);
}

const onlyArabic = findings.filter((f) => !f.real);
if (onlyArabic.length) {
  console.log(`\ndata-at-rest: ${onlyArabic.length} non-source file(s) carry Arabic text.`);
  console.log('  Not a failure by itself — a list of names and a translated fixture look');
  console.log('  the same from here. Worth one look:');
  for (const f of onlyArabic) {
    console.log(`  ${mb(f.size).padStart(9)}  ${f.arabic} run(s)  ${f.path}`);
  }
}

console.log(`\ndata-at-rest: nothing holding real data. ${looked.length} file(s) read.`);

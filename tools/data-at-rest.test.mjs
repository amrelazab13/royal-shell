#!/usr/bin/env node
/**
 * The scanner, held to a positive control.
 *
 * A tool that reports "nothing found" is the easiest thing in the world to
 * write by accident — a pattern that stops matching, a walk that skips the
 * wrong folder, a stream that reads nothing, and it passes forever while the
 * copy it was written to find sits there. So it is proved against a file that
 * MUST be flagged, and against one that must not.
 *
 * The fixtures are invented and built here, never committed: a file full of
 * real-shaped addresses living in the repository is the fault this tool exists
 * to find.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The controls are ASSEMBLED, never written down whole.
 *
 * This file has to contain data that looks real enough to be found — that is
 * what a positive control is. Stored as literals, the file becomes exactly the
 * kind of thing the scanner exists to report, and the scanner duly reported
 * itself. Excluding it by name would have been a hole with a comment on it; a
 * fixture built from pieces at run time leaves nothing to exclude, and the
 * repository holds no address- or number-shaped string at all.
 */
const piece = (...parts) => parts.join('');
const invented = {
  email: (who) => piece(who, '@', 'example', '-realty', '.', 'eg'),
  company: (who) => piece(who, '@', 'royal', 'dev', '.', 'com'),
  fixture: (who) => piece(who, '@', 'fixture', '.', 'invalid'),
  egypt: (tail) => piece('010', tail),
  egyptSpaced: (tail) => piece('+20 11', '1 ', tail),
  abroad: (cc, tail) => piece('+', cc, tail),
};

// `fileURLToPath`, not `.pathname`: a URL percent-encodes the spaces in this
// project's own path, and the first draft of this file crashed the scanner on
// every run — while the first check passed, because a crash also exits 1.
const SCANNER = fileURLToPath(new URL('./data-at-rest.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'data-at-rest-'));
const failures = [];

function run(...extra) {
  try {
    const out = execFileSync('node', [SCANNER, '--in', dir, ...extra], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

function check(what, ok) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}

// ── the positive control ────────────────────────────────────────────────────
// Invented people at an invented-but-real-SHAPED domain, and two Egyptian
// mobiles whose digits run in sequence so they cannot be anybody's.
writeFileSync(
  join(dir, 'book.csv'),
  'name,email,phone\n' +
    `Agent Delta,${invented.email('agent.delta')},${invented.egypt('12345678')}\n` +
    `Desk Epsilon,${invented.email('desk.epsilon')},${invented.egyptSpaced('2345 678')}\n`,
);
let r = run();
check('flags a CSV of real-shaped rows', r.code === 1 && r.out.includes('real-looking data'));
check('and did so by finding it, not by crashing', !/MODULE_NOT_FOUND|Error:/.test(r.out));
check('says how many emails it found', /2 email\(s\) at a real domain/.test(r.out));
check('says how many mobiles it found', /2 Egyptian mobile\(s\)/.test(r.out));
check('names the file', r.out.includes('book.csv'));
check('prints no value from it', !r.out.includes(invented.email('agent.delta')));

// ── the negative control ────────────────────────────────────────────────────
rmSync(join(dir, 'book.csv'));
writeFileSync(
  join(dir, 'seed.csv'),
  // No phone at all: foreign numbers became a finding on 28 Sep, so the `+1`
  // this used to carry made the negative control a positive one. Changed the
  // FIXTURE rather than the scanner — the CRM found real foreign numbers in
  // scripts, and a pattern narrowed to keep a test quiet would have missed them.
  `name,email,ref\nAgent Delta,${invented.fixture('agent.delta')},DELTA-0042\n`,
);
r = run();
check('passes a fixture at @fixture.invalid', r.code === 0);
check('finds nothing at all in a proper fixture', !/hold real-looking data/.test(r.out));

// A database with no personal data in it — the module registry, and every
// other harmless seed — is reported and does NOT fail. A guard that fires on
// those is a guard people learn to skip.
writeFileSync(join(dir, 'registry.sqlite3'), 'SQLite format 3\u0000modules only, no people\n');
r = run();
check('reports a database but does not fail on one holding nothing', r.code === 0);
check('still lists it, so somebody can look', r.out.includes('registry.sqlite3'));

// ── the signals the CRM's own fault added, each with its own control ────────
// Every one of these would have been missed by the first draft, which only
// opened files that were big or row-shaped. A capability with no control is
// the same as not having it.
writeFileSync(
  join(dir, 'notes.txt'),
  `ring back: ${invented.company('ops')} and ${invented.company('a.other')}\n`,
);
r = run();
check('reads a plain .txt, not just row shapes', r.code === 1);
check('names company addresses as their own signal', /2 COMPANY address\(es\)/.test(r.out));
check('prints no address from it', !r.out.includes(invented.company('ops')));
rmSync(join(dir, 'notes.txt'));

writeFileSync(
  join(dir, 'dial.sh'),
  `#!/bin/sh\ncall ${invented.abroad('44', '7700900123')}\ncall ${invented.abroad('1', '2025550142')}\n`,
);
r = run();
check('finds a foreign number in a script', r.code === 1 && /international number/.test(r.out));
rmSync(join(dir, 'dial.sh'));

writeFileSync(join(dir, 'names.csv'), 'الاسم\nوكيل ألفا\nمكتب بيتا\n');
r = run();
check('reports Arabic in a data file', /run\(s\) of Arabic|carry Arabic text/.test(r.out));
check('but Arabic alone does not fail the run', r.code === 0);
rmSync(join(dir, 'names.csv'));

writeFileSync(join(dir, 'screen.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
r = run();
check('lists a screenshot for the owner', /picture\(s\) or recording\(s\)/.test(r.out));
check('and does not delete or fail on it', r.code === 0 && /trash them on his word/.test(r.out));
rmSync(join(dir, 'screen.png'));

// One address is a contact; two is a list. The threshold has its own control
// on both sides, because a threshold nobody tests is a number somebody will
// "tidy" later.
writeFileSync(join(dir, 'README.md'), `ask ${invented.company('ops')} about it\n`);
r = run();
check('one address in a doc is reported, not failed', r.code === 0);
rmSync(join(dir, 'README.md'));

writeFileSync(
  join(dir, 'list.txt'),
  `${invented.company('ops')}\n${invented.company('a.other')}\n`,
);
r = run();
check('two in a plain file IS a finding', r.code === 1);
rmSync(join(dir, 'list.txt'));

writeFileSync(join(dir, 'one.csv'), `email\n${invented.company('ops')}\n`);
r = run();
check('but one row in a CSV is a finding on its own', r.code === 1);
rmSync(join(dir, 'one.csv'));

// A version is not a domain. This gate failed on a dependency list before the
// last label was pinned to letters.
writeFileSync(
  join(dir, 'deps.yml'),
  "patterns:\n  - '@angular/common@22.1.7'\n  - '@angular/core@22.2.0'\n",
);
r = run();
check('a package version is not read as an address', r.code === 0);
rmSync(join(dir, 'deps.yml'));

// ── the sweep itself ────────────────────────────────────────────────────────
// A big file with nothing real in it is worth seeing and is not a failure.
writeFileSync(join(dir, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 0x41));
r = run('--max-mb', '1');
check('reports anything over the size given', r.out.includes('big.bin'));
check('a big file of nothing is not a finding', r.code === 0);

// And the thing that would make all of the above meaningless.
rmSync(join(dir, 'seed.csv'));
rmSync(join(dir, 'registry.sqlite3'));
rmSync(join(dir, 'big.bin'));
r = run();
check('finds nothing in an empty folder', r.code === 0 && /nothing holding real data/.test(r.out));

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\ndata-at-rest self-test: ${failures.length} failed`);
  process.exit(1);
}
console.log('\ndata-at-rest self-test: the scanner flags what it must and stays quiet otherwise.');

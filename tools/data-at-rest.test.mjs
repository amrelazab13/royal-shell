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
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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

// A placeholder is not a person: one or two distinct digits in the last eight.
writeFileSync(
  join(dir, 'fixtures.txt'),
  `${piece('0100 ', '000 ', '0000')}\n${piece('+20 ', '111 ', '111 ', '1111')}\n${piece('+44 ', '0000 ', '000000')}\n`,
);
r = run();
check('placeholder numbers are not findings', r.code === 0 && !r.out.includes('fixtures.txt'));
rmSync(join(dir, 'fixtures.txt'));
writeFileSync(
  join(dir, 'real.txt'),
  `${invented.egypt('12345678')}\n${invented.egypt('23456789')}\n`,
);
r = run();
check(
  'a number with varied digits still is (the control)',
  r.code === 1 && /2 Egyptian mobile/.test(r.out),
);
rmSync(join(dir, 'real.txt'));

// --project: this tree plus ONE module's scratch, and nobody else's.
{
  const base = mkdtempSync('/tmp/claude-dar-selftest-');
  const mine = join(base, 'proj-Mine', 's1', 'scratchpad');
  const theirs = join(base, 'proj-Theirs', 's1', 'scratchpad');
  mkdirSync(mine, { recursive: true });
  mkdirSync(theirs, { recursive: true });
  writeFileSync(
    join(mine, 'mine.txt'),
    `${invented.company('ops')}\n${invented.company('a.other')}\n`,
  );
  writeFileSync(
    join(theirs, 'theirs.txt'),
    `${invented.company('ops')}\n${invented.company('a.other')}\n`,
  );
  const cwd = mkdtempSync(join(tmpdir(), 'dar-cwd-'));
  writeFileSync(join(cwd, 'ok.txt'), 'nothing here\n');
  const go = (...a) => {
    try {
      return { code: 0, out: execFileSync('node', [SCANNER, ...a], { encoding: 'utf8', cwd }) };
    } catch (e) {
      return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
    }
  };
  r = go('--project', 'proj-Mine');
  check('--project reads its own scratch', r.code === 1 && r.out.includes('mine.txt'));
  check("--project does not read another module's scratch", !r.out.includes('theirs.txt'));
  r = go('--in', cwd, '--project', 'proj-Mine');
  check('--in with --project reads both, not one', r.code === 1 && r.out.includes('mine.txt'));
  check('and prints a count per root', /\n\s+\d+ seen\s+\S*dar-cwd-/.test(r.out));
  r = go('--project', 'proj-Nobody');
  check('--project with no matching scratch is COULD NOT LOOK', r.code === 2);

  // The scratchpad's siblings: a tool call's transcript and its screenshots.
  rmSync(join(mine, 'mine.txt'));
  const tasks = join(base, 'proj-Mine', 's1', 'tasks');
  mkdirSync(tasks, { recursive: true });
  const dashes = piece('-----');
  writeFileSync(
    join(tasks, 'call.output'),
    `grep found:\n${dashes}BEGIN ${piece('PRIVATE', ' KEY')}${dashes}\nTm90LXJlYWw=\n`,
  );
  r = go('--project', 'proj-Mine');
  check(
    'a key in the tasks/ sibling is read and fails',
    r.code === 1 && r.out.includes('call.output'),
  );
  writeFileSync(
    join(tasks, 'call.output'),
    `the pattern is ^${dashes}BEGIN ${piece('PRIVATE', ' KEY')}${dashes}$ (anchored)\n`,
  );
  r = go('--project', 'proj-Mine');
  check('a transcript that only MENTIONS the pattern stays quiet (the control)', r.code === 0);
  check('and tasks/ is counted as a root of its own', /\n\s+1 seen\s+\S*\/tasks\n/.test(r.out));
  rmSync(base, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
}

// A retina file name is not an address; committed artwork is counted, not listed.
writeFileSync(
  join(dir, 'Contents.json'),
  `${piece('AppIcon-512', '@', '2x', '.png')} ${piece('Splash', '@', '3x', '.png')}\n`,
);
r = run();
check('AppIcon-512 at 2x.png is not an address', r.code === 0 && !r.out.includes('Contents.json'));
rmSync(join(dir, 'Contents.json'));
mkdirSync(join(dir, 'assets', 'icons'), { recursive: true });
writeFileSync(join(dir, 'assets', 'icons', 'icon-192.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
writeFileSync(join(dir, 'capture.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
r = run();
check(
  'artwork is counted, not listed',
  /1 committed artwork/.test(r.out) && !r.out.includes('icon-192.png'),
);
check('a loose screenshot is still listed (the control)', r.out.includes('capture.png'));
rmSync(join(dir, 'assets'), { recursive: true });
rmSync(join(dir, 'capture.png'));

// A reserved domain run into the next column, as in a SQLite page, is still reserved.
writeFileSync(
  join(dir, 'dev.sqlite3'),
  `SQLite format 3\u0000${invented.fixture('a.one')}sales${invented.fixture('b.two')}hr\n`,
);
r = run();
check(
  'fixture.invalid run into the next field is not a real address',
  r.code === 0 && !/email\(s\) at a real domain/.test(r.out),
);
rmSync(join(dir, 'dev.sqlite3'));
writeFileSync(join(dir, 'testing.csv'), `email\n${piece('a', '@', 'testing', '.', 'com')}\n`);
r = run();
check('but a real domain that only starts with test still counts (the control)', r.code === 1);
rmSync(join(dir, 'testing.csv'));

// A uuid's hex tail glued to the next column's date is not a phone (SQLite).
writeFileSync(
  join(dir, 'attend.sqlite3'),
  `SQLite format 3\u0000${piece('fb39b1420d8b4ec8a44f999def9eb', '011')}${piece('2026', '-09-28')}present\n`,
);
r = run();
check('a hex tail run into a date is not a mobile', !/Egyptian mobile/.test(r.out));
rmSync(join(dir, 'attend.sqlite3'));
writeFileSync(
  join(dir, 'calls.csv'),
  `phone\n${invented.egypt('12345678')}\nTel:${invented.egypt('23456789')}\nm${invented.egypt('34567890')}\n`,
);
r = run();
check(
  'after a line start, a colon, or a non-hex letter it still counts (the control)',
  /3 Egyptian mobile/.test(r.out),
);
rmSync(join(dir, 'calls.csv'));

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
check(
  'an empty folder is COULD NOT LOOK, never a clean scan',
  r.code === 2 && /COULD NOT LOOK/.test(r.out),
);

// The two ways a scan used to read nothing and pass (the CEO portal, 2 Oct 2026).
writeFileSync(join(dir, 'one.csv'), `email\n${invented.company('ops')}\n`);
r = (() => {
  try {
    return {
      code: 0,
      out: execFileSync('node', [SCANNER, '--in', join(dir, 'one.csv')], { encoding: 'utf8' }),
    };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
})();
check('--in a FILE reads that file', r.code === 1 && r.out.includes('one.csv'));
rmSync(join(dir, 'one.csv'));
r = (() => {
  try {
    return {
      code: 0,
      out: execFileSync('node', [SCANNER, '--in', join(dir, 'no-such-place')], {
        encoding: 'utf8',
      }),
    };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') };
  }
})();
check(
  '--in a path that does not exist is COULD NOT LOOK',
  r.code === 2 && /do not exist/.test(r.out),
);

// A virtualenv's packages are skipped, whatever the folder is called.
mkdirSync(join(dir, 'tools-env', 'lib'), { recursive: true });
writeFileSync(join(dir, 'tools-env', 'pyvenv.cfg'), 'home = /usr/bin\n');
writeFileSync(
  join(dir, 'tools-env', 'lib', 'django.po'),
  `${invented.email('translator.one')}\n${invented.email('translator.two')}\n`,
);
writeFileSync(join(dir, 'keep.txt'), 'nothing here\n');
r = run();
check('a virtualenv is not read', r.code === 0 && !r.out.includes('django.po'));
rmSync(join(dir, 'tools-env', 'pyvenv.cfg'));
r = run();
check(
  'the same folder without pyvenv.cfg IS read (the control)',
  r.code === 1 && r.out.includes('django.po'),
);
rmSync(join(dir, 'tools-env'), { recursive: true });
rmSync(join(dir, 'keep.txt'));

// An empty file of a data shape holds no rows; a non-empty one is still shaped.
writeFileSync(join(dir, 'db.sqlite3'), '');
r = run();
check('an EMPTY db.sqlite3 is not reported as shaped', !/shaped .*db\.sqlite3/.test(r.out));
writeFileSync(join(dir, 'db.sqlite3'), 'SQLite format 3\u0000');
r = run();
check('the same name with content IS shaped (the control)', /shaped .*db\.sqlite3/.test(r.out));
rmSync(join(dir, 'db.sqlite3'));

// A bare company DOMAIN is not a mailbox (HR, 3 Oct 2026): a guard that refuses
// real addresses has to name the domain to recognise it.
writeFileSync(
  join(dir, 'guard.py'),
  `COMPANY = ("${piece('@', 'royal', 'dev', '.', 'com')}", "${piece('@', 'royal', 'developments', '.', 'com')}")\n`,
);
r = run();
check('a bare company domain is not a company address', r.code === 0 && !/COMPANY/.test(r.out));
writeFileSync(
  join(dir, 'guard.py'),
  `COMPANY = ("${invented.company('ops')}", "${invented.company('a.other')}")\n`,
);
r = run();
check(
  'the same file with mailboxes IS (the control)',
  r.code === 1 && /2 COMPANY address\(es\)/.test(r.out),
);
rmSync(join(dir, 'guard.py'));

// ── key material and dumps, each with a control that must NOT fire ─────────
// HR, 3 Oct 2026: a planted PEM block and a service-account file were READ and
// the scanner said "nothing holding real data". Every kind below fires on one,
// in any file; its documentation, written mid-line, does not.
const dashes = piece('-----');
const secretCases = [
  [
    'private key',
    `${dashes}BEGIN ${piece('PRIVATE', ' KEY')}${dashes}\nTm90LWEtcmVhbC1rZXktYXQtYWxs\n${dashes}END ${piece('PRIVATE', ' KEY')}${dashes}\n`,
    `the detector matches "${dashes}BEGIN ${piece('PRIVATE', ' KEY')}${dashes}" at a line start\n`,
  ],
  [
    'certificate',
    `${dashes}BEGIN ${piece('CERTIF', 'ICATE')}${dashes}\nTm90LWEtcmVhbA==\n`,
    `see ${dashes}BEGIN ${piece('CERTIF', 'ICATE')}${dashes} in the docs\n`,
  ],
  [
    'service-account key',
    `{"type": "service_account", "${piece('private', '_key_id')}": "${'3f9a'.repeat(10)}"}\n`,
    `{"type": "service_account", "${piece('private', '_key_id')}": "${'0'.repeat(40)}"}\n`,
  ],
  [
    'database dump',
    `${piece('--', ' PostgreSQL database dump')}\nSET statement_timeout = 0;\n`,
    `a file that starts ${piece('--', ' PostgreSQL database dump')} is a dump\n`,
  ],
];
for (const [kind, real, control] of secretCases) {
  writeFileSync(join(dir, 'planted.txt'), real);
  r = run();
  check(
    `one ${kind} in a plain file is a finding`,
    r.code === 1 && r.out.includes(kind.toUpperCase()),
  );
  writeFileSync(join(dir, 'planted.txt'), control);
  r = run();
  check(`its documentation, or a placeholder, is not (the control): ${kind}`, r.code === 0);
}
rmSync(join(dir, 'planted.txt'));

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\ndata-at-rest self-test: ${failures.length} failed`);
  process.exit(1);
}
console.log('\ndata-at-rest self-test: the scanner flags what it must and stays quiet otherwise.');

#!/usr/bin/env node
/**
 * unused-css.mjs, held to a control both ways.
 *
 * A class named only in a comment is dead; a class used in code is alive,
 * even when a glob string in the same file looks like a comment opening.
 * Undo the haystack's uncommenting and the three prose-only names read as
 * alive, and this fails.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL = fileURLToPath(new URL('./unused-css.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'unused-css-'));
let failed = 0;
try {
  mkdirSync(join(dir, 'src'));
  writeFileSync(
    join(dir, 'src/styles.scss'),
    ['/* a block comment', '   over three lines */', '.spin { a: b; }', '.go { a: b; }', '.warn { a: b; }', '.alive { a: b; }', '.globbed { a: b; }', '.after { a: b; }', '.panel { a: b; }'].join('\n'),
  );
  writeFileSync(
    join(dir, 'src/app.ts'),
    [
      '// a wheel a mouse can spin',
      '/* go here when ready */',
      "const files = 'src/**/*.ts';",
      "el.className = 'globbed';",
      "el.classList.add('after');",
      "const url = 'https://example.invalid/x'; // trailing note",
      "const box = viewChild.required('panel');",
    ].join('\n'),
  );
  writeFileSync(join(dir, 'src/app.html'), '<!-- warn the reader -->\n<div class="alive"></div>\n<div #panel></div>\n');
  const run = spawnSync(process.execPath, [TOOL], { cwd: dir, encoding: 'utf8' });
  const out = run.stdout;
  const dead = new Set([...out.matchAll(/styles\.scss:\d+\s+\.([\w-]+)/g)].map((m) => m[1]));
  const expect = (cond, msg) => {
    if (!cond) {
      failed += 1;
      console.error(`FAIL ${msg}`);
    } else console.log(`ok   ${msg}`);
  };
  expect(run.status === 0, 'exits 0 without --strict');
  for (const name of ['spin', 'go', 'warn']) expect(dead.has(name), `.${name}, named only in a comment, is dead`);
  for (const name of ['alive', 'globbed', 'after']) expect(!dead.has(name), `.${name}, used in code, is alive`);
  expect(/3 of 7 class names/.test(out), 'counts 3 of 7');
  const tsOnly = out.split('found only in TypeScript')[1] || '';
  expect(/\.panel\b/.test(tsOnly), '.panel, named only by a viewChild ref, is listed as TypeScript-only');
  expect(!/\.alive\b/.test(tsOnly), '.alive, used in a template, is not listed as TypeScript-only');
  expect(/styles\.scss:3\s+\.spin/.test(out), '.spin reported at its real line, 3, below a multi-line comment');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * F286 (the CEO portal, 12 Oct 2026): a bulk delete cut a slice ending
 * mid-line and left `} /* detail tabs … {` where `*\/` and `.dtabs {` had
 * been. Sass reads from that `/*` to the NEXT comment's `*\/`, so 640 lines
 * stopped compiling for a fortnight, and `--strict` stayed green: the gate
 * agreed with Sass, so the swallowed names were not dead, they were gone.
 * The sheet below is that shape: clean, it passes; with the one clause
 * planted, the gate must fail and name the line.
 */
const CLEAN = [
  '/* The page frame */',
  '.frame { display: grid; }',
  '.frame-head { padding: 4px; } /* the tabs — each section is a tab */',
  '.tabs {',
  '  display: flex;',
  '}',
  '.tabs-item { color: inherit; }',
  '/* Footer */',
  '.foot { margin: 0; }',
].join('\n');
const USES = '<div class="frame frame-head tabs tabs-item foot late"></div>\n';
const run = (sheet, ...args) => {
  const d = mkdtempSync(join(tmpdir(), 'unused-css-f286-'));
  try {
    mkdirSync(join(d, 'src'));
    writeFileSync(join(d, 'src/styles.scss'), sheet);
    writeFileSync(join(d, 'src/app.html'), USES);
    return spawnSync(process.execPath, [TOOL, ...args], { cwd: d, encoding: 'utf8' });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
};
const plant = (from, to) => {
  const out = CLEAN.replace(from, to);
  if (out === CLEAN) throw new Error(`the plant did not apply: ${from}`);
  return out;
};
const check = (cond, msg) => {
  if (!cond) {
    failed += 1;
    console.error(`FAIL ${msg}`);
  } else console.log(`ok   ${msg}`);
};
{
  const strict = (sheet) => run(sheet, '--strict');
  const r = strict(CLEAN + '\n.late { a: b; }');
  check(r.status === 0, `a sheet whose comments all close passes --strict (exit ${r.status})`);
  // The real F286 clause: the comment's `*/` and the next selector cut away.
  const broken = plant('each section is a tab */\n.tabs {', 'each section is a tab {') + '\n.late { a: b; }';
  const cut = strict(broken);
  check(cut.status === 1, `a comment that runs past another comment's opening fails (exit ${cut.status})`);
  check(/styles\.scss:3\b/.test(cut.stdout + cut.stderr), 'and names the line the comment opens on, 3');
  // And one never closed at all: the browser drops the rest of the file.
  const open = strict(CLEAN + '\n/* a trailing note\n.late { a: b; }');
  check(open.status === 1, `a comment never closed fails (exit ${open.status})`);
  check(/styles\.scss:10\b/.test(open.stdout + open.stderr), 'and names the line it opens on, 10');
  // Report-only mode is no excuse: a swallowed rule is not a judgement call.
  const lax = run(broken);
  check(lax.status === 1, `and fails without --strict too (exit ${lax.status})`);
}
process.exit(failed ? 1 : 0);

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
    ['/* a block comment', '   over three lines */', '.spin { a: b; }', '.go { a: b; }', '.warn { a: b; }', '.alive { a: b; }', '.globbed { a: b; }', '.after { a: b; }'].join('\n'),
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
    ].join('\n'),
  );
  writeFileSync(join(dir, 'src/app.html'), '<!-- warn the reader -->\n<div class="alive"></div>\n');
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
  expect(/3 of 6 class names/.test(out), 'counts 3 of 6');
  expect(/styles\.scss:3\s+\.spin/.test(out), '.spin reported at its real line, 3, below a multi-line comment');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

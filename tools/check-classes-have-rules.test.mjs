#!/usr/bin/env node
/**
 * `check-classes-have-rules.mjs`, held to the three answers it has to give.
 *
 *   node build/check-classes-have-rules.test.mjs
 *
 * **The third case is the control, and it is the one that matters.** "A class
 * with no rule is reported" is satisfied perfectly by a checker that reports
 * every class, which would be worse than nothing — it would be a gate the
 * next person turns off. So one case proves the fault with no rule anywhere
 * is caught, one proves the subtler fault (a rule that exists in a sheet
 * which cannot reach the template) is caught and NAMED as that, and one
 * proves a sound tree passes.
 *
 * A fourth, because this module keeps meeting instruments that cannot fail:
 * a run that read no template must exit 2 rather than pass.
 *
 * It builds a tiny project in a temp directory rather than mutating this one
 * — a mutation undone with `git checkout` takes uncommitted work with it,
 * which cost me the edits I was proving on 12 Oct 2026.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('./check-classes-have-rules.mjs', import.meta.url));
let failures = 0;
const bad = (what, saw) => {
  failures++;
  console.error(`  FAIL  ${what}\n        ${saw}`);
};
const ok = (what) => console.log(`  ok    ${what}`);

/** A minimal project: one global sheet, and the components given. */
function project({ global = '', components = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'royalme-classes-'));
  mkdirSync(join(root, 'src/app'), { recursive: true });
  writeFileSync(
    join(root, 'angular.json'),
    JSON.stringify({ projects: { x: { architect: { build: { options: { styles: ['src/styles.scss'] } } } } } }),
  );
  writeFileSync(join(root, 'src/styles.scss'), global);
  for (const c of components) {
    const dir = join(root, 'src/app', c.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${c.name}.html`), c.html);
    writeFileSync(
      join(dir, `${c.name}.ts`),
      `@Component({ templateUrl: './${c.name}.html'${c.css ? `, styleUrl: './${c.name}.css'` : ''} })\nexport class C {}\n`,
    );
    if (c.css) writeFileSync(join(dir, `${c.name}.css`), c.css);
  }
  return root;
}

function run(root) {
  const r = spawnSync(process.execPath, [CHECK], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const roots = [];
const check = (what, spec, expect) => {
  const root = project(spec);
  roots.push(root);
  const { code, out } = run(root);
  expect(what, code, out);
};

// 1. A class with no rule anywhere — the `.m-hint` fault.
check(
  'a class with no rule anywhere is reported',
  {
    global: '.known { color: red; }',
    components: [{ name: 'a', html: '<p class="known orphan">x</p>' }],
  },
  (what, code, out) => {
    if (code === 1 && out.includes('.orphan') && out.includes('no rule anywhere')) ok(what);
    else bad(what, `exit ${code}: ${out.trim()}`);
    if (!out.includes('.known')) ok('and a class that HAS a rule is not reported');
    else bad('a class with a rule is not reported', out.trim());
  },
);

// 2. A rule that exists but cannot reach the template — the `.mbody` fault.
//    `b` writes the class; only `a`'s sheet defines it.
check(
  "a rule in another component's sheet is reported as unreachable",
  {
    global: '',
    components: [
      { name: 'a', html: '<p>nothing</p>', css: '.mbody { padding: 1px; }' },
      { name: 'b', html: '<p class="mbody">x</p>' },
    ],
  },
  (what, code, out) => {
    if (code === 1 && out.includes('.mbody') && out.includes('cannot reach this template')) ok(what);
    else bad(what, `exit ${code}: ${out.trim()}`);
  },
);

// 3. THE CONTROL: a sound tree passes. Without this, 1 and 2 are both
//    satisfied by a checker that reports every class it sees.
check(
  'a tree where every class has a reachable rule PASSES',
  {
    global: '.known { color: red; }',
    components: [
      { name: 'a', html: '<p class="known mine">x</p>', css: '.mine { color: blue; }' },
      // A BEM block root styled only through its elements is not a finding.
      { name: 'b', html: '<li class="card"><span class="card__who">x</span></li>',
        css: '.card__who { color: blue; }' },
    ],
  },
  (what, code, out) => {
    if (code === 0) ok(what);
    else bad(what, `exit ${code}: ${out.trim()}`);
  },
);

// 4. An instrument that read nothing says so, rather than passing.
check(
  'a run that read no template exits 2, not 0',
  { global: '.known { color: red; }', components: [] },
  (what, code, out) => {
    if (code === 2) ok(what);
    else bad(what, `exit ${code}: ${out.trim()}`);
  },
);

for (const root of roots) rmSync(root, { recursive: true, force: true });

if (failures) {
  console.error(`check-classes-have-rules.test: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('check-classes-have-rules.test: both faults caught, a sound tree passes, 5 checks.');

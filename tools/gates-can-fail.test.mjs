#!/usr/bin/env node
/**
 * Every gate in this folder, made to fail on purpose.
 *
 *   node tools/gates-can-fail.test.mjs
 *
 * A gate that has never been seen to fail is a gate nobody knows works: a
 * pattern that stopped matching, a walk that skipped the folder, and it
 * passes for ever (unused-css stayed green for two weeks over 640 swallowed
 * lines, F286). So each gate is run, exactly as the modules' CI runs it, over
 * one module-shaped tree that must pass, then over the same tree with ONE
 * wrong clause planted, the shape the gate exists for, which must fail and
 * must say why. "Exit 1" alone is not enough: a crash exits 1 too, so every
 * plant also names the words the gate has to print.
 *
 * A plant whose search text is not in the tree throws, never passes: a
 * mutation that changed no byte reads exactly like a gate that caught it.
 *
 * unused-css has its own test (unused-css.test.mjs); the tree here is
 * invented, the tokens are this package's real ones.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const SHELL = join(TOOLS, '..');

const FONTS = [
  'cairo-arabic',
  'cairo-latin',
  'jetbrains-mono-latin',
  'jetbrains-mono-latin-ext',
  'nunito-latin',
  'nunito-latin-ext',
  'unbounded-latin',
  'unbounded-latin-ext',
];

/** A module's frontend folder, as small as every gate will still read it. */
const CLEAN = {
  'src/shared/tokens/tokens.scss': readFileSync(join(SHELL, 'tokens/tokens.scss'), 'utf8'),
  'angular.json': JSON.stringify(
    {
      projects: {
        app: {
          architect: {
            build: {
              options: {
                outputPath: 'dist/app',
                assets: [{ glob: '*.woff2', input: 'src/shared/fonts', output: 'fonts' }],
                styles: ['src/styles.scss', 'src/shared/masthead/masthead.scss'],
              },
            },
          },
        },
      },
    },
    null,
    2,
  ),
  'src/index.html':
    '<!doctype html>\n<html lang="en">\n<head><link rel="icon" href="favicon.ico"></head>\n' +
    '<body><app-root></app-root></body>\n</html>\n',
  'src/styles.scss': [
    "@use 'shared/fonts/fonts';",
    '.card { color: var(--ink); background: var(--ground); border-radius: 6px; }',
    '.empty { color: var(--ink); }',
  ].join('\n'),
  'src/app/layout/shell.html': [
    '<header class="top">',
    '  <button data-slot="burger" type="button"></button>',
    '  <a data-slot="logo" href="/"></a>',
    '  <span data-slot="module">Test module</span>',
    '  <div data-slot="bell"></div>',
    '  <button data-slot="language" type="button">ع</button>',
    '  <button data-slot="theme" type="button"></button>',
    '  <div data-slot="me"><button type="button">Sign out</button></div>',
    '</header>',
    '<main><router-outlet></router-outlet></main>',
  ].join('\n'),
  'src/app/leads/leads.html':
    '<div class="card">\n  <app-date-range></app-date-range>\n  <input type="text" />\n  <p class="row"></p>\n</div>\n',
  'src/app/leads/leads.ts': [
    "import { isoDateInCairo } from '../../shared/dates/dates';",
    '',
    'export const day = (lead: { created_at: string }) => isoDateInCairo(new Date(lead.created_at));',
    "export const start = (day: string) => new Date(day + 'T00:00:00Z');",
    '',
    "@Component({ selector: 'app-leads', templateUrl: './leads.html', styleUrl: './leads.scss' })",
    'export class Leads {}',
  ].join('\n'),
  'src/app/leads/leads.scss': [
    '/* The row was #04161F before the tokens: prose, never a hardcode. */',
    '.card { padding: 8px; }',
    '.row { color: var(--ink); }',
    ":host-context(html[lang='ar']) .row { text-align: right; }",
  ].join('\n'),
  'src/app/people/people.html':
    '<input [type]="show ? \'text\' : \'password\'" />\n<app-date-pick></app-date-pick>\n',
  'src/app/people/people.ts': [
    "export const FIELDS = [{ key: 'name', type: 'text' }];",
    "@Component({ selector: 'app-people', templateUrl: './people.html' })",
    'export class People {}',
  ].join('\n'),
  'src/app/home/home.html': '<section class="card"><p class="empty">Nothing yet</p></section>\n',
  // The build, as `ng build` leaves it: eight faces served from /fonts.
  ...Object.fromEntries(FONTS.map((f) => [`dist/app/browser/fonts/${f}.woff2`, ''])),
  'dist/app/browser/styles-T3ST.css': FONTS.map(
    (f) => `@font-face{font-family:x;src:url(/fonts/${f}.woff2) format("woff2")}`,
  ).join(''),
};

function run(gate, args, files) {
  const root = mkdtempSync(join(tmpdir(), 'gates-can-fail-'));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const r = spawnSync(process.execPath, [join(TOOLS, gate), ...args], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** One wrong clause in one file. Throws when the clause is not there. */
function plant(path, from, to) {
  const before = CLEAN[path];
  const after = before?.replace(from, to);
  if (before === undefined || after === before) throw new Error(`PLANT DID NOT APPLY: ${path}: ${from}`);
  return { ...CLEAN, [path]: after };
}

const DIST = ['dist/app/browser'];
// Each gate as the modules' CI calls it, the words a clean run prints (proof
// it read something), and the faults it exists for.
const GATES = [
  {
    gate: 'design-system-check.mjs',
    clean: /Design system: clean\. [1-9]\d* shared tokens/,
    plants: [
      ['hardcodes a token', plant('src/app/leads/leads.scss', '.row { color: var(--ink); }', '.row { color: #04161F; }'), 1, /hardcodes.*#04161F/],
      ['aims a component rule at <html>', plant('src/app/leads/leads.scss', ":host-context(html[lang='ar']) .row", "html[lang='ar'] .row"), 1, /can never match/],
      ['uses an undefined custom property', plant('src/styles.scss', '.empty { color: var(--ink); }', '.empty { color: var(--inc); }'), 1, /uses an undefined.*--inc/],
      ['redefines a shared token globally', plant('src/styles.scss', '.empty {', ':root { --ground: #000000; }\n.empty {'), 1, /redefines globally.*--ground/],
      // The default block read short (it did from 25 Sep to 17 Nov 2026): no
      // colour read must be COULD NOT CHECK, never "none hardcoded".
      ['a default block read as empty', plant('src/shared/tokens/tokens.scss', "[data-theme='dark'] {", "[data-theme='dark'] {}\n.x {"), 2, /COULD NOT CHECK: no colour token/],
    ],
  },
  {
    gate: 'dates-check.mjs',
    clean: /Dates: clean/,
    plants: [
      ['reads the UTC day of a timestamp', plant('src/app/leads/leads.ts', 'isoDateInCairo(new Date(lead.created_at))', 'lead.created_at.slice(0, 10)'), 1, /UTC day of a timestamp/],
      ['parses a day as local midnight', plant('src/app/leads/leads.ts', "'T00:00:00Z'", "'T00:00:00'"), 1, /local midnight/],
    ],
  },
  {
    gate: 'fonts-check.mjs',
    args: DIST,
    clean: /served from this origin, 8 files in the build/,
    plants: [
      ['links Google from index.html', plant('src/index.html', '<link rel="icon" href="favicon.ico">', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo">'), 1, /index\.html still links Google/],
      ['a built face fetched from Google', plant('dist/app/browser/styles-T3ST.css', 'url(/fonts/cairo-latin.woff2)', 'url(https://fonts.gstatic.com/s/cairo/v1/latin.woff2)'), 1, /reaches Google.*\n?[\s\S]*declares 7 @font-face/],
      ['the faces copied from the wrong folder', plant('angular.json', '"input": "src/shared/fonts"', '"input": "src/assets/fonts"'), 1, /does not copy src\/shared\/fonts/],
    ],
  },
  {
    gate: 'fonts-check.mjs',
    clean: /served from this origin$/m,
    plants: [
      ['(no build) the sheet takes no shared faces', plant('src/styles.scss', "@use 'shared/fonts/fonts';", "@use 'assets/fonts';"), 1, /does not @use 'shared\/fonts\/fonts'/],
    ],
  },
  {
    gate: 'masthead-check.mjs',
    clean: /burger → logo → module → bell → language → theme → me, in the bible's order/,
    plants: [], // below: a swap needs two edits in one file
  },
  {
    gate: 'native-date-check.mjs',
    clean: /native-date-check: 7 files read, 0 native/,
    plants: [
      ['a native date input', plant('src/app/leads/leads.html', '<input type="text" />', '<input type="date" />'), 1, /leads\.html:3\s+<input type="date">/],
      ['a field list that renders a date', plant('src/app/people/people.ts', "type: 'text'", "type: 'date'"), 1, /type: 'date' \(a field list\)/],
      ['a type bound to a value', plant('src/app/people/people.html', '[type]="show ? \'text\' : \'password\'"', '[type]="f.type"'), 1, /bound at run time/],
    ],
  },
  {
    gate: 'global-class-check.mjs',
    clean: /Global classes: clean\. [1-9]\d* bare global classes, [1-9]\d* component styles/,
    plants: [
      ['a component restates a global value', plant('src/app/leads/leads.scss', '.card { padding: 8px; }', '.card { padding: 8px; border-radius: 2px; }'), 1, /sets border-radius: 2px .* already says 6px/],
      ['a page condition in a component sheet', plant('src/app/leads/leads.scss', ":host-context(html[lang='ar']) .row", "[dir='rtl'] .row"), 1, /can never match in a component/],
      ['an emptied global sheet is no pass', { ...CLEAN, 'src/styles.scss': "@use 'shared/fonts/fonts';" }, 2, /empty or truncated/],
    ],
  },
];

// The masthead's plants: a swap is two edits, and a header the gate cannot
// find must read COULD NOT LOOK (2), never clean.
{
  const shell = 'src/app/layout/shell.html';
  const swapped = CLEAN[shell]
    .replace('data-slot="language" type="button">ع', 'data-slot="@@" type="button">ع')
    .replace('data-slot="theme"', 'data-slot="language"')
    .replace('data-slot="@@"', 'data-slot="theme"');
  if (swapped === CLEAN[shell]) throw new Error('PLANT DID NOT APPLY: masthead swap');
  GATES.find((g) => g.gate === 'masthead-check.mjs').plants = [
    ['two slots out of order', { ...CLEAN, [shell]: swapped }, 1, /"language" comes after "theme"/],
    ['a date control in the masthead', plant(shell, '<div data-slot="bell"></div>', '<div data-slot="bell"></div>\n  <app-date-range></app-date-range>'), 1, /a date control in the masthead/],
    ['a sign-out outside the avatar menu', plant(shell, '<div data-slot="bell"></div>', '<div data-slot="bell"><button>Sign out</button></div>'), 1, /sign-out outside the avatar menu/],
    ['the shared masthead sheet not loaded', plant('angular.json', 'src/shared/masthead/masthead.scss', 'src/shared/rail/rail.scss'), 1, /masthead\.scss is not loaded/],
    ['no masthead found reads COULD NOT LOOK', plant(shell, '<header class="top">', '<header class="bar">'), 2, /No <header class="top"> found/],
  ];
}

let failures = 0;
let checks = 0;
const expect = (cond, what, saw = '') => {
  checks += 1;
  if (cond) console.log(`  ok    ${what}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${what}\n${saw.replace(/^/gm, '        ')}`);
  }
};

for (const { gate, args = [], clean, plants } of GATES) {
  const shown = `${gate}${args.length ? ' ' + args.join(' ') : ''}`;
  const ok = run(gate, args, CLEAN);
  expect(ok.code === 0 && clean.test(ok.out), `${shown}: the clean tree passes and says what it read`, ok.out);
  expect(plants.length > 0, `${shown}: has faults planted`);
  for (const [what, files, code, says] of plants) {
    const r = run(gate, args, files);
    expect(r.code === code && says.test(r.out), `${shown}: ${what} → exit ${code}`, `exit ${r.code}\n${r.out}`);
    expect(!/\n\s+at .*\.mjs:\d+/.test(r.out), `${shown}: ${what} is a verdict, not a crash`, r.out);
  }
}

if (failures) {
  console.error(`\ngates-can-fail: ${failures} of ${checks} check(s) failed.`);
  process.exit(1);
}
console.log(`\ngates-can-fail: ${GATES.length} runs, every plant caught, every clean tree passed (${checks} checks).`);

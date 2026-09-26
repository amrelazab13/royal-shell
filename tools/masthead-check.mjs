/**
 * The masthead is the same in every module (bible §3.3; the owner, 26 Sep
 * 2026: "the differences between the modules are visible").
 *
 * Reads the module's shell template, finds `<header class="top">`, and checks
 * the `data-slot` of what it holds:
 *   - every slot is one of the bible's, in the bible's order;
 *   - the required ones are there: burger, logo, module, language, theme, me;
 *   - no date control and no second sign-out inside the masthead.
 * `masthead/masthead.scss` draws the order and hides anything without a slot;
 * this refuses the build before a module ships markup that would be hidden.
 *
 *   node src/shared/tools/masthead-check.mjs [--shell src/app/layout/shell.html]
 *
 * Exits 1 on a finding, 2 when it could not find the masthead at all (a check
 * that read nothing proves nothing, F40).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ORDER = [
  'burger',
  'logo',
  'module',
  'search',
  'online',
  'bell',
  'role',
  'language',
  'theme',
  'me',
];
const REQUIRED = ['burger', 'logo', 'module', 'language', 'theme', 'me'];

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function findShell() {
  const given = arg('--shell');
  if (given) return resolve(given);
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === 'node_modules' || n === 'shared') return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(html|ts)$/.test(n) ? [p] : [];
    });
  return walk(resolve('src')).find((f) =>
    /<header[^>]*class="[^"]*\btop\b/.test(readFileSync(f, 'utf8')),
  );
}

const shell = findShell();
if (!shell || !existsSync(shell)) {
  console.error('No <header class="top"> found. Pass --shell <file>.');
  process.exit(2);
}
const text = readFileSync(shell, 'utf8');
const open = text.search(/<header[^>]*class="[^"]*\btop\b/);
const close = text.indexOf('</header>', open);
const header = text.slice(open, close);

const slots = [...header.matchAll(/data-slot="([a-z]+)"/g)].map((m) => m[1]);
const found = [];

for (const s of slots) if (!ORDER.includes(s)) found.push(`unknown slot "${s}"`);
for (const r of REQUIRED) if (!slots.includes(r)) found.push(`missing slot "${r}"`);
const known = slots.filter((s) => ORDER.includes(s));
for (let i = 1; i < known.length; i++) {
  if (ORDER.indexOf(known[i]) < ORDER.indexOf(known[i - 1])) {
    found.push(`"${known[i]}" comes after "${known[i - 1]}"; the order is ${ORDER.join(' → ')}`);
  }
}
if (/date-range|daterange|type="date"/i.test(header)) {
  found.push('a date control in the masthead; it belongs in the filter bar (bible §4.8)');
}
const meAt = header.indexOf('data-slot="me"');
const outsideMe = meAt === -1 ? header : header.slice(0, meAt);
if (/sign ?out|signOut|تسجيل الخروج/i.test(outsideMe)) {
  found.push('a sign-out outside the avatar menu; the avatar is the one door (bible §3.3)');
}

const where = relative(process.cwd(), shell);
if (found.length) {
  console.error(`Masthead (${where}) differs from the bible:\n`);
  for (const f of found) console.error('  ' + f);
  process.exit(1);
}
console.log(`Masthead: ${where} holds ${known.join(' → ')}, in the bible's order.`);

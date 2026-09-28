#!/usr/bin/env node
// The fonts are served from the module's own origin (A-52, 29 Sep 2026).
//
// Fails when a module still reaches Google's font hosts, or does not take the
// shared faces. Run from the frontend root:
//     node src/shared/tools/fonts-check.mjs [built-browser-dir]
// With a built directory it also checks the eight files were copied to
// /fonts, because a stylesheet naming files that were never served draws the
// page in a fallback face and fails nowhere else (Royal Me met exactly that).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GOOGLE = /fonts\.(googleapis|gstatic)\.com/;
const problems = [];

const index = 'src/index.html';
if (!existsSync(index)) problems.push(`${index} not found: run from the frontend root`);
else if (GOOGLE.test(readFileSync(index, 'utf8')))
  problems.push(`${index} still links Google's font hosts; the faces come from src/shared/fonts`);

const styles = ['src/styles.scss', 'src/styles.css'].find((p) => existsSync(p));
if (!styles) problems.push('no src/styles.scss or src/styles.css found');
else {
  const text = readFileSync(styles, 'utf8');
  if (!/@use\s+['"][^'"]*shared\/fonts\/fonts['"]/.test(text) && !/@font-face/.test(text))
    problems.push(`${styles} does not @use 'shared/fonts/fonts'`);
  if (GOOGLE.test(text)) problems.push(`${styles} imports from Google's font hosts`);
}

const angular = existsSync('angular.json') ? readFileSync('angular.json', 'utf8') : '';
if (!/"input"\s*:\s*"src\/shared\/fonts"/.test(angular) && !existsSync('public/fonts'))
  problems.push('angular.json does not copy src/shared/fonts to /fonts (assets)');

const built = process.argv[2];
if (built) {
  const dir = join(built, 'fonts');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.woff2')) : [];
  if (files.length !== 8) problems.push(`${dir}: ${files.length} .woff2 files, expected 8`);
  for (const f of readdirSync(built).filter((f) => f.endsWith('.css'))) {
    if (GOOGLE.test(readFileSync(join(built, f), 'utf8'))) problems.push(`${f} reaches Google's font hosts`);
  }
}

if (problems.length) {
  console.error('fonts-check:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`fonts-check: served from this origin${built ? ', 8 files in the build' : ''}`);

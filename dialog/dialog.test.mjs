#!/usr/bin/env node
/**
 * _dialog.scss, held to its one load-bearing rule: the blur lives on
 * `.mscrim::before`, never on `.mscrim`. On `.mscrim` it would make the
 * scrim the containing block of the date control's fixed pop-up, which then
 * opens offset by the dialog's scroll. Move the blur back onto `.mscrim`, or
 * give `.mscrim` an opacity or filter (which blinds the blur), and this fails.
 *
 *   node dialog/dialog.test.mjs
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./_dialog.scss', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const block = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  return at === -1 ? null : css.slice(at, css.indexOf('}', at));
};

const failures = [];
const scrim = block('.mscrim');
const before = block('.mscrim::before');
if (!scrim) failures.push('.mscrim has no rule');
else if (/backdrop-filter|(^|[\s;])filter\s*:|opacity\s*:/.test(scrim))
  failures.push('.mscrim itself carries backdrop-filter, filter or opacity');
if (!before) failures.push('.mscrim::before has no rule');
else {
  if (!/backdrop-filter:\s*blur\(/.test(before)) failures.push('.mscrim::before does not blur');
  if (!/background:\s*var\(--scrim\)/.test(before))
    failures.push('.mscrim::before does not dim with var(--scrim)');
}
if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css)) failures.push('a literal colour; use the tokens');

if (failures.length) {
  console.error(`dialog.test: ${failures.length} failed\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log('dialog.test: 4 checks passed');

#!/usr/bin/env node
/**
 * Look at a module's real chrome in a browser, with nobody's password.
 *
 * Every visual fault this family of modules has shipped was invisible in a
 * diff and invisible to the tests: Royal Me's fonts refused by the browser
 * policy, its icons drawn as black blobs, the CEO portal's masthead hanging
 * out of its own bar because the owner's title is forty-seven characters
 * long. jsdom does no layout — `getBoundingClientRect()` is all zeros there —
 * so no unit test can see any of them. They need a browser.
 *
 * The obstacle was never the browser. It was that everything past the sign-in
 * door needs a real account, and a real account means typing somebody's real
 * password into something. This serves the module's OWN production build and
 * answers its API from a file of invented people, so the chrome that renders
 * is the chrome that ships and the data behind it belongs to no one.
 *
 *   node src/shared/tools/fixture-server.mjs [dist-dir] [fixtures.mjs] [port]
 *
 * Defaults: the build output named in angular.json, `fixtures/local.mjs`, and
 * port 8099. It binds to 127.0.0.1 and nothing else, so it is reachable from
 * this machine and from no other.
 *
 * THE RULE ABOUT THE FIXTURES FILE, which is the whole point of the tool:
 * invented people only. Never a row copied from production, never a real
 * name, e-mail, phone number or amount, never an export or a dump. A fixture
 * file is committed, and a committed file is forever. If a fault only shows
 * with real data, say so and reproduce it another way.
 *
 * What it is NOT: a mock server to develop against, and not a test harness.
 * It exists so a person can LOOK at a screen. A screen that needs a plausible
 * journey through the app needs the app, against a development backend.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = '127.0.0.1'; // never 0.0.0.0: this machine, and no other.

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Where `ng build` put the app, from angular.json, so no module writes its
 *  own name into a shared file. Same reading as check-headers.mjs. */
function builtDir() {
  const workspace = JSON.parse(
    readFileSync('angular.json', 'utf8').replace(
      /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      (m) => (m.startsWith('"') ? m : ''),
    ),
  );
  const [name, project] = Object.entries(workspace.projects ?? {})[0] ?? [];
  const out = project?.architect?.build?.options?.outputPath ?? `dist/${name}`;
  return `${typeof out === 'string' ? out : out.base}/browser`;
}

const dist = resolve(process.argv[2] ?? builtDir());
const fixturesPath = resolve(process.argv[3] ?? 'fixtures/local.mjs');
const port = Number(process.argv[4] ?? 8099);

for (const [what, path] of [
  ['build', join(dist, 'index.html')],
  ['fixtures file', fixturesPath],
]) {
  if (!existsSync(path)) {
    console.error(`No ${what} at ${path}`);
    console.error(
      what === 'build'
        ? 'Run `ng build --configuration production` first: this serves what ships, not a dev build.'
        : 'Write one — see the header of this file for the shape, and the rule about what may go in it.',
    );
    process.exit(1);
  }
}

const fixtures = await import(pathToFileURL(fixturesPath).href);
/** Exact path -> a body, or a function (url, request) -> a body. */
const answers = fixtures.api ?? {};
/** Anything under these that has no answer of its own gets `empty`. */
const prefixes = fixtures.apiPrefixes ?? ['/api/'];
/** What an unanswered call returns. A page waiting forever is a page that
 *  cannot be looked at, so the default is an empty list rather than a 404. */
const empty = fixtures.empty ?? { count: 0, results: [] };

const send = (res, status, type, body) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};
const json = (res, body) => send(res, 200, TYPES['.json'], JSON.stringify(body));

createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (Object.hasOwn(answers, path)) {
    const answer = answers[path];
    return json(res, typeof answer === 'function' ? answer(req.url, req) : answer);
  }
  if (prefixes.some((p) => path.startsWith(p))) return json(res, empty);

  // A file out of the build, or the app's own index for a client-side route.
  // `relative` keeps a crafted path inside the build directory; the server is
  // on loopback, but a tool that can be talked out of its own folder is a bad
  // habit whatever it is listening on.
  const file = join(dist, path === '/' ? 'index.html' : path.slice(1));
  const inside = (() => {
    const r = relative(dist, file);
    return r && !r.startsWith('..') && !isAbsolute(r);
  })();
  if (inside && existsSync(file) && statSync(file).isFile()) {
    return send(res, 200, TYPES[extname(file)] ?? 'application/octet-stream', readFileSync(file));
  }
  return send(res, 200, TYPES['.html'], readFileSync(join(dist, 'index.html')));
}).listen(port, HOST, () => {
  console.log(`Fixtures, not data.  http://${HOST}:${port}`);
  console.log(`  build     ${dist}`);
  console.log(`  fixtures  ${fixturesPath}`);
  console.log(`  answering ${Object.keys(answers).length} paths; ${prefixes.join(' ')} -> empty`);
});

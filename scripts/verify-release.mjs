import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFile(join(root, relative), 'utf8');
const manifest = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));

assert.equal(manifest.name, '@blcklab/kineox');
assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[a-z]+(?:\.\d+)*)?$/);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
assert.equal(manifest.publishConfig.access, 'public');
assert.ok(!manifest.private);
assert.deepEqual(manifest.files, ['dist', 'README.md', 'LICENSE'], 'Keep the npm allowlist minimal');

const ignore = await read('.gitignore');
assert.match(ignore, /^\.internal\/$/m, 'Internal notes must be ignored by Git');
const ci = await read('.github/workflows/ci.yml');
const publish = await read('.github/workflows/publish.yml');
for (const [file, content] of [['ci', ci], ['publish', publish]]) {
  assert.ok(content.includes('npm ci') && content.includes('npm run check'), `${file} must install and check`);
  assert.ok(content.includes('actions/checkout@v5') && content.includes('actions/setup-node@v5'), `${file} must use minimal actions`);
}
assert.match(ci, /branches:\s*\[master\]/);
assert.match(ci, /node:\s*\[20,\s*22,\s*24\]/);
assert.match(publish, /tags:\s*\n\s*-\s*'v\*'/);
assert.match(publish, /id-token:\s*write/);
assert.match(publish, /environment:\s*npm/);
assert.match(publish, /NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
assert.ok(publish.includes('GITHUB_REF_NAME') && publish.includes('NPM_DIST_TAG=next') && publish.includes('NPM_DIST_TAG=latest'));
assert.ok(publish.includes('npm publish --access public --provenance --tag "$NPM_DIST_TAG"'));
assert.ok(!ci.includes('pip install') && !publish.includes('pip install'), 'Workflows should stay simple');

const docsDir = join(root, 'docs');
const docs = (await readdir(docsDir)).filter(name => name.endsWith('.md'));
assert.ok(docs.length >= 8, 'Provide complete public guides');
assert.ok(!docs.some(name => /handoff|rc-validation|releasing|testing|milestone|internal/i.test(name)));
const pages = [join(root, 'README.md'), ...docs.map(name => join(docsDir, name))];
let links = 0;
for (const page of pages) {
  const md = await readFile(page, 'utf8');
  for (const match of md.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|#)/i.test(href)) continue;
    const localPath = href.split('#')[0];
    if (!localPath) continue;
    await access(resolve(dirname(page), localPath));
    links++;
  }
}
const readme = await read('README.md');
assert.ok(readme.includes(manifest.version));
for (const exported of ['mountPlayer', 'mountShowcase', 'createKineox']) assert.ok(readme.includes(exported));
assert.ok(!readme.includes('.internal/ROADMAP.md'), 'Maintainer links must not be public');
console.log(`Release verification passed: ${manifest.name}@${manifest.version}; ${docs.length} user guides, ${links} valid local links, minimal CI/publish workflows.`);

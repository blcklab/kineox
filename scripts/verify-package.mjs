import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const coreEntry = await readFile(new URL('../dist/core/index.js', import.meta.url), 'utf8');
const playerEntry = await readFile(new URL('../dist/player/index.js', import.meta.url), 'utf8');
const playerRuntime = await readFile(new URL('../dist/player/player.js', import.meta.url), 'utf8');
const showcaseEntry = await readFile(new URL('../dist/showcase/index.js', import.meta.url), 'utf8');
const showcaseRuntime = await readFile(new URL('../dist/showcase/showcase.js', import.meta.url), 'utf8');
const showcaseCss = await readFile(new URL('../dist/styles/showcase.css', import.meta.url), 'utf8');
const css = await readFile(new URL('../dist/styles/player.css', import.meta.url), 'utf8');
const themeEntry = await readFile(new URL('../dist/theme/index.js', import.meta.url), 'utf8');
const uiEntry = await readFile(new URL('../dist/ui/index.js', import.meta.url), 'utf8');
const behaviorEntry = await readFile(new URL('../dist/extensions/index.js', import.meta.url), 'utf8');
assert.equal(manifest.name, '@blcklab/kineox');
assert.equal(manifest.exports['.'].import, manifest.exports['./core'].import);
assert.equal(manifest.exports['./player'].import, './dist/player/index.js');
assert.equal(manifest.exports['./styles/player.css'], './dist/styles/player.css');
assert.ok(manifest.sideEffects.includes('./dist/styles/*.css'), 'Bundlers must retain opt-in CSS');
assert.ok(!/(?:player|showcase|react|vue|\.css)/.test(coreEntry), 'Core public entry must omit UI');
assert.ok(!/(?:showcase|react|vue|\.css)/.test(playerEntry), 'Player export must omit showcase and frameworks');
assert.ok(!/(?:\bfrom\s+['"][^'"]*(?:showcase|react|vue|\.css)|\bimport\s*\(['"][^'"]*(?:showcase|react|vue|\.css))/.test(playerRuntime), 'Player runtime must not import styles, showcase or frameworks');
assert.ok(manifest.exports['./showcase'].import === './dist/showcase/index.js');
assert.ok(manifest.exports['./styles/showcase.css'] === './dist/styles/showcase.css');
assert.ok(!/(?:\bfrom\s+['"][^'"]*(?:player|react|vue|\.css)|\bimport\s*\(['"][^'"]*(?:player|react|vue|\.css))/.test(showcaseRuntime));
assert.ok(!/(?:\bfrom\s+['"][^'"]*(?:player|react|vue|\.css))/.test(showcaseEntry));
assert.ok(showcaseCss.includes('.kx-showcase'), 'Showcase CSS must exist');
assert.ok(css.includes('.kx-player'), 'CSS skin must exist');
assert.equal(manifest.dependencies, undefined, 'Kineox must have zero runtime dependencies');
for (const entry of [themeEntry, uiEntry, behaviorEntry]) {
  assert.ok(!/from ['"][^'"]*(?:player|showcase|react|vue|\.css)/.test(entry), 'M4 independent extension entries cannot depend on UI implementations or CSS');
}
for (const name of ['theme','ui','extensions']) {
  assert.equal(manifest.exports[`./${name}`].import, `./dist/${name}/index.js`);
}
const core = await import('../dist/core/index.js');
const player = await import('../dist/player/index.js');
const showcase = await import('../dist/showcase/index.js');
const theme = await import('../dist/theme/index.js');
const ui = await import('../dist/ui/index.js');
const extensions = await import('../dist/extensions/index.js');
assert.equal(typeof core.createKineox, 'function', 'Headless public API exists');
assert.equal(typeof player.mountPlayer, 'function', 'Player public API exists');
assert.equal(typeof showcase.mountShowcase, 'function', 'Showcase public API exists');
assert.equal(typeof theme.createKineoxTheme, 'function');
assert.equal(typeof ui.createKineoxUIExtensionHost, 'function');
assert.equal(typeof extensions.createKineoxBehaviorHost, 'function');
assert.ok((await readdir(new URL('../dist/player/', import.meta.url))).includes('index.d.ts'));
// On Windows, npm is normally npm.cmd and is not directly executable via
// spawnSync without a shell. npm_execpath points at npm's JavaScript CLI
// when this verifier is launched by `npm run` on all supported platforms.
const npmCli = process.env.npm_execpath;
const listingArgs = ['pack', '--dry-run', '--ignore-scripts', '--json'];
const listing = spawnSync(npmCli ? process.execPath : 'npm',
  npmCli ? [npmCli, ...listingArgs] : listingArgs, {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    ...(!npmCli && process.platform === 'win32' ? { shell: true } : {})
  });
assert.ifError(listing.error);
assert.equal(listing.status, 0, listing.stderr || listing.stdout || 'npm pack failed');
const [result] = JSON.parse(listing.stdout);
const files = result.files.map(f => f.path);
for (const needed of [
  'dist/core/index.js','dist/core/index.d.ts','dist/player/index.js',
  'dist/player/index.d.ts','dist/showcase/index.js','dist/showcase/index.d.ts',
  'dist/styles/player.css','dist/styles/showcase.css',
  'dist/theme/index.js','dist/theme/index.d.ts','dist/ui/index.js','dist/ui/index.d.ts',
  'dist/extensions/index.js','dist/extensions/index.d.ts','README.md','LICENSE'
]) assert.ok(files.includes(needed), `Tarball missing ${needed}`);
assert.ok(files.every(p => !p.startsWith('tests/') && !p.startsWith('.internal/') &&
  !p.startsWith('docs/') && !p.startsWith('examples/') &&
  !p.startsWith('scripts/') && !p.startsWith('.github/') && !p.includes('node_modules')),
  'Unexpected private/test/developer files in npm pack');
console.log(`Package verification passed: ${files.length} published files; modular core/player/showcase/theme/ui/extensions exports; CSS opt-in; SSR-safe imports.`);

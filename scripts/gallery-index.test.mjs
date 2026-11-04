// 部品ギャラリーの入口 (examples/parts-gallery*.md) が、各パッケージのギャラリーを 1 本残らず指しているか。
// ギャラリーを足したのに入口へ書き忘れると、全部の部品を 1 か所から見られなくなる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const galleries = readdirSync(new URL('packages/', root))
  .filter((pkg) => existsSync(new URL(`packages/${pkg}/examples/`, root)))
  .flatMap((pkg) => readdirSync(new URL(`packages/${pkg}/examples/`, root))
    .filter((name) => /-gallery-.*\.md$/.test(name))
    .map((name) => `packages/${pkg}/examples/${name}`));

for (const page of ['examples/parts-gallery.ja.md', 'examples/parts-gallery.md']) {
  test(`${page} links every parts gallery`, () => {
    const text = readFileSync(new URL(page, root), 'utf8');
    assert.ok(galleries.length > 0);
    assert.deepEqual(galleries.filter((path) => !text.includes(`(../${path})`)), []);
  });
}

// scripts/images.mjs の「本文が図を指しているか」の数え方。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANAGED, referencedImages, referencesIn } from './images.mjs';

test('Markdown の画像とリンクを文書の場所から解く', () => {
  const found = referencesIn('packages/a-fence/examples/01-x.md', [
    '![図01](out/01-x-1.png)',
    '[大きく](out/01-x-1.svg "題")',
    '<img src="out/schematic/01-x.png" width="300">',
    '![上へ](../../b-fence/examples/out/02-y.png)',
  ].join('\n'));
  assert.deepEqual([...found].sort(), [
    'packages/a-fence/examples/out/01-x-1.png',
    'packages/a-fence/examples/out/01-x-1.svg',
    'packages/a-fence/examples/out/schematic/01-x.png',
    'packages/b-fence/examples/out/02-y.png',
  ]);
});

test('このリポジトリへの絶対 URL は解き、外の URL は捨てる', () => {
  const found = referencesIn('packages/tommie-fence/README.md', [
    '![a](https://raw.githubusercontent.com/tommie-jp/tommie-fence/main/packages/c-fence/examples/out/01.png)',
    '![b](https://github.com/tommie-jp/tommie-fence/blob/main/packages/c-fence/examples/out/02.png?raw=true)',
    '![c](https://example.com/out/03.png)',
    '![d](//cdn.example.com/04.png)',
  ].join('\n'));
  assert.deepEqual([...found].sort(), ['packages/c-fence/examples/out/01.png', 'packages/c-fence/examples/out/02.png']);
});

test('リポジトリの外を指すパスと、図でない物は数えない', () => {
  const found = referencesIn('README.md', '![x](../outside.png)\n[doc](docs/01.md)\n![y](a.png#frag)');
  assert.deepEqual([...found], ['a.png']);
});

test('数えるのは .md と .html だけ', () => {
  const texts = { 'a.md': '![](x.png)', 'b.ts': "const s = '![](y.png)';", 'c.html': '<img src="z.png">' };
  assert.deepEqual([...referencedImages(Object.keys(texts), (file) => texts[file])].sort(), ['x.png', 'z.png']);
});

test('追跡を絞るのは例と文書の out/ の下の PNG だけ', () => {
  assert.ok(MANAGED.test('packages/a-fence/examples/out/01.png'));
  assert.ok(MANAGED.test('packages/a-fence/docs/out/schematic/01.png'));
  assert.ok(!MANAGED.test('packages/a-fence/examples/out/01.svg'));
  assert.ok(!MANAGED.test('packages/tommie-fence/icon.png'));
  assert.ok(!MANAGED.test('examples/out/01.png'));
});

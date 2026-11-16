// scripts/file-size.mjs の行数の見張り。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, counted, problemsOf } from './file-size.mjs';

const table = { 'packages/a/src/big.ts': 1200 };

test('上限以下のファイルと、表の上限以下に収まっているファイルは通る', () => {
  assert.deepEqual(problemsOf([['packages/a/src/small.ts', LIMIT], ['packages/a/src/big.ts', 1200]], table), []);
  assert.deepEqual(problemsOf([['packages/a/src/big.ts', 1100]], table), []);
});

test('表に無いファイルが上限を越えたら落ちる', () => {
  assert.match(problemsOf([['packages/a/src/new.ts', LIMIT + 1], ['packages/a/src/big.ts', 1200]], table)[0], /new\.ts: 801 行/);
});

test('表のファイルが表の上限より大きくなったら落ちる', () => {
  assert.match(problemsOf([['packages/a/src/big.ts', 1201]], table)[0], /大きくしない/);
});

test('表のファイルが上限以下に縮んだか、無くなったら、表から外すよう言う', () => {
  assert.match(problemsOf([['packages/a/src/big.ts', LIMIT]], table)[0], /表から外す/);
  assert.match(problemsOf([], table)[0], /無くなった/);
});

test('数えるのはソースと道具だけ (試験と生成物は外す)', () => {
  assert.ok(counted('packages/a-fence/src/core/x.ts'));
  assert.ok(counted('packages/a-fence/scripts/png.mjs'));
  assert.ok(counted('scripts/images.mjs'));
  assert.ok(!counted('packages/a-fence/src/core/x.test.ts'));
  assert.ok(!counted('packages/fence-kit/src/parts/cards/bundled.gen.ts'));
  assert.ok(!counted('packages/a-fence/examples/x.md'));
  assert.ok(counted('scripts/profile/render.mjs'));
});

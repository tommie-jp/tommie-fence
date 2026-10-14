import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withLabels } from './fence-labels.mjs';

test('puts a name comment right after the opening line, in the fence spelling', () => {
  const out = withLabels('# t\n\n```bread\ntitle: a\n```\n\n- x\n\n  ```circuit\n  title: b\n  ```\n');

  assert.match(out, /```bread\n# ブレッドボードの実体配線図 \(tommie-fence の bread フェンス\)\ntitle: a/);
  assert.match(out, /  ```circuit\n  # 回路図 \(tommie-fence の circuit フェンス\)\n  title: b/);
  assert.equal(withLabels(out), out);
});

test('leaves other languages and fence contents alone, and replaces a stale name', () => {
  const text = '```js\nconst a = 1;\n```\n\n```scope\n# 古い (tommie-fence の scope フェンス)\ntitle: a\n```\n';
  const out = withLabels(text);

  assert.doesNotMatch(out, /古い/);
  assert.match(out, /```js\nconst a = 1;\n```/);
  assert.match(out, /```scope\n# オシロスコープの画面 \(tommie-fence の scope フェンス\)\ntitle: a/);
});

test('does not open a fence inside another fence', () => {
  const out = withLabels('````text\n```circuit\ntitle: a\n```\n````\n');

  assert.equal(out, '````text\n```circuit\ntitle: a\n```\n````\n');
});

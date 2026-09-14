import { describe, expect, test } from 'vitest';
import { applyRewrite } from 'fence-kit';
import { parseFence } from '../parser/parseFence.ts';
import { createBreadboardEditor } from './fenceEditor.ts';

/**
 * **1 行に並べた注釈と配線 (フロー形式)。** 名札は行番号なので、行を項目 1 つと
 * 見て書き換える操作は並べた形を壊していた (`] red`、`notes:` の鍵ごと複製など)。
 * 壊すくらいなら断る。綴りを差し替えるだけの操作は今までどおり通す。
 */
const editor = createBreadboardEditor();
const HEAD = 'board: half\nparts:\n  R1: resistor a5 a10\n';
const L = 4;

/** 通ったなら、読み直して注釈と配線の数が変わらず YAML も転ばないこと。 */
const keepsShape = (source: string, result: ReturnType<typeof editor.setField>): void => {
  if (!result.ok) return;
  const before = parseFence(source);
  const after = parseFence(applyRewrite(source, result.value));
  expect(after.doc.notes.length).toBe(before.doc.notes.length);
  expect(after.doc.wires.length).toBe(before.doc.wires.length);
  expect(after.errors.filter((e) => e.message.startsWith('YAML')).length)
    .toBe(before.errors.filter((e) => e.message.startsWith('YAML')).length);
};

describe('1 行に並べた注釈', () => {
  const ONE = `${HEAD}notes: [{text c8 blue: hi}]\n`;
  const TWO = `${HEAD}notes: [circle R1 red, {text c8 blue: hi}]\n`;

  test('字・向きを書き換える操作は断る (行を注釈 1 つと見ると鍵の : を字の区切りと取る)', () => {
    for (const result of [
      editor.setField(ONE, `note:${L}`, 'value', 'bye'),
      editor.turn(ONE, `note:${L}`, 1),
      editor.flip(ONE, `note:${L}`),
    ]) {
      keepsShape(ONE, result);
      expect(result.ok).toBe(false);
    }
  });

  test('複製は断る (行を写すと notes: の鍵ごと 2 行目ができる)', () => {
    expect(editor.duplicate(ONE, `note:${L}`, '').ok).toBe(false);
    expect(editor.duplicate(TWO, `note:${L}`, '').ok).toBe(false);
  });

  // **名札は行番号**なので、2 つ目を掴んでも 1 つ目を書き換えてしまう。
  test('2 つ以上並んでいれば、どれを掴んだか分からないので断る', () => {
    expect(editor.movePart(TWO, `note:${L}`, 'e5').ok).toBe(false);
    expect(editor.setField(TWO, `note:${L}`, 'value', 'bye').ok).toBe(false);
  });

  test('折り返した続きの行も同じ', () => {
    const source = `${HEAD}notes: [\n  {text c8 blue: hi}\n]\n`;
    const result = editor.setField(source, `note:${L + 1}`, 'value', 'bye');
    keepsShape(source, result);
    expect(result.ok).toBe(false);
  });

  test('ブロック形式の項目の中身をフロー形式で書いた形は、今までどおり直せる', () => {
    const source = `${HEAD}notes:\n  - {text c8 blue: hi}\n`;
    const result = editor.setField(source, `note:${L + 1}`, 'value', 'bye');
    expect(result.ok).toBe(true);
  });
});

describe('1 行に並べた配線', () => {
  test('色を書く操作は断る (行の終わりに足すと ] の外に出る)', () => {
    const source = `${HEAD}wires: [a1 -- a3, c1 -- c5 blue]\n`;
    const result = editor.setField(source, `wire:${L}`, 'color', 'red');
    keepsShape(source, result);
    expect(result.ok).toBe(false);
  });

  test('ブロック形式の配線は今までどおり色を書ける', () => {
    const source = `${HEAD}wires:\n  - a1 -- a3\n`;
    expect(editor.setField(source, `wire:${L + 1}`, 'color', 'red').ok).toBe(true);
  });
});

describe('1 行に並べた配線の端', () => {
  // 端の綴りを語で切り出すので、`[a1` や `a3,` の括弧と区切りまで差し替えていた。
  test('端を付け替える操作は断る (括弧と区切りを語の一部として差し替える)', () => {
    const source = `${HEAD}wires: [a1 -- a3, c1 -- c5 blue]\n`;
    for (const end of ['from', 'to'] as const) {
      const result = editor.moveWireEnd?.(source, `wire:${L}`, end, 'e5');
      if (result === undefined) continue;
      keepsShape(source, result);
      expect(result.ok).toBe(false);
    }
  });

  test('ブロック形式の配線は今までどおり端を付け替えられる', () => {
    const source = `${HEAD}wires:\n  - a1 -- a3\n`;
    expect(editor.moveWireEnd?.(source, `wire:${L + 1}`, 'to', 'e5').ok).toBe(true);
  });
});

import { describe, expect, test } from 'vitest';
import { createPerfboardEditor } from './perfboardEditor.ts';

/**
 * 板から張り出す形 (端面実装の同軸コネクタ)。**足が板の縁の外にあるのが
 * 正しい姿**なので、置く側と同じ規則で動かせなければならない。
 * 実機で「基板端に付けた SMA を選べない・動かせない」と分かった回の見張り。
 */
const SRC = [
  'board: 25x15',
  'parts:',
  '  J1: sma/female-edge e1 d0 f0',
  '  R1: resistor c3 c8',
  '',
].join('\n');

const editor = createPerfboardEditor();

describe('端面実装のコネクタ', () => {
  test('is drawn as something the map can grab', () => {
    expect(editor.view(SRC, 1).map).toContain('data-part="J1"');
    expect(editor.cellsOf(SRC, 'J1')).toEqual(['e1', 'd0', 'f0']);
  });

  test('moves along the edge, keeping the pins that hang off the board', () => {
    const moved = editor.movePart(SRC, 'J1', 'h1');

    expect(moved.ok).toBe(true);
  });

  test('turns and flips', () => {
    expect(editor.flip(SRC, 'J1').ok).toBe(true);
    // 回した先が板から離れすぎるときは、その理由を言って断る。
    const turned = editor.turn(SRC, 'J1', 1);
    expect(turned.ok || (!turned.ok && turned.error.message.includes('置けません'))).toBe(true);
  });

  test('offers a node on the pins that hang off the board, so they can be dragged', () => {
    // `G` で引きずるには、その番地に掴める升と点が立っていなければならない。
    const map = editor.view(SRC, 1).map;

    expect(map).toContain('data-address="d0"');
    expect(map).toContain('data-node="d0"');
  });

  test('drags the node the connector sits on', () => {
    expect(editor.movePoint(SRC, 'd0', 'd1').ok).toBe(true);
  });

  test('is deleted like any other part', () => {
    expect(editor.deletePart(SRC, 'J1').ok).toBe(true);
  });

  test('still keeps ordinary parts in their holes', () => {
    // 抵抗の足は穴に入っていなければならない (張り出す形ではない)。
    const off = editor.movePart(SRC, 'R1', 'c24');

    expect(off.ok).toBe(false);
    expect(!off.ok && off.error.message).toContain('板の外');
  });
});

describe('端面実装の複製', () => {
  test('copies the arrangement, since an edge mount cannot be rebuilt from one hole', () => {
    // 置き直す形にすると、足の並びが形で決まる部品は正しい姿を作り直せない。
    const copied = editor.duplicate(SRC, 'J1', 'J2');

    expect(copied.ok).toBe(true);
    const line = copied.ok
      ? copied.value.lines?.map((one) => (one.kind === 'insert' ? one.text : '')).join('')
      : '';
    // 種類も姿も残り、穴は 3 つとも斜めに 1 つずれる。
    expect(line).toContain('J2: sma/female-edge');
    expect(line).toContain('f2 e1 g1');
  });

  test('keeps the variant when duplicating any part written with one', () => {
    const src = 'board: 25x15\nparts:\n  C1: capacitor/electrolytic c3 c8 47u\n';

    const copied = editor.duplicate(src, 'C1', 'C2');

    expect(copied.ok && copied.value.lines?.some((one) => one.kind === 'insert'
      && one.text.includes('C2: capacitor/electrolytic') && one.text.includes('47u'))).toBe(true);
  });
});

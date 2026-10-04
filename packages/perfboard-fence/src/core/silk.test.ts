import { describe, expect, test } from 'vitest';
import { createPerfboardEditor } from './edit/fenceEditor.ts';
import { renderPerfboard } from './index.ts';
import { parseFence } from './parser/parseFence.ts';
import { placeParts } from './placement/place.ts';

/**
 * 番地の綴りは基板のシルクで読む (52 の docs/108)。**既定は基板の刷りどおり**で、
 * 手元の横置き 5x7cm は「英字が列 (左から)・数字が行 (下から)」。
 */
const pinsOf = (source: string): readonly { readonly row: number; readonly col: number }[] => {
  const { doc } = parseFence(source);
  const placed = placeParts(doc.parts, doc.board);
  return (placed.parts[0]?.pins ?? []).map((pin) => ({ row: pin.address.row, col: pin.address.col }));
};

const TURNED = (silk: string): string => [
  'board:',
  '  size: 7x5cm',
  ...(silk === '' ? [] : [`  silk: ${silk}`]),
  'parts:',
  '  R1: resistor a1 d1 10k',
].join('\n');

describe('board: silk:', () => {
  test('a named board reads the way the board is printed when silk is not written', () => {
    // 7x5cm は 24 列 18 行。a1 は左下、d1 は同じ行の 3 列右。
    expect(pinsOf(TURNED(''))).toEqual([{ row: 18, col: 1 }, { row: 18, col: 4 }]);
  });

  test('silk: board says the same as leaving it out', () => {
    expect(pinsOf(TURNED('board'))).toEqual(pinsOf(TURNED('')));
  });

  test('silk: fence reads the letters as rows from the top, the way it was before', () => {
    expect(pinsOf(TURNED('fence'))).toEqual([{ row: 1, col: 1 }, { row: 4, col: 1 }]);
  });

  test('silk: alpha-rows reads the letters as rows from the bottom', () => {
    expect(pinsOf(TURNED('alpha-rows'))).toEqual([{ row: 18, col: 1 }, { row: 15, col: 1 }]);
  });

  test('a board written by hole count has no silk to follow, so it keeps the fence way', () => {
    const source = 'board: 24x18\nparts:\n  R1: resistor a1 d1 10k';

    expect(pinsOf(source)).toEqual([{ row: 1, col: 1 }, { row: 4, col: 1 }]);
  });

  test('silk: board on a hole-count board is the fence way too', () => {
    const source = 'board:\n  size: 24x18\n  silk: board\nparts:\n  R1: resistor a1 d1 10k';

    expect(pinsOf(source)).toEqual([{ row: 1, col: 1 }, { row: 4, col: 1 }]);
  });

  test('an upright 5x7cm and an Akizuki board follow their own prints', () => {
    const upright = 'board: 5x7cm\nparts:\n  R1: resistor a1 d1 10k';
    const akizuki = 'board: akizuki-c\nparts:\n  R1: resistor a1 d1 10k';

    expect(pinsOf(upright)).toEqual([{ row: 1, col: 1 }, { row: 4, col: 1 }]);
    expect(pinsOf(akizuki)).toEqual([{ row: 15, col: 1 }, { row: 12, col: 1 }]);
  });

  test('says what it takes when the word is not one it knows', () => {
    const { errors } = parseFence('board:\n  size: 7x5cm\n  silk: spiral');

    expect(errors[0]?.message).toContain('board / fence / alpha-rows / alpha-cols');
    expect(errors[0]?.message).toContain('spiral');
  });

  test('the drawing names the holes the way the spelling does', () => {
    // 図の端の名前とフェンスの綴りが同じ字 (列が英字・左から、行が数字・下から)。
    const { svg } = renderPerfboard(TURNED(''));

    expect(svg).toContain('>X</text>');
    expect(svg).toContain('>18</text>');
  });
});

describe('a value that looks like an address stays a value on a bottom-up silk', () => {
  test('C102 after the holes of a capacitor is not read as a hole on a turned 5x7cm', () => {
    // 数字が行 (下から) なので、102 行目は行の負のほうへ落ちる。上限だけ見ていると穴に化ける。
    for (const board of ['7x5cm', 'akizuki-c']) {
      const { errors } = renderPerfboard(`board: ${board}\nparts:\n  C1: capacitor/ceramic c3 c5 C102`);

      expect(errors.map((error) => error.message).join('\n'), board).not.toContain('余分な番地');
    }
  });
});

describe('off-board messages follow the silk', () => {
  test('say the board in the letters and numbers the board is printed with', () => {
    const { errors } = renderPerfboard('board: 7x5cm\nparts:\n  R1: resistor a1 zz1 10k');
    const message = errors.map((error) => error.message).join('\n');

    // 24 列は英字 a〜x、18 行は数字 1〜18。
    expect(message).toContain('a〜x の 24 列');
  });
});

describe('the editor steps along the written silk', () => {
  const editor = createPerfboardEditor();

  test('one hole up from a1 is a2 on a turned 5x7cm, where the numbers count up from the bottom', () => {
    expect(editor.step('a1', -1, 0, TURNED(''))).toBe('a2');
    expect(editor.step('a1', 0, 1, TURNED(''))).toBe('b1');
  });

  test('the same step is a row up, meaning the earlier letter, on the fence way', () => {
    expect(editor.step('b1', -1, 0, TURNED('fence'))).toBe('a1');
  });

  test('counts the distance between two holes along the screen, whichever silk spells them', () => {
    expect(editor.stepsTo('a1', 'c3', TURNED(''))).toEqual({ rows: -2, cols: 2 });
    expect(editor.stepsTo('a1', 'c3', TURNED('fence'))).toEqual({ rows: 2, cols: 2 });
  });
});

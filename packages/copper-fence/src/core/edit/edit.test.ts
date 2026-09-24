import { applyRewrite } from 'fence-kit';
import type { EditResult } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { createCopperEditor } from './fenceEditor.ts';

const editor = createCopperEditor();

const SOURCE = [
  'board: 40x30mm',
  'copper:',
  '  L1: line 0,10 40,10 3.06',
  '  P1: pad 30,20  # 地の島',
  '  V1: via 30,21',
  'parts:',
  '  J1: sma left 10 CH0',
  '  C1: capacitor/1608 20,10 10p',
  '  R1: resistor P1 25,25 51',
  '  U1: ic3/sot89 10,20 r90 SPF',
  'wires:',
  '  - P1 -- 35,25 red',
].join('\n');

const afterOn = (source: string, result: EditResult): string => {
  if (!result.ok) throw new Error(result.error.message);
  return applyRewrite(source, result.value);
};
const after = (result: EditResult): string => afterOn(SOURCE, result);
const refused = (result: EditResult): string => (result.ok ? '' : result.error.message);
const line = (text: string, number: number): string => text.split('\n')[number - 1] ?? '';

describe('moving', () => {
  test('moves a chip, a pad and a box to the point that was pressed, keeping the comment', () => {
    expect(line(after(editor.movePart(SOURCE, 'C1', '22.5,10')), 8)).toBe('  C1: capacitor/1608 22.5,10 10p');
    expect(line(after(editor.movePart(SOURCE, 'P1', '31,19')), 4)).toBe('  P1: pad 31,19  # 地の島');
    expect(line(after(editor.movePart(SOURCE, 'U1', '12,20')), 10)).toBe('  U1: ic3/sot89 12,20 r90 SPF');
  });

  test('slides an SMA to the nearest side', () => {
    expect(line(after(editor.movePart(SOURCE, 'J1', '39,15')), 7)).toBe('  J1: sma right 15 CH0');
    expect(line(after(editor.movePart(SOURCE, 'J1', '20,1')), 7)).toBe('  J1: sma top 20 CH0');
  });

  test('moves a whole line by its first point, and refuses a part tied to an island by name', () => {
    expect(line(after(editor.movePart(SOURCE, 'wire:3', '0,12')), 3)).toBe('  L1: line 0,12 40,12 3.06');
    expect(refused(editor.movePart(SOURCE, 'R1', '5,5'))).toMatch(/島の名前で書いてあります/);
    expect(refused(editor.movePart(SOURCE, 'C1', 'x'))).toMatch(/点として読めません/);
    expect(refused(editor.movePart(SOURCE, 'Z9', '1,1'))).toMatch(/動かせるものではありません/);
  });

  test('moves every end written at a point, and bends a line that would slant', () => {
    const moved = after(editor.movePoint(SOURCE, '40,10', '40,14'));
    expect(line(moved, 3)).toBe('  L1: line 0,10 40,10 40,14 3.06');
    const both = after(editor.movePoint(SOURCE, '35,25', '36,26'));
    expect(line(both, 12)).toBe('  - P1 -- 36,26 red');
    expect(refused(editor.movePoint(SOURCE, '1,1', '2,2'))).toMatch(/動かせる点がありません/);
  });

  test('moves one end of a line or a jumper', () => {
    expect(line(after(editor.moveWireEnd?.(SOURCE, 'wire:3', 'to', '30,15') as EditResult), 3)).toBe('  L1: line 0,10 30,10 30,15 3.06');
    expect(line(after(editor.moveWireEnd?.(SOURCE, 'wire:12', 'from', '28,20') as EditResult), 12)).toBe('  - 28,20 -- 35,25 red');
    expect(refused(editor.moveWireEnd?.(SOURCE, 'C1', 'to', '1,1') as EditResult)).toMatch(/配線ではありません/);
  });
});

describe('placing', () => {
  test('writes a new part or island under its key', () => {
    const chip = after(editor.addPart(SOURCE, { id: 'C2', type: 'capacitor/1608', at: ['10,10'], turn: 1, flip: true }));
    expect(chip).toContain('  C2: capacitor/1608 10,10 r90 mirror');
    expect(after(editor.addPart(SOURCE, { id: 'V2', type: 'via', at: ['5,5'] }))).toContain('  V2: via 5,5\nparts:');
    expect(after(editor.addPart(SOURCE, { id: 'X1', type: 'slot', at: ['5,5'], turn: 1 }))).toContain('X1: slot 5,5 1x10');
    expect(after(editor.addPart(SOURCE, { id: 'J2', type: 'sma', at: ['38,20'] }))).toContain('J2: sma right 20');
    expect(after(editor.addPart(SOURCE, { id: 'U2', type: 'box', at: ['5,25'] }))).toContain('U2: box 5,25 4x4 4');
    expect(after(editor.addPart(SOURCE, { id: 'R2', type: 'resistor', at: ['5,5'] }))).toContain('R2: resistor 5,5 15,5');
    expect(after(editor.addPart(SOURCE, { id: 'R3', type: 'resistor', at: ['5,5'], turn: 1 }))).toContain('R3: resistor 5,5 5,15');
    expect(refused(editor.addPart(SOURCE, { id: 'Q1', type: 'flux', at: ['5,5'] }))).toMatch(/知らない種類/);
  });

  test('adds the key when the fence has none', () => {
    expect(afterOn('board: 40x20mm', editor.addPart('board: 40x20mm', { id: 'P1', type: 'pad', at: ['5,5'] })))
      .toBe('board: 40x20mm\ncopper:\n  P1: pad 5,5');
  });

  test('draws a line 50 ohms wide, bent where it would slant', () => {
    expect(after(editor.addWire(SOURCE, '5,20', '15,25', '--'))).toContain('  TL1: line 5,20 15,20 15,25 3.06');
    expect(refused(editor.addWire(SOURCE, '5,20', '5,20', '--'))).toMatch(/同じ点どうし/);
    const both = 'board:\n  size: 40x20mm\n  ground: both\n  cut: 0.15';
    expect(afterOn(both, editor.addWire(both, '0,5', '10,5', '--'))).toContain('line 0,5 10,5 1.05');
  });

  test('names parts after the custom of RF drawings', () => {
    expect(editor.nextId(SOURCE, 'capacitor/1608')).toBe('C2');
    expect(editor.nextId(SOURCE, 'bead/1608')).toBe('FB1');
    expect(editor.nextId(SOURCE, 'pad')).toBe('P2');
    expect(editor.nextId(SOURCE, 'ic3/sot89')).toBe('U2');
    expect(editor.nextId(SOURCE, 'flux')).toBeNull();
  });

  test('copies a part 2mm down-right, and an SMA to the next place along its side', () => {
    expect(after(editor.duplicate(SOURCE, 'C1', 'C9'))).toContain('  C9: capacitor/1608 22,12 10p');
    expect(after(editor.duplicate(SOURCE, 'J1', 'J9'))).toContain('  J9: sma left 17.35 CH0');
    expect(refused(editor.duplicate(SOURCE, 'wire:12', 'X'))).toMatch(/複製できるもの/);
  });
});

describe('removing', () => {
  test('rewrites the ends that named a removed island to its centre', () => {
    const gone = after(editor.deletePart(SOURCE, 'P1'));
    expect(gone).not.toContain('P1: pad');
    expect(gone).toContain('R1: resistor 30,20 25,25 51');
    expect(gone).toContain('- 30,20 -- 35,25 red');
  });

  test('removes a line or a jumper, and the key with the last one', () => {
    expect(after(editor.deleteWire(SOURCE, 12))).not.toContain('wires:');
    expect(after(editor.deleteWire(SOURCE, 3))).not.toContain('L1:');
    expect(refused(editor.deleteWire(SOURCE, 1))).toMatch(/線路も配線もありません/);
    expect(refused(editor.deletePart('board: 40x20mm\nparts: {C1: x}', 'C1'))).toMatch(/消せるもの|フロー形式/);
  });
});

describe('fields', () => {
  test('show what each thing can change', () => {
    expect(editor.fieldsOf(SOURCE, 'C1')).toMatchObject({ id: 'C1', type: 'capacitor/1608', value: '10p', can: ['id', 'type', 'value'] });
    expect(editor.fieldsOf(SOURCE, 'P1')).toMatchObject({ type: 'pad', value: '4x4', can: ['id', 'value'] });
    expect(editor.fieldsOf(SOURCE, 'V1')).toMatchObject({ type: 'via', value: '0.8' });
    expect(editor.fieldsOf(SOURCE, 'wire:3')).toMatchObject({ id: 'L1', type: 'line', value: '3.06' });
    expect(editor.fieldsOf(SOURCE, 'wire:12')).toMatchObject({ color: 'red', can: ['color'] });
    expect(editor.fieldsOf(SOURCE, 'nothing')).toBeNull();
  });

  test('change a value, a type, a width and a colour', () => {
    expect(line(after(editor.setField(SOURCE, 'C1', 'value', '22p')), 8)).toBe('  C1: capacitor/1608 20,10 22p');
    expect(line(after(editor.setField(SOURCE, 'U1', 'value', '')), 10)).toBe('  U1: ic3/sot89 10,20 r90');
    expect(line(after(editor.setField(SOURCE, 'C1', 'type', 'resistor/2012')), 8)).toBe('  C1: resistor/2012 20,10 10p');
    expect(line(after(editor.setField(SOURCE, 'wire:3', 'value', '1.5')), 3)).toBe('  L1: line 0,10 40,10 1.5');
    expect(line(after(editor.setField(SOURCE, 'P1', 'value', '5x3')), 4)).toBe('  P1: pad 30,20 5x3  # 地の島');
    expect(line(after(editor.setField(SOURCE, 'wire:12', 'color', 'blue')), 12)).toBe('  - P1 -- 35,25 blue');
    expect(line(after(editor.setField(SOURCE, 'wire:12', 'color', '')), 12)).toBe('  - P1 -- 35,25');
  });

  test('refuse what cannot be written', () => {
    expect(refused(editor.setField(SOURCE, 'C1', 'type', 'sma'))).toMatch(/置き方が違う|載せる辺/);
    expect(refused(editor.setField(SOURCE, 'C1', 'type', 'flux/1608'))).toMatch(/知らない種類|載る種類/);
    expect(refused(editor.setField(SOURCE, 'wire:3', 'value', 'wide'))).toMatch(/幅として読めません/);
    expect(refused(editor.setField(SOURCE, 'P1', 'value', 'big'))).toMatch(/大きさとして読めません/);
    expect(refused(editor.setField(SOURCE, 'wire:12', 'color', 'plaid'))).toMatch(/線の色/);
    expect(refused(editor.setField(SOURCE, 'wire:12', 'value', '1'))).toMatch(/value の欄はありません/);
    expect(refused(editor.setField(SOURCE, 'C1', 'label', 'x'))).toMatch(/label の欄はありません/);
  });

  test('rename a pad and every end that names it', () => {
    const renamed = after(editor.rename(SOURCE, 'P1', 'GND1'));
    expect(renamed).toContain('  GND1: pad 30,20');
    expect(renamed).toContain('R1: resistor GND1 25,25 51');
    expect(renamed).toContain('- GND1 -- 35,25 red');
    expect(refused(editor.rename(SOURCE, 'P1', 'C1'))).toMatch(/もうあります/);
    expect(refused(editor.rename(SOURCE, 'P1', 'a b'))).toMatch(/名前に使えません/);
    expect(after(editor.setField(SOURCE, 'C1', 'id', 'C1'))).toBe(SOURCE);
  });
});

describe('turning and flipping', () => {
  test('turns chips by the orient words, pads by their size, leaded parts around their middle', () => {
    expect(line(after(editor.turn(SOURCE, 'C1', 1)), 8)).toBe('  C1: capacitor/1608 20,10 r90 10p');
    expect(line(after(editor.turn(SOURCE, 'U1', 3)), 10)).toBe('  U1: ic3/sot89 10,20 SPF');
    const wide = after(editor.setField(SOURCE, 'P1', 'value', '5x3'));
    expect(line(afterOn(wide, editor.turn(wide, 'P1', 1)), 4)).toBe('  P1: pad 30,20 3x5  # 地の島');
    expect(afterOn(SOURCE, editor.turn(SOURCE, 'V1', 1))).toBe(SOURCE);
    const leaded = SOURCE.replace('R1: resistor P1 25,25 51', 'R1: resistor 20,25 30,25 51');
    expect(editor.turn(leaded, 'R1', 1).ok && applyRewrite(leaded, (editor.turn(leaded, 'R1', 1) as { value: object }).value)).toContain('R1: resistor 25,20 25,30 51');
    expect(refused(editor.turn(SOURCE, 'J1', 1))).toMatch(/載せる辺/);
    expect(refused(editor.turn(SOURCE, 'R1', 1))).toMatch(/回せません/);
    expect(refused(editor.turn(SOURCE, 'wire:3', 1))).toMatch(/回せるもの/);
  });

  test('flips chips by the mirror word and swaps the ends of leaded parts', () => {
    expect(line(after(editor.flip(SOURCE, 'C1')), 8)).toBe('  C1: capacitor/1608 20,10 mirror 10p');
    expect(line(after(editor.flip(SOURCE, 'R1')), 9)).toBe('  R1: resistor 25,25 P1 51');
    expect(refused(editor.flip(SOURCE, 'J1'))).toMatch(/裏返せません/);
    expect(refused(editor.flip(SOURCE, 'P1'))).toMatch(/裏返せるもの/);
  });
});

describe('finding', () => {
  test('aims at a node on a point, and at the thing on its line', () => {
    expect(editor.aimAt(SOURCE, 3, 14)).toEqual({ kind: 'node', id: '0,10' });
    expect(editor.aimAt(SOURCE, 3, 5)).toEqual({ kind: 'wire', id: '3' });
    expect(editor.aimAt(SOURCE, 8, 5)).toEqual({ kind: 'part', id: 'C1' });
    expect(editor.aimAt(SOURCE, 4, 5)).toEqual({ kind: 'part', id: 'P1' });
    expect(editor.aimAt(SOURCE, 1, 5)).toBeNull();
  });

  test('lights up the item and every place a point is written', () => {
    expect(editor.spansOf(SOURCE, 'part', 'C1')).toEqual([{ line: 8, column: 2, length: 28 }]);
    expect(editor.spansOf(SOURCE, 'node', '35,25')).toEqual([{ line: 12, column: 10, length: 5 }]);
    expect(editor.spansOf(SOURCE, 'node', 'x')).toEqual([]);
    expect(editor.spansOf(SOURCE, 'part', 'wire:12')).toEqual([]);
  });

  test('finds the fence around a line and names wires by their line', () => {
    const markdown = ['# 題', '', '```copper', SOURCE, '```'].join('\n');
    expect(editor.fenceAt(markdown, 5)?.line).toBe(3);
    expect(editor.fenceAt(markdown, 1)).toBeNull();
    expect(editor.fences(markdown)).toEqual([{ line: 3, title: null }]);
    expect(editor.firstFence('text')).toBeNull();
    expect(editor.nameOf('wire:12')).toBe('線 (12 行目)');
    expect(editor.nameOf('C1')).toBe('C1');
  });

  test('counts steps in millimetres, with half a millimetre as the fine step', () => {
    expect(editor.step('10,5', 0.5, -1)).toBe('9,5.5');
    expect(editor.stepsTo('10,5', '12.5,4')).toEqual({ rows: -1, cols: 2.5 });
    expect(editor.stepsTo('x', '1,1')).toBeNull();
    expect(editor.fine).toBe(2);
    expect(editor.cellsOf(SOURCE, 'J1')).toEqual(['0,10']);
    expect(editor.cellsOf(SOURCE, 'R1')).toEqual(['30,20', '25,25']);
    expect(editor.cellsOf(SOURCE, 'wire:12')).toEqual(['30,20', '35,25']);
    expect(editor.cellsOf(SOURCE, 'nothing')).toEqual([]);
  });

  test('shows the band and the problems of the fence', () => {
    const broken = `${SOURCE}\n  - P1 -- zz`;
    expect(editor.view(broken, 10).issues).toContain('cf-issues');
    expect(editor.problems?.(broken, 10, { erc: true }).some((row) => row.kind === 'error' && row.line === 23)).toBe(true);
    expect(editor.palette()).toContain('data-type="ic3/sot89"');
    expect(editor.typeNames('t')).toContain('value="bead"');
    expect(editor.colorNames('c')).toContain('value="red"');
  });
});

describe('review findings', () => {
  const on = (source: string, result: EditResult): string => {
    if (!result.ok) throw new Error(result.error.message);
    return applyRewrite(source, result.value);
  };

  test('takes an all-digit name as a name, not as a line number', () => {
    const source = ['board: 40x20mm', 'copper:', '  A: pad 5,5', '  B: pad 30,5', '  TL: line 0,10 40,10 3', '  5: pad 20,15'].join('\n');
    const gone = on(source, editor.deletePart(source, '5'));
    expect(gone).toContain('TL: line');
    expect(gone).not.toContain('5: pad');
    expect(editor.fieldsOf(source, '5')).toMatchObject({ id: '5', type: 'pad' });
  });

  test('turns and flips a chip from the direction its vertical line gives it', () => {
    const source = ['board: 40x20mm', 'copper:', '  TL: line 20,0 20,20 3', 'parts:', '  C1: capacitor/1608 20,10 10p'].join('\n');
    expect(on(source, editor.turn(source, 'C1', 1))).toContain('C1: capacitor/1608 20,10 r180 10p');
    expect(on(source, editor.flip(source, 'C1'))).toContain('C1: capacitor/1608 20,10 r90 mirror 10p');
  });

  test('leaves a quoted wire alone rather than breaking it', () => {
    const source = ['board: 40x20mm', 'copper:', '  P1: pad 5,5', '  P2: pad 30,5', 'wires:', '  - "P1 -- P2"'].join('\n');
    expect(editor.moveWireEnd?.(source, 'wire:6', 'from', '10,10').ok).toBe(false);
  });
});

import { describe, expect, test } from 'vitest';
import { fixtureCardTable, withCards } from 'fence-kit';
import { compileCircuit } from './index.ts';
import { createCircuitEditor } from './edit/fenceEditor.ts';
import { scenesOfCircuit } from './model/scene.ts';
import { partTypeOf } from './parts.ts';
import { parseFence } from './parser/parseFence.ts';

/** 部品カード (52 の docs/158)。手元のカードの型番は、組むときに渡したときだけ表に出る。 */

const cards = fixtureCardTable();
const FENCE = [
  'parts:',
  '  U1: dip8 2,2 XY1234',
  '  U2: ic 6,3 XY1234',
  '  R1: resistor 10,1 12,1 1k',
  '  M1:',
  '    type: device',
  '    model: XM-1',
  '    at: 10,5',
  'wires:',
  '  - 10,1 -| U1.1Y',
  '  - 12,1 -| U2.2B',
  '  - M1.OUT -- U1.1A',
].join('\n');

const said = (result: ReturnType<typeof compileCircuit>) => [...result.errors, ...result.notices].map((item) => item.message);

describe('circuit と部品カード', () => {
  test('without cards the models and their pin names are unknown', () => {
    expect(said(compileCircuit(FENCE)).join('\n')).toContain('XY1234');
  });

  test('with cards the DIP, the ic box and the device are wired by name', () => {
    expect(said(compileCircuit(FENCE, { cards }))).toEqual([]);
  });

  test('the DIP takes the pin labels of the card', () => {
    const part = parseFence('parts:\n  U1: dip8 2,2 XY1234\n').doc.parts[0];
    const labels = withCards(cards, () => (part === undefined ? null : partTypeOf(part)?.pinLabels));
    expect(labels).toEqual(['1A', '1B', '1Y', 'GND', '2Y', '2A', '2B', 'VCC']);
  });

  test('the ic box is refused without the card and drawn with it', () => {
    const fence = 'parts:\n  U2: ic 6,3 XY1234\n';
    expect(said(compileCircuit(fence)).length).toBeGreaterThan(0);
    expect(said(compileCircuit(fence, { cards }))).toEqual([]);
  });

  test('the scenes for fence-check see the cards too', () => {
    const [scene] = scenesOfCircuit(FENCE, null, cards);
    expect(scene?.parts.map((part) => part.id)).toEqual(['R1']);
  });

  test('the map editor sees the cards it was given', () => {
    const editor = createCircuitEditor(undefined, { cards: () => cards });
    expect(editor.problems?.(FENCE, 0, { erc: false }) ?? []).toEqual([]);
    expect((createCircuitEditor().problems?.(FENCE, 0, { erc: false }) ?? []).length).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from 'vitest';
import { fixtureCardTable } from 'fence-kit';
import { renderPerfboard, scenesOfPerfboard } from './index.ts';
import { createPerfboardEditor } from './edit/fenceEditor.ts';

/** 部品カード (52 の docs/158)。手元のカードの型番は、描くときに渡したときだけ表に出る。 */

const cards = fixtureCardTable();
const HEAD = ['board:', '  size: 46x24', 'style:', '  check: off', 'parts:'];
const FENCE = [
  ...HEAD,
  '  U1: dip8 b2 XY1234',
  '  Q1: transistor b10 b11 b12 XN100',
  '  S1: sip4 b16 XS-4',
  '  M1:',
  '    type: device',
  '    model: XM-1',
].join('\n');
const BOARD = [...HEAD, '  B1: test-nano b2'].join('\n');

type Said = { readonly errors: readonly { readonly message: string }[]; readonly notices: readonly { readonly message: string }[] };
const messages = (result: Said) => [...result.errors, ...result.notices].map((item) => item.message);

describe('perfboard と部品カード', () => {
  test('without cards the models are unknown', () => {
    expect(messages(renderPerfboard(FENCE)).join('\n')).toContain('XY1234');
  });

  test('with cards the chip, three-pin, single-row and device cards are drawn with their names', () => {
    const result = renderPerfboard(FENCE, { cards });
    expect(messages(result)).toEqual([]);
    for (const name of ['1Y', 'SDA', 'OUT']) expect(result.svg).toContain(name);
  });

  test('a board card is placed like the bundled boards', () => {
    expect(messages(renderPerfboard(BOARD)).join('\n')).toContain('test-nano');
    const result = renderPerfboard(BOARD, { cards });
    expect(messages(result)).toEqual([]);
    expect(result.svg).toContain('D29');
  });

  test('the scenes for fence-check see the cards too', () => {
    expect(scenesOfPerfboard(FENCE, { cards })[0]?.parts.map((part) => part.id)).toEqual(expect.arrayContaining(['U1', 'M1']));
  });

  test('the map editor sees the cards it was given', () => {
    const editor = createPerfboardEditor({ cards: () => cards });
    expect(editor.problems?.(FENCE, 0, { erc: false }) ?? []).toEqual([]);
    expect((createPerfboardEditor().problems?.(FENCE, 0, { erc: false }) ?? []).length).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from 'vitest';
import { fixtureCardTable } from 'fence-kit';
import { renderBreadboard, scenesOfBreadboard } from './index.ts';
import { createBreadboardEditor } from './edit/fenceEditor.ts';

/** 部品カード (52 の docs/158)。手元のカードの型番は、描くときに渡したときだけ表に出る。 */

const cards = fixtureCardTable();
const FENCE = [
  'parts:',
  '  U1: dip8 e10 XY1234',
  '  Q1: transistor a3 a4 a5 XN100',
  '  S1: sip4 a20 XS-4',
  '  M1:',
  '    type: device',
  '    model: XM-1',
].join('\n');

const BOARD = 'parts:\n  B1: test-nano @ h5\n';

const messages = (result: { readonly errors: readonly { readonly message: string }[]; readonly notices: readonly { readonly message: string }[] }) =>
  [...result.errors, ...result.notices].map((item) => item.message);

describe('breadboard と部品カード', () => {
  test('without cards the models are unknown', () => {
    const result = renderBreadboard(FENCE);
    expect(messages(result).join('\n')).toContain('XY1234 のピンの名前は表に無い');
  });

  test('with cards every kind of card is drawn with its names and nothing is said', () => {
    const result = renderBreadboard(FENCE, { cards });
    expect(messages(result)).toEqual([]);
    for (const name of ['1Y', 'SDA', 'OUT']) expect(result.svg).toContain(name);
  });

  test('a board card is placed like the bundled boards', () => {
    expect(messages(renderBreadboard(BOARD)).join('\n')).toContain('test-nano');
    const result = renderBreadboard(BOARD, { cards });
    expect(messages(result)).toEqual([]);
    for (const name of ['D29', 'XY328']) expect(result.svg).toContain(name);
  });

  test('the cards are gone once the drawing is done', () => {
    renderBreadboard(FENCE, { cards });
    expect(messages(renderBreadboard(FENCE)).length).toBeGreaterThan(0);
  });

  test('the scenes for fence-check see the cards too', () => {
    const scene = scenesOfBreadboard(FENCE, { cards })[0];
    expect(scene?.parts.map((part) => part.id)).toEqual(expect.arrayContaining(['U1', 'M1']));
  });

  test('the map editor sees the cards it was given', () => {
    const editor = createBreadboardEditor({ cards: () => cards });
    const problems = editor.problems?.(FENCE, 0, { erc: false }) ?? [];
    expect(problems).toEqual([]);
    expect(editor.view(FENCE, 0).map).toContain('1Y');
    expect((createBreadboardEditor().problems?.(FENCE, 0, { erc: false }) ?? []).length).toBeGreaterThan(0);
  });
});

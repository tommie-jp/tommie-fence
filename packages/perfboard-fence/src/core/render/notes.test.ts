import { describe, expect, test } from 'vitest';
import { renderNotes } from './notes.ts';
import { THEME } from './theme.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import type { ResolvedNote } from '../types.ts';

const layout = createLayout(createBoard({ cols: 12, rows: 8 }));
const at = (hole: string) => parseAddress(hole)!;

const note = (over: Partial<ResolvedNote> & Pick<ResolvedNote, 'kind' | 'from'>): ResolvedNote =>
  ({ to: null, color: null, text: null, ...over });

const draw = (one: ResolvedNote): string => renderNotes([one], layout, THEME);

describe('renderNotes', () => {
  test('draws nothing at all when there are no notes', () => {
    expect(renderNotes([], layout, THEME)).toBe('');
  });

  test('rings the hole a mark points at', () => {
    const svg = draw(note({ kind: 'mark', from: at('c3') }));

    expect(svg).toContain('<circle');
    expect(svg).toContain(`cx="${layout.point(at('c3')).x}"`);
  });

  test('paints a note in the colour it was written with', () => {
    expect(draw(note({ kind: 'mark', from: at('c3'), color: 'red' })))
      .not.toBe(draw(note({ kind: 'mark', from: at('c3') })));
  });

  test('boxes the two corners it was given', () => {
    expect(draw(note({ kind: 'box', from: at('b2'), to: at('d8') }))).toContain('<rect');
  });

  test('puts a head on an arrow, so which end it points at can be read', () => {
    const svg = draw(note({ kind: 'arrow', from: at('f4'), to: at('c5') }));

    expect(svg).toContain('<line');
    expect(svg).toContain('<polyline');
  });

  test('escapes the words of a text note', () => {
    const svg = draw(note({ kind: 'text', from: at('c6'), text: '<img src=x>' }));

    expect(svg).toContain('&lt;img');
    expect(svg).not.toContain('<img');
  });
});

describe('盤の端に置いた字', () => {
  const room = (hole: string): string => draw(note({ kind: 'text', from: at(hole), text: 'ここから電源' }));

  test('keeps the whole word at either edge, not just its first character', () => {
    // 中央寄せのまま端に置くと、使える幅は近いほうの縁までの 2 倍しかない。
    // 端では向きを変えて、板の外の余白まで使う。
    for (const hole of ['a1', 'a6', 'a12']) expect(room(hole)).toContain('ここから電源');
  });

  test('turns the text away from the edge it is close to', () => {
    expect(room('a1')).toContain('text-anchor="start"');
    expect(room('a12')).toContain('text-anchor="end"');
    expect(room('a6')).toContain('text-anchor="middle"');
  });
});

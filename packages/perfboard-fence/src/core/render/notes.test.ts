import { describe, expect, test } from 'vitest';
import { renderNotes } from './notes.ts';
import { THEME } from './theme.ts';
import { createBoard } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import type { ResolvedNote } from '../types.ts';
import { NO_TURN } from '../parts/orient.ts';

const layout = createLayout(createBoard({ cols: 12, rows: 8 }));
const at = (hole: string) => parseAddress(hole)!;

const note = (over: Partial<ResolvedNote> & Pick<ResolvedNote, 'kind' | 'from'>): ResolvedNote =>
  ({ to: null, color: null, text: null, line: null, turn: NO_TURN, ...over });

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

describe('掴み手', () => {
  test('marks each note with the line it was written on, so it can be grabbed', () => {
    // **注釈には名前が無い。** 行そのもので指す (配線と同じ考え方)。
    // 部品と同じ `data-part` に載せるので、殻は注釈を部品として扱える。
    const svg = renderNotes([note({ kind: 'text', from: at('b3'), text: 'ここ', line: 7 })], layout, THEME, true);

    expect(svg).toContain('class="cf-chip" data-part="note:7"');
  });

  test('leaves the drawing alone when it is not the editor asking', () => {
    const svg = renderNotes([note({ kind: 'text', from: at('b3'), text: 'ここ', line: 7 })], layout, THEME);

    expect(svg).not.toContain('cf-chip');
  });
});

describe('text の向き', () => {
  const words = (over: Partial<ResolvedNote> = {}): string =>
    renderNotes([note({ kind: 'text', from: at('e5'), text: 'ここ', ...over })], layout, THEME);

  test('turns the words around the hole they point at', () => {
    // 字の真ん中で回すと、指す先から離れていく。
    const point = layout.point(at('e5'));

    expect(words({ turn: { rotate: 90, mirror: false } }))
      .toContain(`rotate(90 ${point.x} ${point.y})`);
  });

  test('writes the words the usual way up when there is no turn', () => {
    expect(words()).not.toContain('rotate(');
  });

  test('sends the words to the other side instead of mirroring them', () => {
    // **鏡文字は読めない。** 反転は「指す穴の反対側へ移す」の意味にしてある。
    const point = layout.point(at('e5'));
    const above = /<text[^>]*y="([-0-9.]+)"/.exec(words())?.[1];
    const below = /<text[^>]*y="([-0-9.]+)"/.exec(words({ turn: { rotate: 0, mirror: true } }))?.[1];

    expect(Number(above)).toBeLessThan(point.y);
    expect(Number(below)).toBeGreaterThan(point.y);
  });
});

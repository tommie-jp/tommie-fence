import { describe, expect, test } from 'vitest';
import { stringify } from 'yaml';
import { checkCardText } from './run.ts';

/**
 * 部品カードの字は書き手の物 (52 の docs/158)。**VS Code のプレビューは返した HTML をサニタイズしない**ので、
 * カードの字のどれかが素のまま SVG に入ると、開いただけで字が HTML として動く。回路図は TeX に入る。
 * どの欄にも印の字と TeX の命令を入れ、3 つのフェンスの図にそのまま出ないことを見る
 * (外形の刷り字 `outline.mark` が素のまま出ていたのを、この試験で見つけた)。
 */
const EVIL = '<img src=x onerror=alert(1)>\\input{/etc/passwd}&"\'';

const CARDS: readonly Record<string, unknown>[] = [
  {
    models: ['XE1'], package: 'dip8/sop', role: EVIL, 'role-en': EVIL, note: EVIL, source: EVIL,
    pins: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    smd: { length: 2, width: 1, span: 2, pitch: 1, lead: 0.4, mark: EVIL },
    ic: { left: ['A', 'B'], right: ['C'] }, spice: { model: EVIL, lib: EVIL },
  },
  {
    models: ['XE2'], package: 'sip4', role: EVIL, note: EVIL, source: EVIL, pins: ['A', 'B', 'C', 'D'],
    look: { body: '#123456', edge: '#654321' },
    outline: { along: 10, across: 10, inset: 1, jack: { along: 5, from: 2, to: 8 }, mark: EVIL },
  },
  { models: ['XE3'], package: 'transistor/to92', kind: 'npn', case: EVIL, role: EVIL, source: EVIL, pins: ['E', 'C', 'B'] },
  { models: ['XE4'], package: 'device', role: EVIL, 'role-en': EVIL, view: EVIL, product: EVIL, source: EVIL, pins: ['A', 'B'] },
  {
    models: ['xe-board'], package: 'board', role: EVIL, name: EVIL, chip: EVIL, mark: EVIL, source: EVIL,
    'row-span': 6, usb: 'micro-b', pins: Array.from({ length: 20 }, (_, index) => `D${index}`),
  },
];

describe('部品カードの字は図に素のまま出ない', () => {
  test.each(CARDS.map((card) => [card['models'] as readonly string[], card] as const))('%s', (_models, card) => {
    const checked = checkCardText(stringify(card), 'evil.part.yaml');
    expect(checked.card).not.toBeNull();
    expect(checked.figures.length).toBeGreaterThan(0);
    for (const figure of checked.figures) {
      const drawn = figure.svg ?? figure.tex ?? '';
      expect(drawn.length, figure.fence).toBeGreaterThan(0);
      expect(drawn, figure.fence).not.toContain('<img');
      // TeX の命令が効くのは回路図 (TeX) だけ。SVG の中の字としては害が無い。
      if (figure.fence === 'circuit') expect(drawn, figure.fence).not.toContain('\\input{');
    }
  });
});

import { readCard } from './read.ts';
import { buildCardTable } from './table.ts';
import type { CardTable } from './types.ts';

/**
 * 試験で使う部品カードの組 (3 つのフェンスの試験が同じ物を使う)。**どれも架空の型番** —
 * 同梱の表と重ならないように、実在しない綴りにしてある。
 */
export const FIXTURE_CARDS: readonly unknown[] = [
  {
    models: ['XY1234'], package: 'dip8', role: '試験用の 2 入力 NAND',
    pins: ['1A', '1B', '1Y', 'GND', '2Y', '2A', '2B', 'VCC'], source: '試験',
    ic: { left: ['1A', '1B', '2A', '2B'], right: ['1Y', '2Y'], top: ['VCC'], bottom: ['GND'] },
  },
  { models: ['XN100'], package: 'transistor/to92', kind: 'npn', pins: ['E', 'C', 'B'], role: '試験用の NPN', source: '試験' },
  { models: ['XS-4'], package: 'sip4', role: '試験用のセンサ', pins: ['VCC', 'SDA', 'SCL', 'GND'], source: '試験', look: { body: '#2b6cb0', edge: '#1c4a7d' } },
  { models: ['XM-1'], package: 'device', pins: ['VIN', 'GND', 'OUT'], role: '試験用のモジュール', source: '試験', view: '上から', product: '試験' },
  {
    models: ['test-nano'], package: 'board', role: '試験用のボード', source: '試験', chip: 'XY328', 'row-span': 6, usb: 'micro-b',
    pins: Array.from({ length: 30 }, (_, index) => `D${index}`),
  },
];

/** 試験用の表。読めないカードがあれば投げる (fixture の誤りを黙って通さない)。 */
export function fixtureCardTable(): CardTable {
  const placed = FIXTURE_CARDS.map((value, index) => {
    const { card, issues } = readCard(value);
    if (card === null) throw new Error(`fixture ${index}: ${issues.map((issue) => issue.message).join(' / ')}`);
    return { card, file: `fixture${index}.part.yaml` };
  });
  return buildCardTable(placed).table;
}

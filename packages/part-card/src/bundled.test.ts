import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import {
  BUNDLED_CARDS, boardRows, chipRows, discreteRows, discreteTable, lookupBoardPart, moduleRows, moduleTable, pinoutTable,
} from 'fence-kit';
import type { PartCard } from 'fence-kit';
import { CARD_ROW_DOCS, ROW_BLOCKS, cardRowsBlock, rowBlockText } from './docRows.ts';
import { readCardText } from './text.ts';

/** 同梱の部品カード (52 の docs/158 の 4-1〜4-4)。 */

const root = new URL('../../../', import.meta.url);
/** 置き場の下まで降りてカードを集める (並びは焼く道具と同じ、ディレクトリ・名前の順)。 */
const namesIn = (dir: URL, prefix = ''): readonly string[] => readdirSync(dir).sort().flatMap((name) =>
  (statSync(new URL(name, dir)).isDirectory()
    ? namesIn(new URL(`${name}/`, dir), `${prefix}${name}/`)
    : (name.endsWith('.part.yaml') ? [`${prefix}${name}`] : [])));

const cardsIn = (dir: URL): readonly [string, PartCard][] => namesIn(dir)
  .map((name) => {
    const { card, issues } = readCardText(readFileSync(new URL(name, dir), 'utf8'));
    expect(issues, name).toEqual([]);
    if (card === null) throw new Error(name);
    return [name, card];
  });

/** `card:` の印 (どこから読んだか) を外す。TS で書いた行は持たない。 */
const plain = <T extends object>(row: T): Omit<T, 'card'> => {
  const { card: _card, ...rest } = row as T & { card?: unknown };
  return rest;
};

describe('同梱の部品カード', () => {
  test('the baked table matches the cards in packages/fence-kit/parts (npm run cards)', () => {
    expect(BUNDLED_CARDS).toEqual(cardsIn(new URL('packages/fence-kit/parts/', root)).map(([, card]) => card));
  });

  test.each(CARD_ROW_DOCS)('%s lists the bundled cards between its markers (npm run rows)', (doc) => {
    expect(readFileSync(new URL(doc, root), 'utf8')).toContain(cardRowsBlock(BUNDLED_CARDS));
  });

  test.each(ROW_BLOCKS.flatMap((block) => block.docs.map((doc) => [block.name, doc, block] as const)))(
    'the %s table in %s is written out from the table (npm run rows)', (_name, doc, block) => {
      expect(readFileSync(new URL(doc, root), 'utf8')).toContain(rowBlockText(block));
    },
  );
});

/**
 * 代表の行をカードで書くと、TS で書いた行と**ぴったり同じ**になる (52 の docs/158 の「既存の表とカード」)。
 * 既にある行を書けない形式は、新しい部品も書けない。カードは `examples/` にあり、人が足すときの手本も兼ねる。
 */
describe('代表の行をカードで書く', () => {
  const examples = new Map(cardsIn(new URL('../examples/', import.meta.url)));
  const card = (name: string): PartCard => {
    const found = examples.get(name);
    if (found === undefined) throw new Error(name);
    return found;
  };
  const tsRow = <R extends { readonly models: readonly string[] }>(rows: readonly R[], model: string): R | undefined =>
    rows.find((row) => row.models[0] === model);

  test.each([
    ['HC-SR04.part.yaml', 'HC-SR04'],
    ['AE-DC-POWER-JACK-DIP.part.yaml', 'AE-DC-POWER-JACK-DIP'],
    ['3SK291.part.yaml', '3SK291'],
  ])('%s gives the same row as the pin name table', (name, model) => {
    expect(plain(chipRows([card(name)], 'local')[0]!)).toEqual(tsRow(pinoutTable(), model));
  });

  test('2SC1815 gives the same row as the three-pin table', () => {
    expect(plain(discreteRows([card('2SC1815.part.yaml')], 'local')[0]!)).toEqual(tsRow(discreteTable(), '2SC1815'));
  });

  test('NRF24L01+ gives the same row as the module table', () => {
    expect(plain(moduleRows([card('NRF24L01+.part.yaml')], 'local')[0]!)).toEqual(tsRow(moduleTable(), 'NRF24L01+'));
  });

  test('Tang Nano 9K gives the same board as the board table', () => {
    expect(boardRows([card('tang-nano-9k.part.yaml')])[0]?.part).toEqual(lookupBoardPart('tang-nano-9k'));
  });
});

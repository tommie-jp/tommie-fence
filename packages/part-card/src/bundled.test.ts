import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { BUNDLED_CARDS } from 'fence-kit';
import type { PartCard } from 'fence-kit';
import { ROW_BLOCKS, rowBlockText } from './docRows.ts';
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

describe('同梱の部品カード', () => {
  test('the baked table matches the cards in packages/fence-kit/parts (npm run cards)', () => {
    expect(BUNDLED_CARDS).toEqual(cardsIn(new URL('packages/fence-kit/parts/', root)).map(([, card]) => card));
  });

  test.each(ROW_BLOCKS.flatMap((block) => block.docs.map((doc) => [block.name, doc, block] as const)))(
    'the %s table in %s is written out from the table (npm run rows)', (_name, doc, block) => {
      expect(readFileSync(new URL(doc, root), 'utf8')).toContain(rowBlockText(block));
    },
  );
});

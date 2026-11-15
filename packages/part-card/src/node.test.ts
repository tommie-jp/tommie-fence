import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lookupPinout, withCards } from 'fence-kit';
import { CARD_DIR, cardIssueLines, findCardDir, loadCardDir, loadCardsFor } from './node.ts';

/** 手元の部品カードの置き場を読む (52 の docs/158 の 2-2)。 */

const CARD = (model: string) => [
  `models: [${model}]`, 'package: dip8', 'role: 試験', 'pins: [1A, 1B, 1Y, GND, 2Y, 2A, 2B, VCC]', 'source: 試験',
].join('\n');

let root = '';
let cards = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'part-card-'));
  cards = join(root, CARD_DIR);
  mkdirSync(cards, { recursive: true });
  mkdirSync(join(root, 'book', 'chapter'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('findCardDir', () => {
  test('climbs up from a file to the folder that holds .tommie-fence/parts', () => {
    const file = join(root, 'book', 'chapter', 'a.md');
    writeFileSync(file, '');
    expect(findCardDir(file)).toBe(cards);
  });

  test('stops at the given folder', () => {
    expect(findCardDir(join(root, 'book', 'chapter'), join(root, 'book'))).toBeNull();
  });
});

describe('loadCardDir', () => {
  test('reads every *.part.yaml in name order and builds a table', () => {
    writeFileSync(join(cards, 'b.part.yaml'), CARD('XB1'));
    writeFileSync(join(cards, 'a.part.yaml'), CARD('XA1'));
    writeFileSync(join(cards, 'notes.yaml'), 'not a card');
    const read = loadCardDir(cards);
    expect(read.files.map((file) => file.name)).toEqual(['a.part.yaml', 'b.part.yaml']);
    expect(withCards(read.table, () => lookupPinout('XB1', 8)?.names[2])).toBe('1Y');
  });

  test('keeps a broken card out of the table and says where it broke', () => {
    writeFileSync(join(cards, 'bad.part.yaml'), CARD('XC1').replace('package: dip8', 'package: dip14'));
    const read = loadCardDir(cards);
    expect(read.table.pinouts).toEqual([]);
    expect(cardIssueLines(read)).toEqual([`${join(cards, 'bad.part.yaml')}:4: 誤り: ピンの数が合いません (package: は 14 本、pins: は 8 本)`]);
  });

  test('passes on the notice when a card repeats a bundled model', () => {
    writeFileSync(join(cards, 'ne555.part.yaml'), CARD('NE555'));
    expect(cardIssueLines(loadCardDir(cards))[0]).toContain('同梱の表にあります');
  });

  test('does not follow a link that points outside the folder', () => {
    const outside = join(root, 'outside.part.yaml');
    writeFileSync(outside, CARD('XD1'));
    symlinkSync(outside, join(cards, 'link.part.yaml'));
    const read = loadCardDir(cards);
    expect(read.files).toEqual([]);
    expect(read.problems[0]).toContain('置き場の外');
  });

  test('loadCardsFor returns null when there is no folder', () => {
    rmSync(cards, { recursive: true });
    expect(loadCardsFor(join(root, 'book'), root)).toBeNull();
  });
});

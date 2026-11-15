import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { cardFields } from 'fence-kit';
import { readCardText } from './text.ts';

/** 部品カードの字を読む (52 の docs/158 の 2-1)。 */

const CARD = [
  'models: [XY1234, XY1234N]',
  'package: dip8',
  'role: 試験用の NAND',
  'pins: [1A, 1B, 1Y, GND, 2Y, 2A, 2B, VCC]',
  'source: 試験の資料',
].join('\n');

describe('readCardText', () => {
  test('reads a card', () => {
    const { card, issues } = readCardText(CARD);
    expect(issues).toEqual([]);
    expect(card?.models).toEqual(['XY1234', 'XY1234N']);
  });

  test('points at the line of the wrong pin name', () => {
    const text = CARD.replace('pins: [1A, 1B, 1Y, GND, 2Y, 2A, 2B, VCC]', 'pins:\n  - 1A\n  - 1B\n  - 1Y\n  - GND\n  - 2Y\n  - 2A\n  - 2B\n  - "IN–"');
    const { card, issues } = readCardText(text);
    expect(card).toBeNull();
    expect(issues).toEqual([expect.objectContaining({ line: 12, severity: 'error', message: expect.stringContaining('en dash') })]);
  });

  test('points at the card itself when a required field is missing', () => {
    const { issues } = readCardText(CARD.replace('source: 試験の資料', ''));
    expect(issues).toEqual([expect.objectContaining({ line: 1, message: expect.stringContaining('source:') })]);
  });

  test('says where the YAML itself breaks', () => {
    const { card, issues } = readCardText('models: [XY\npackage: dip8\n');
    expect(card).toBeNull();
    expect(issues[0]?.message).toContain('YAML として読めません');
  });

  test('refuses a key written twice instead of keeping the last one', () => {
    expect(readCardText(`${CARD}\nrole: 2 度め`).card).toBeNull();
  });

  test('refuses a text that is too large', () => {
    expect(readCardText(`# ${'x'.repeat(70 * 1024)}\n${CARD}`).issues[0]?.message).toContain('大きすぎ');
  });
});

describe('the JSON Schema', () => {
  const schema = JSON.parse(readFileSync(new URL('../schema/part-card.schema.json', import.meta.url), 'utf8')) as {
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required: readonly string[];
  };

  test('names the same fields as the checks in fence-kit', () => {
    const { common, byKind } = cardFields();
    expect(Object.keys(schema.properties).sort()).toEqual([...new Set([...common, ...Object.values(byKind).flat()])].sort());
  });

  test('requires the same fields as every card', () => {
    expect([...schema.required].sort()).toEqual(['models', 'package', 'pins', 'role', 'source']);
  });
});

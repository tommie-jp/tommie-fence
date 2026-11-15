import { describe, expect, test } from 'vitest';
import { boardPartNames, lookupBoardPart } from '../boards.ts';
import { discreteTable, lookupDiscrete } from '../discretes.ts';
import { lookupModule, moduleTable, resolveDeviceModel } from '../modules.ts';
import { lookupGateUnits, lookupPinout, lookupPinoutNames, lookupRole, pinoutTable } from '../pinouts.ts';
import { editorWithCards } from './editor.ts';
import { checkPinNames } from './pinNames.ts';
import { readCard } from './read.ts';
import { withCards, withCardsUsed } from './scope.ts';
import { buildCardTable } from './table.ts';
import type { PartCard } from './types.ts';

/** 部品カード (52 の docs/158)。 */

const CHIP = {
  models: ['XY1234', 'XY1234N'], package: 'dip8', role: 'テスト用の 2 入力 NAND', 'role-en': 'test NAND',
  pins: ['1A', '1B', '1Y', 'GND', '2Y', '2A', '2B', 'VCC'], source: 'テストの資料 rev 1, Figure 1',
};

const cardOf = (value: unknown): PartCard => {
  const { card, issues } = readCard(value);
  expect(issues).toEqual([]);
  if (card === null) throw new Error('読めなかった');
  return card;
};

const tableOf = (...values: unknown[]) =>
  buildCardTable(values.map((value, index) => ({ card: cardOf(value), file: `card${index}.part.yaml` }))).table;

describe('readCard', () => {
  test('reads a DIP card into the chip kind', () => {
    const card = cardOf(CHIP);
    expect(card).toMatchObject({ kind: 'chip', models: ['XY1234', 'XY1234N'], package: 'dip8', roleEn: 'test NAND' });
  });

  test('refuses a card without source:, saying why it is needed', () => {
    const { card, issues } = readCard({ ...CHIP, source: undefined });
    expect(card).toBeNull();
    expect(issues).toContainEqual(expect.objectContaining({ path: ['source'], message: expect.stringContaining('確かめた資料') }));
  });

  test('refuses a pin count that does not match the package', () => {
    const { card, issues } = readCard({ ...CHIP, package: 'dip14' });
    expect(card).toBeNull();
    expect(issues.map((issue) => issue.message)).toContain('ピンの数が合いません (package: は 14 本、pins: は 8 本)');
  });

  test('refuses an unknown field instead of dropping a misspelling', () => {
    const { issues } = readCard({ ...CHIP, rolee: 'x' });
    expect(issues).toContainEqual(expect.objectContaining({ path: ['rolee'], severity: 'error' }));
  });

  test('refuses a field that belongs to another package', () => {
    const { issues } = readCard({ ...CHIP, kind: 'npn' });
    expect(issues).toContainEqual(expect.objectContaining({ path: ['kind'], message: 'kind: は package: が dip8 のカードには書けません' }));
  });

  test('refuses an unknown package with the list of what can be written', () => {
    const { issues } = readCard({ ...CHIP, package: 'qfp44' });
    expect(issues[0]?.message).toContain('dipN・sipN');
  });

  test('accepts a look after the slash (dip28/wide)', () => {
    const pins = Array.from({ length: 28 }, (_, index) => `P${index + 1}`);
    expect(cardOf({ ...CHIP, package: 'dip28/wide', pins }).package).toBe('dip28/wide');
  });

  test('reads a three-pin card with its kind and a case name from the look', () => {
    const card = cardOf({ models: ['XN100'], package: 'transistor/to220', kind: 'npn', pins: ['B', 'C', 'E'], role: 'NPN', source: 's' });
    expect(card).toMatchObject({ kind: 'discrete', type: 'transistor', discreteKind: 'npn', case: 'TO-220' });
  });

  test('refuses a regulator kind on a transistor package', () => {
    const { card } = readCard({ models: ['XR1'], package: 'transistor', kind: 'regulator', pins: ['I', 'G', 'O'], role: 'r', source: 's' });
    expect(card).toBeNull();
  });

  test('requires view: and product: for a device', () => {
    const { card, issues } = readCard({ models: ['XM-1'], package: 'device', pins: ['VCC', 'GND'], role: 'm', source: 's' });
    expect(card).toBeNull();
    expect(issues.map((issue) => issue.path[0])).toEqual(['view', 'product']);
  });

  test('requires a lower-case type name, a chip, a row span and a USB kind for a board', () => {
    const pins = Array.from({ length: 30 }, (_, index) => `D${index}`);
    const { issues } = readCard({ models: ['Arduino-Nano'], package: 'board', pins, role: 'b', source: 's' });
    expect(issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(['models', 'chip', 'row-span', 'usb']));
  });

  test('checks that spice nodes and ic sides name pins of the card', () => {
    const { issues } = readCard({ ...CHIP, spice: { model: 'XY', nodes: ['1A', 'OUT'] }, ic: { left: ['1A', 'Q'] } });
    expect(issues.map((issue) => issue.path)).toEqual([['spice', 'nodes', 1], ['ic', 'left', 1]]);
  });

  test('accepts only #rrggbb colours for look:', () => {
    const { issues } = readCard({ ...CHIP, package: 'sip8', look: { body: 'red', edge: '#000000' } });
    expect(issues[0]?.path).toEqual(['look', 'body']);
  });

  test('reads pins written as numbers as text but then refuses digits-only names', () => {
    const { issues } = readCard({ ...CHIP, pins: ['1A', '1B', '1Y', 'GND', '2Y', '2A', '2B', 5] });
    expect(issues[0]?.message).toContain('数字だけ');
  });
});

describe('checkPinNames', () => {
  test.each([
    ['IN–', 'en dash'],
    ['CARRY OUT', '空白'],
    ['1,2EN', ', があります'],
    ['5', '数字だけ'],
    ['ゲート', '打てない字'],
  ])('refuses %s', (name, word) => {
    expect(checkPinNames(['A', name])[0]?.message).toContain(word);
  });

  test('refuses two names that differ only in case, as the schematic reads them as one pin', () => {
    expect(checkPinNames(['A', 'a'])).toEqual([expect.objectContaining({ severity: 'error', path: ['pins', 1] })]);
  });

  test('notices a repeated name but lets NC and GND repeat', () => {
    expect(checkPinNames(['GAIN', 'X', 'GAIN'])).toEqual([expect.objectContaining({ severity: 'notice' })]);
    expect(checkPinNames(['NC', 'GND', 'NC', 'GND'])).toEqual([]);
  });

  test('passes every name already in the bundled tables except repeated ones', () => {
    const hard = [...pinoutTable(), ...moduleTable(), ...discreteTable()]
      .flatMap((row) => checkPinNames(row.names).filter((issue) => issue.severity === 'error').map((issue) => `${row.models[0]}: ${issue.message}`));
    expect(hard).toEqual([]);
  });
});

describe('withCards', () => {
  const table = tableOf(CHIP);

  test('makes a card visible to the lookups only while the function runs', () => {
    expect(lookupPinout('XY1234', 8)).toBeNull();
    const inside = withCards(table, () => lookupPinout('xy1234n', 8));
    expect(inside).toEqual({ model: 'XY1234', names: CHIP.pins });
    expect(lookupPinout('XY1234', 8)).toBeNull();
  });

  test('restores the outer state when the function throws', () => {
    expect(() => withCards(table, () => { throw new Error('boom'); })).toThrow('boom');
    expect(lookupPinoutNames('XY1234')).toBeNull();
  });

  test('keeps the outer table when the inner call has none', () => {
    expect(withCards(table, () => withCards(undefined, () => lookupPinoutNames('XY1234')?.model))).toBe('XY1234');
  });

  test('reports the local models that were looked up', () => {
    const { used } = withCardsUsed(table, () => [lookupPinout('XY1234N', 8), lookupPinout('NE555', 8)]);
    expect(used).toEqual(['XY1234']);
  });

  test('gives the English role from role-en and finds the gates from the names', () => {
    withCards(table, () => {
      expect(lookupRole('XY1234', 'en')).toBe('test NAND');
      expect(lookupGateUnits('XY1234')).toEqual([{ inputs: [1, 2], output: 3 }, { inputs: [6, 7], output: 5 }]);
    });
  });

  test('looks up three-pin, module and board cards', () => {
    const pins = Array.from({ length: 30 }, (_, index) => `D${index}`);
    const cards = tableOf(
      { models: ['XN100'], package: 'transistor/to92', kind: 'npn', pins: ['E', 'C', 'B'], role: 'NPN', source: 's' },
      { models: ['XM-1'], package: 'device', pins: ['VCC', 'GND', 'OUT'], role: 'm', source: 's', view: 'v', product: 'p' },
      { models: ['test-nano'], package: 'board', pins, role: 'b', source: 's', chip: 'ATmega328P', 'row-span': 6, usb: 'micro-b' },
    );
    withCards(cards, () => {
      expect(lookupDiscrete('transistor', 'XN100')).toEqual({ model: 'XN100', kind: 'npn', names: ['E', 'C', 'B'] });
      expect(lookupModule('xm-1')?.roleEn).toBe('m');
      expect(resolveDeviceModel('XM-1', ['OUT'])).toEqual({ ok: true, model: 'XM-1', names: ['OUT'] });
      expect(lookupBoardPart('test-nano')).toMatchObject({ name: 'test-nano', chip: 'ATmega328P', rowSpan: 6, reach: 0.55, usb: 'micro-b' });
      expect(boardPartNames()).toContain('test-nano');
    });
    expect(boardPartNames()).not.toContain('test-nano');
  });
});

describe('buildCardTable', () => {
  test('lets the bundled table win over a card with the same model and says so', () => {
    const { table, notices } = buildCardTable([{ card: cardOf({ ...CHIP, models: ['NE555', 'XY9'] }), file: 'a.part.yaml' }]);
    expect(notices).toEqual([expect.objectContaining({ file: 'a.part.yaml', model: 'NE555' })]);
    expect(table.pinouts[0]?.models).toEqual(['XY9']);
  });

  test('lets the first file win when two cards share a model', () => {
    const { table, notices } = buildCardTable([
      { card: cardOf({ ...CHIP, role: 'b' }), file: 'b.part.yaml' },
      { card: cardOf({ ...CHIP, role: 'a' }), file: 'a.part.yaml' },
    ]);
    expect(table.pinouts.map((row) => row.role)).toEqual(['a']);
    expect(notices.map((notice) => notice.file)).toEqual(['b.part.yaml', 'b.part.yaml']);
  });

  test('marks the rows of a local card as local', () => {
    expect(tableOf(CHIP).pinouts[0]?.card).toBe('local');
  });
});

describe('editorWithCards', () => {
  test('wraps every function of an editor so that it sees the cards', () => {
    const table = tableOf(CHIP);
    const editor = { language: 'bread', look: (model: string) => lookupPinoutNames(model)?.model ?? null };
    const wrapped = editorWithCards(editor as never, () => table) as unknown as typeof editor;
    expect(wrapped.language).toBe('bread');
    expect(wrapped.look('XY1234')).toBe('XY1234');
    expect(editor.look('XY1234')).toBeNull();
  });
});

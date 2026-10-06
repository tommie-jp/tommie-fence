import { describe, expect, test } from 'vitest';
import { VERIFY_NOTES, discreteModels, discreteTable, lookupDiscrete } from './discretes.ts';

/**
 * 3 ピンのディスクリートの表 (52 の docs/119)。並びは「印字面を手前、ピンを下にして左から右」で、
 * データシートの図で確かめたもの。
 */
describe('ディスクリートのピンの名前の表', () => {
  test.each([
    ['2SC1815', 'npn', ['E', 'C', 'B']],
    ['2SA1015', 'pnp', ['E', 'C', 'B']],
    ['2SC2120', 'npn', ['E', 'C', 'B']],
    ['2SA950', 'pnp', ['E', 'C', 'B']],
    ['2N3904', 'npn', ['E', 'B', 'C']],
    ['2N3906', 'pnp', ['E', 'B', 'C']],
    ['PN2222A', 'npn', ['E', 'B', 'C']],
    ['P2N2222A', 'npn', ['C', 'B', 'E']],
    ['2SC1008', 'npn', ['E', 'B', 'C']],
    ['2SD882', 'npn', ['E', 'C', 'B']],
    ['2SK30A', 'nch-jfet', ['S', 'G', 'D']],
    ['2SK170', 'nch-jfet', ['D', 'G', 'S']],
    ['2SJ74', 'pch-jfet', ['D', 'G', 'S']],
    ['2N7000', 'nch-mos', ['S', 'G', 'D']],
    ['BS170', 'nch-mos', ['D', 'G', 'S']],
    ['2N7002', 'nch-mos', ['G', 'S', 'D']],
    ['IRF540N', 'nch-mos', ['G', 'D', 'S']],
    ['IRF9540', 'pch-mos', ['G', 'D', 'S']],
  ])('names the pins of the transistor %s (%s)', (model, kind, names) => {
    expect(lookupDiscrete('transistor', model)).toMatchObject({ kind, names });
  });

  test('keeps the Japanese ECB order apart from the EBC order of the 2N parts', () => {
    expect(lookupDiscrete('transistor', '2SC1815')?.names).not.toEqual(lookupDiscrete('transistor', '2N3904')?.names);
  });

  test('keeps the same-package pairs that differ (2SK30A / 2SK170, 2N7000 / BS170) apart', () => {
    expect(lookupDiscrete('transistor', '2SK30A')?.names).not.toEqual(lookupDiscrete('transistor', '2SK170')?.names);
    expect(lookupDiscrete('transistor', '2N7000')?.names).not.toEqual(lookupDiscrete('transistor', 'BS170')?.names);
  });

  test('keeps the TO-92 78L05 and the TO-220 7805 in opposite order', () => {
    expect(lookupDiscrete('regulator', '78L05')?.names).toEqual(['OUT', 'GND', 'IN']);
    expect(lookupDiscrete('regulator', '7805')?.names).toEqual(['IN', 'GND', 'OUT']);
    expect(lookupDiscrete('regulator', 'LM317T')?.names).toEqual(['ADJ', 'OUT', 'IN']);
  });

  test('puts the negative regulators 7905 and 79L05 in GND IN OUT, unlike the positive 7805 / 78L05', () => {
    for (const model of ['7905', 'L7905CV', '79M05', '79L05', 'MC79L05']) {
      expect(lookupDiscrete('regulator', model), model).toMatchObject({ kind: 'regulator', names: ['GND', 'IN', 'OUT'] });
    }
    expect(lookupDiscrete('regulator', '7905')?.names).not.toEqual(lookupDiscrete('regulator', '7805')?.names);
    expect(lookupDiscrete('regulator', '79L05')?.names).not.toEqual(lookupDiscrete('regulator', '78L05')?.names);
  });

  test('asks the reader to check the real part for the two models whose datasheets disagree', () => {
    expect(Object.keys(VERIFY_NOTES)).toEqual(['2N7000', '2SD882']);
    expect(VERIFY_NOTES['2N7000']).toContain('2007 年版の図は S G D、2022 年版の表は D G S');
    expect(VERIFY_NOTES['2SD882']).toContain('ST の資料だけ図が B C E で、他は E C B');
    for (const [model, sentence] of Object.entries(VERIFY_NOTES)) {
      const row = discreteTable().find((one) => one.models.includes(model));
      expect(row?.note, model).toContain(sentence);
      expect(sentence, model).toContain('テスタで確かめる');
    }
  });

  test('reads a model in any case and with a grade suffix, and answers null for the unknown', () => {
    expect(lookupDiscrete('transistor', '2sc1815gr')?.model).toBe('2SC1815');
    expect(lookupDiscrete('transistor', 'NOPE1')).toBeNull();
    expect(lookupDiscrete('transistor', null)).toBeNull();
  });

  test('does not hand a transistor to a regulator lookup', () => {
    expect(lookupDiscrete('regulator', '2SC1815')).toBeNull();
  });

  test('spells a model once, gives every row a role and a source, and 3 distinct names', () => {
    const seen = new Set<string>();
    for (const row of discreteTable()) {
      expect(row.role, row.models[0]).not.toBe('');
      expect(row.source, row.models[0]).not.toBe('');
      expect(new Set(row.names).size, row.models[0]).toBe(3);
      for (const model of row.models) {
        expect(seen.has(model.toUpperCase()), model).toBe(false);
        seen.add(model.toUpperCase());
      }
    }
    expect(discreteModels().length).toBe(discreteTable().length);
  });

  test('names a polarity-correct kind for the JFET and MOSFET rows', () => {
    for (const row of discreteTable().filter((one) => one.type === 'transistor')) {
      expect(['npn', 'pnp', 'nch-mos', 'pch-mos', 'nch-jfet', 'pch-jfet']).toContain(row.kind);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { icLayoutModels, lookupIcPinout } from './icLayouts.ts';

describe('IC の働きの並び', () => {
  it('型番の別の綴りでも同じ並びを引く', () => {
    // Act
    const pinout = lookupIcPinout('ne555p');

    // Assert
    expect(pinout?.model).toBe('NE555');
    expect(pinout?.layout.top).toEqual(['VCC', 'RESET']);
  });

  it('TLC555 は電源のピンが VDD', () => {
    expect(lookupIcPinout('TLC555')?.layout.top).toEqual(['VDD', 'RESET']);
  });

  it('並びを持たない型番は null', () => {
    expect(lookupIcPinout('LM358')).toBeNull();
    expect(lookupIcPinout(null)).toBeNull();
  });

  it.each(icLayoutModels())('%s は全部のピンを 1 度ずつ 4 辺に置く', (model) => {
    // Arrange
    const pinout = lookupIcPinout(model);
    if (pinout === null) throw new Error(model);
    const { left, right, top, bottom } = pinout.layout;

    // Act
    const placed = [...left, ...right, ...top, ...bottom];

    // Assert
    expect([...placed].sort()).toEqual([...pinout.names].sort());
  });
});

describe('CD4511 の働きの並び', () => {
  it('入力 A〜D は左、出力 a〜g は右にセグメントの順で並ぶ', () => {
    // Act
    const layout = lookupIcPinout('CD4511')?.layout;

    // Assert
    expect(layout?.left).toEqual(['INA', 'INB', 'INC', 'IND']);
    expect(layout?.right).toEqual(['Oa', 'Ob', 'Oc', 'Od', 'Oe', 'Of', 'Og']);
    expect(layout?.bottom).toEqual(['VSS', 'LE/STROBE']);
  });
});

describe('カウンタ・デコーダ・SRAM の働きの並び', () => {
  it('74HC163 は別の綴りでも引け、電源と CLR・LOAD は上、Q は右', () => {
    for (const model of ['74HC163', 'SN74HC163N', 'CD74HC163E']) {
      const layout = lookupIcPinout(model)?.layout;
      expect(layout?.top, model).toEqual(['VCC', 'CLR', 'LOAD']);
      expect(layout?.right, model).toEqual(['QA', 'QB', 'QC', 'QD', 'RCO']);
      expect(layout?.left, model).toEqual(['A', 'B', 'C', 'D', 'ENP', 'ENT', 'CLK']);
      expect(layout?.bottom, model).toEqual(['GND']);
    }
  });

  it('74HC154 はアドレスが左、Y0〜Y15 が右、イネーブルは GND の隣', () => {
    const layout = lookupIcPinout('CD74HC154E')?.layout;
    expect(layout?.left).toEqual(['A0', 'A1', 'A2', 'A3']);
    expect(layout?.right).toHaveLength(16);
    expect(layout?.bottom).toEqual(['GND', 'E1', 'E2']);
  });

  it('62256 はアドレスが左、データが右、CE・OE・WE は下', () => {
    const layout = lookupIcPinout('AS6C62256')?.layout;
    expect(layout?.left).toHaveLength(15);
    expect(layout?.right).toEqual(['DQ0', 'DQ1', 'DQ2', 'DQ3', 'DQ4', 'DQ5', 'DQ6', 'DQ7']);
    expect(layout?.bottom).toEqual(['VSS', 'CE', 'OE', 'WE']);
    expect(layout?.top).toEqual(['VCC']);
  });
});

describe('CMOS 4000 系のカウンタ・フリップフロップの働きの並び', () => {
  it('CD4040B はクロックとリセットが左、Q1〜Q12 が右、VDD は上、VSS は下', () => {
    for (const model of ['CD4040B', 'CD4040', 'CD4040BE']) {
      const pinout = lookupIcPinout(model);
      expect(pinout?.model, model).toBe('CD4040B');
      expect(pinout?.layout.left, model).toEqual(['CLOCK', 'R']);
      expect(pinout?.layout.right, model).toEqual(
        ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'Q12'],
      );
      expect(pinout?.layout.top, model).toEqual(['VDD']);
      expect(pinout?.layout.bottom, model).toEqual(['VSS']);
    }
  });

  it('CD4013B は D・CLOCK・SET・RESET が左、Q と /Q が右、VDD は上、VSS は下', () => {
    const layout = lookupIcPinout('CD4013BE')?.layout;
    expect(layout?.left).toEqual(['D1', 'CLOCK1', 'SET1', 'RESET1', 'D2', 'CLOCK2', 'SET2', 'RESET2']);
    expect(layout?.right).toEqual(['Q1', '/Q1', 'Q2', '/Q2']);
    expect(layout?.top).toEqual(['VDD']);
    expect(layout?.bottom).toEqual(['VSS']);
  });
});

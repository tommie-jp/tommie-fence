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

  it('TLC555 は電源の足が VDD', () => {
    expect(lookupIcPinout('TLC555')?.layout.top).toEqual(['VDD', 'RESET']);
  });

  it('並びを持たない型番は null', () => {
    expect(lookupIcPinout('LM358')).toBeNull();
    expect(lookupIcPinout(null)).toBeNull();
  });

  it.each(icLayoutModels())('%s は全部の足を 1 度ずつ 4 辺に置く', (model) => {
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

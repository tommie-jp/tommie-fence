import { describe, expect, test } from 'vitest';
import { applyEdits } from './shared.ts';
import { deviceIds, deviceSpans, isDevice, moveDevice } from './device.ts';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';

/**
 * 板の外の機器を升目から掴む (実機で「ブレッドボード外にある部品も選択、
 * 動かす…の対象にする」)。この板で動かすというのは、上下どちらの帯にするか。
 */
const WITH_AT = [
  'parts:',
  '  R1: resistor a5 a10',
  '  AD2:',
  '    type: device',
  '    at: top',
  '    label: Analog Discovery 2',
  '    pins: [W1, GND]',
  '',
].join('\n');

const NO_AT = WITH_AT.replace('    at: top\n', '');
const at = (written: string): Address => parseAddress(written)!;

const after = (source: string, to: string): string => {
  const moved = moveDevice(source, 'AD2', at(to));
  if (!moved.ok) throw new Error(moved.error.message);
  return applyEdits(source, moved.value.edits);
};

describe('板の外の機器を掴む', () => {
  test('counts a device as something the map can grab', () => {
    expect(deviceIds(WITH_AT)).toEqual(['AD2']);
    expect(isDevice(WITH_AT, 'AD2')).toBe(true);
    expect(isDevice(WITH_AT, 'R1')).toBe(false);
  });

  test('lights the place its side is written', () => {
    expect(deviceSpans(WITH_AT, 'AD2')).toEqual([{ line: 5, column: 8, length: 3 }]);
  });

  test('moves it to the band the dropped hole belongs to', () => {
    // 溝より下の穴へ落としたら下の帯、上なら上の帯。
    expect(after(WITH_AT, 'g5')).toContain('    at: bottom');
    expect(after(after(WITH_AT, 'g5'), 'b5')).toContain('    at: top');
    // レールでも決まる。
    expect(after(WITH_AT, '-b5')).toContain('    at: bottom');
  });

  test('adds `at:` when the device does not have one', () => {
    expect(NO_AT).not.toContain('at:');
    const moved = after(NO_AT, 'g5');

    expect(moved).toContain('    at: bottom');
    expect(moved.split('\n').length).toBe(NO_AT.split('\n').length + 1);
  });

  test('says so when the name is not a device', () => {
    expect(moveDevice(WITH_AT, 'R1', at('g5')).ok).toBe(false);
  });
});

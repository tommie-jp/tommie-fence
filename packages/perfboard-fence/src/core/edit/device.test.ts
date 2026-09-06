import { describe, expect, test } from 'vitest';
import { deviceIds, deviceSpans, isDevice, moveDevice } from './device.ts';
import { applyEdits } from './shared.ts';

/**
 * 板の外の機器を升目から掴む (実機で「基板外の部品もマウスコマンドの対象にする」)。
 * 機器は入れ子で書くので、動かすというのは `at:` を書き換えること。
 */
const WITH_AT = [
  'board: 12x8',
  'parts:',
  '  R1: resistor c3 c7',
  '  BAT:',
  '    type: device',
  '    at: top',
  '    label: 電池 3V',
  '    pins: + -',
  '',
].join('\n');

const NO_AT = WITH_AT.replace('    at: top\n', '');

const after = (source: string, id: string, to: string): string => {
  const moved = moveDevice(source, id, to);
  if (!moved.ok) throw new Error(moved.error.message);
  return applyEdits(source, moved.value.edits);
};

describe('板の外の機器を掴む', () => {
  test('counts a device as something the map can grab', () => {
    expect(deviceIds(WITH_AT)).toEqual(['BAT']);
    expect(isDevice(WITH_AT, 'BAT')).toBe(true);
    // 板に載る部品は今までどおり部品の道 (`move.ts`) で動く。
    expect(isDevice(WITH_AT, 'R1')).toBe(false);
  });

  test('lights the place its position is written, so the editor can show it', () => {
    // `at:` の値。行は 1 始まり、桁は 0 始まり (`locateTokens` と同じ)。
    expect(deviceSpans(WITH_AT, 'BAT')).toEqual([{ line: 6, column: 8, length: 3 }]);
  });

  test('moves it by rewriting `at:`, since a device has no holes', () => {
    expect(after(WITH_AT, 'BAT', 'n5')).toContain('    at: n5');
    // 上下の帯へも戻せる。
    expect(after(WITH_AT, 'BAT', 'bottom')).toContain('    at: bottom');
  });

  test('adds `at:` when the device does not have one, instead of refusing', () => {
    // 書いていなければ既定の `top`。動かした先を書き足す。
    expect(NO_AT).not.toContain('at:');
    const moved = after(NO_AT, 'BAT', 'n5');

    expect(moved).toContain('    at: n5');
    // 足すのは 1 行だけで、ほかの行はそのまま。
    expect(moved.split('\n').length).toBe(NO_AT.split('\n').length + 1);
  });

  test('says so when the name is not a device', () => {
    const moved = moveDevice(WITH_AT, 'R1', 'n5');

    expect(moved.ok).toBe(false);
  });

  test('lights the name when there is no `at:` to light', () => {
    expect(deviceSpans(NO_AT, 'BAT')).toEqual([{ line: 4, column: 2, length: 3 }]);
  });
});

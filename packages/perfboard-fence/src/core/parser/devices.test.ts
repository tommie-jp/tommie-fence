import { describe, expect, test } from 'vitest';
import { parseDevice } from './devices.ts';

const read = (entries: Record<string, unknown>) => parseDevice('BAT', entries);

describe('parseDevice', () => {
  test('reads a device with a label and pins', () => {
    const result = read({ type: 'device', at: 'bottom', label: '電池 3V', pins: ['+', '-'] });

    expect(result.ok && result.value).toEqual({
      id: 'BAT', at: 'bottom', label: '電池 3V', pins: ['+', '-'], line: null,
    });
  });

  test('puts a device above the board unless told otherwise', () => {
    expect(read({ type: 'device', pins: ['1', '2'] }).ok && read({ type: 'device', pins: ['1', '2'] }))
      .toMatchObject({ value: { at: 'top' } });
  });

  test('falls back to the name when no label was written', () => {
    expect(read({ type: 'device', pins: ['1'] }).ok && read({ type: 'device', pins: ['1'] }))
      .toMatchObject({ value: { label: 'BAT' } });
  });

  test('reads a one-line pin list, so + and - need no quoting', () => {
    // YAML の並びに書くと `- ` が箱の始まりに読まれる。電池の端子を書くたびに
    // 引っかかるので、空白区切りの 1 行も同じものとして受ける。
    expect(read({ type: 'device', pins: '+ -' })).toEqual(read({ type: 'device', pins: ['+', '-'] }));
  });

  test('says a device needs pins to wire to', () => {
    expect(read({ type: 'device' }).ok).toBe(false);
    expect(read({ type: 'device', pins: [] }).ok).toBe(false);
    expect(read({ type: 'device', pins: '   ' }).ok).toBe(false);
  });

  test('refuses a pin name a wire could not write', () => {
    expect(read({ type: 'device', pins: ['a b'] }).ok).toBe(false);
    expect(read({ type: 'device', pins: [''] }).ok).toBe(false);
  });

  test('refuses two pins with the same name', () => {
    // 同じ名前が 2 つあると、配線がどちらを指すのか決まらない。
    expect(read({ type: 'device', pins: ['+', '+'] }).ok).toBe(false);
  });

  test('names a side it does not know', () => {
    const result = read({ type: 'device', at: 'left', pins: ['1'] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('left');
  });

  test('names a key it does not know', () => {
    expect(read({ type: 'device', pins: ['1'], colour: 'red' }).ok).toBe(false);
  });

  test('stops at the pin limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => `p${i}`);

    expect(read({ type: 'device', pins: many }).ok).toBe(false);
  });
});

describe('入れ子を機器と決めつけない', () => {
  test('refuses a nested entry that did not say it is a device', () => {
    // **入れ子なら機器、にしない。** 部品を書き間違えて字下げした人が、
    // 板の外に箱が出ているのを見て気づけないまま終わる。
    expect(read({ pins: ['+', '-'] }).ok).toBe(false);
    expect(read({ type: 'resistor', pins: ['+', '-'] }).ok).toBe(false);
    expect(read({ type: 'devise', pins: ['+', '-'] }).ok).toBe(false);
  });

  test('names what was written there, so the typo can be seen', () => {
    const result = read({ type: 'devise', pins: ['+'] });

    expect(!result.ok && result.error.message).toContain('devise');
  });
});

import { describe, expect, test } from 'vitest';
import { parseHoldItem } from './hold.ts';

describe('parseHoldItem — hold: の 1 つ', () => {
  test('reads one wave as it is written in signal:', () => {
    const read = parseHoldItem('sine 90MHz -50dBm', 'swept');
    expect(read).toMatchObject({ ok: true, value: { kind: 'wave' } });
  });

  test('reads a range as a moving wave', () => {
    const read = parseHoldItem('sine 74MHz..102MHz -54.4dBm', 'swept');
    expect(read).toMatchObject({ ok: true, value: { kind: 'tune', from: 74e6, to: 102e6, step: null } });
    if (read.ok && read.value.kind === 'tune') expect(read.value.wave.frequency).toBe(74e6);
  });

  test('reads the step after a slash, and the short spelling', () => {
    expect(parseHoldItem('sine 2402M..2480M/2M -48dBm', 'swept')).toMatchObject({ ok: true, value: { from: 2402e6, to: 2480e6, step: 2e6 } });
    expect(parseHoldItem('sine 2402.5MHz..2480MHz/500kHz -48dBm', 'swept')).toMatchObject({ ok: true, value: { from: 2402.5e6, step: 500e3 } });
  });

  test('refuses a range that does not go up, pointing at the range', () => {
    expect(parseHoldItem('sine 102MHz..74MHz -50dBm', 'swept')).toMatchObject({ ok: false, token: '102MHz..74MHz' });
  });

  test('refuses a bare number in the range (the same rule as every frequency)', () => {
    const read = parseHoldItem('sine 74..102 -50dBm', 'swept');
    expect(read).toMatchObject({ ok: false, token: '74..102' });
  });

  test('refuses a zero or unreadable step', () => {
    expect(parseHoldItem('sine 74M..102M/0 -50dBm', 'swept')).toMatchObject({ ok: false, token: '74M..102M/0' });
    expect(parseHoldItem('sine 74M..102M/x -50dBm', 'swept')).toMatchObject({ ok: false });
  });

  test('asks the FFT type for a step (it does an FFT per position)', () => {
    const read = parseHoldItem('sine 1kHz..9kHz 1V', 'fft');
    expect(read).toMatchObject({ ok: false, token: '1kHz..9kHz' });
    expect(read.ok ? '' : read.reason).toContain('刻み');
    expect(parseHoldItem('sine 1kHz..9kHz/2kHz 1V', 'fft')).toMatchObject({ ok: true });
  });

  test('refuses a dc wave with a range, and an operation', () => {
    expect(parseHoldItem('dc 0V..1V 1V', 'swept').ok).toBe(false);
    expect(parseHoldItem('sine 74M..102M -50dBm | rc 1ms', 'swept')).toMatchObject({ ok: false, token: '|' });
  });

  test('refuses two ranges in one line', () => {
    expect(parseHoldItem('sine 74M..80M 1V..2V', 'swept').ok).toBe(false);
  });

  test('passes on the notices of the wave (duty)', () => {
    const read = parseHoldItem('pulse 74MHz..80MHz -50dBm', 'swept');
    expect(read.ok ? read.value.assumed.length : 0).toBeGreaterThan(0);
  });
});

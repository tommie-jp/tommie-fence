import { describe, expect, test } from 'vitest';
import { decodeUart, parseDecode } from './decode.ts';
import type { DecodeSpec } from './decode.ts';
import { waveOf } from './wave.ts';
import { windowOf } from './window.ts';

const uart = (text: string): DecodeSpec => {
  const read = parseDecode(text);
  if (!read.ok) throw new Error(read.reason);
  return read.value;
};

describe('parseDecode', () => {
  test('reads a uart line', () => {
    expect(uart('uart TXD baud 9600 8N1')).toEqual({ kind: 'uart', lane: 'TXD', baud: 9600, dataBits: 8, parity: 'N', stopBits: 1, show: 'hex' });
    expect(uart('uart RX baud 115200 7E2 ascii')).toMatchObject({ dataBits: 7, parity: 'E', stopBits: 2, show: 'ascii' });
  });

  test('says spi and i2c are not there yet', () => {
    const read = parseDecode('spi CLK');
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toContain('まだ書けません');
  });

  test('asks for the baud and the format', () => {
    expect(parseDecode('uart TXD').ok).toBe(false);
    expect(parseDecode('uart TXD baud 9600').ok).toBe(false);
    expect(parseDecode('uart TXD baud 9600 8X1').ok).toBe(false);
  });
});

describe('decodeUart', () => {
  // idle 1, then start 0 + 'H' (0x48, LSB first 00010010) + stop 1, then idle. 1 bit = 1 ms.
  const bits = '1' + '0' + '00010010' + '1' + '1';
  const wave = waveOf({ kind: 'pattern', bits, bitTime: 0.001, from: 0, repeat: false });
  const window = windowOf(0, 0.002);

  test('reads one byte', () => {
    const frames = decodeUart(uart('uart T baud 1000 8N1'), wave, window)?.frames;
    expect(frames).toHaveLength(1);
    expect(frames?.[0]).toMatchObject({ value: 0x48, text: '0x48', error: null });
    expect(frames?.[0]?.t0).toBeCloseTo(0.001);
    expect(frames?.[0]?.t1).toBeCloseTo(0.011);
  });

  test('shows a printable byte as a character under ascii', () => {
    expect(decodeUart(uart('uart T baud 1000 8N1 ascii'), wave, window)?.frames[0]?.text).toBe("'H'");
  });

  test('flags a wrong stop bit instead of hiding it', () => {
    const broken = waveOf({ kind: 'pattern', bits: '1' + '0' + '00010010' + '0' + '1', bitTime: 0.001, from: 0, repeat: false });
    expect(decodeUart(uart('uart T baud 1000 8N1'), broken, window)?.frames[0]).toMatchObject({ error: 'framing' });
  });

  test('checks parity', () => {
    // 0x48 has two 1 bits: even parity bit = 0. Send 1 instead.
    const wrong = waveOf({ kind: 'pattern', bits: '1' + '0' + '00010010' + '1' + '1' + '1', bitTime: 0.001, from: 0, repeat: false });
    expect(decodeUart(uart('uart T baud 1000 8E1'), wrong, window)?.frames[0]).toMatchObject({ error: 'parity' });
    const right = waveOf({ kind: 'pattern', bits: '1' + '0' + '00010010' + '0' + '1' + '1', bitTime: 0.001, from: 0, repeat: false });
    expect(decodeUart(uart('uart T baud 1000 8E1'), right, window)?.frames[0]).toMatchObject({ error: null, value: 0x48 });
  });

  test('leaves out a frame that does not fit in the window', () => {
    expect(decodeUart(uart('uart T baud 1000 8N1'), wave, windowOf(0, 0.0005))?.frames).toEqual([]);
  });
});

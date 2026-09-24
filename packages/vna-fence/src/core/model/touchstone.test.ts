import { describe, expect, test } from 'vitest';
import { abs } from './complex.ts';
import { parseTouchstone, portsOf } from './touchstone.ts';
import { phaseDeg } from './sparams.ts';

const ri = ['! NanoVNA-Saver', '# HZ S RI R 50', '1000000 0.5 0 0.5 0 0.5 0 0.5 0', '2000000 0.5 0.1 0.5 -0.1 0.5 -0.1 0.5 0.1'].join('\n');

describe('parseTouchstone', () => {
  test('reads what NanoVNA-Saver writes', () => {
    const read = parseTouchstone(ri, 2);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.points).toHaveLength(2);
    expect(read.value.points[1]?.s11?.im).toBeCloseTo(0.1, 9);
    expect(read.value.points[1]?.s21?.im).toBeCloseTo(-0.1, 9);
    expect(read.value.z0).toBe(50);
  });

  test('the same value in RI, MA and DB reads the same', () => {
    const lines = (option: string, pair: string): string => [`# MHZ S ${option} R 50`, `10 ${pair}`].join('\n');
    const forms = [lines('RI', '0 0.5'), lines('MA', '0.5 90'), lines('DB', '-6.0206 90')];
    for (const form of forms) {
      const read = parseTouchstone(form, 1);
      expect(read.ok).toBe(true);
      if (!read.ok) continue;
      const s11 = read.value.points[0]?.s11;
      expect(abs(s11!)).toBeCloseTo(0.5, 4);
      expect(phaseDeg(s11!)).toBeCloseTo(90, 4);
      expect(read.value.points[0]?.f).toBe(10e6);
      expect(read.value.points[0]?.s21).toBeNull();
    }
  });

  test('takes the default option line (GHz, MA) when none is written', () => {
    const read = parseTouchstone('1 0.5 0', 1);
    expect(read.ok && read.value.points[0]?.f).toBe(1e9);
  });

  test('joins a 2-port point spread over two lines, and handles CRLF and comments', () => {
    const read = parseTouchstone('# HZ S RI R 50\r\n1 0.1 0 0.2 0 ! S11 S21\r\n0.2 0 0.1 0\r\n', 2);
    expect(read.ok && read.value.points[0]?.s22?.re).toBeCloseTo(0.1, 9);
  });

  test('reads the reference impedance', () => {
    const read = parseTouchstone('# HZ S RI R 75\n1 0 0', 1);
    expect(read.ok && read.value.z0).toBe(75);
  });

  test.each([
    ['[Version] 2.0\n# HZ S RI R 50', '2.0'],
    ['# HZ Z RI R 50\n1 0 0', 'Z パラメータ'],
    ['# HZ S RI R x\n1 0 0', 'R の後ろ'],
    ['# HZ S RI Q 50\n1 0 0', 'Q が読めません'],
    ['# HZ S RI R 50\n1 a 0', '数でない'],
    ['# HZ S RI R 50\n2 0 0\n1 0 0', '増えていません'],
    ['# HZ S RI R 50', '1 つもありません'],
    ['# HZ S RI R 50\n1 0 0 0', '3 ではありません'],
    ['# HZ S RI R 50\n1 0', '足りません'],
  ])('refuses %j', (text, said) => {
    const read = parseTouchstone(text, 1);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toContain(said);
  });

  test('ignores a second option line, as the spec says', () => {
    const read = parseTouchstone('# HZ S RI R 50\n# GHZ S MA R 50\n1 0.5 0', 1);
    expect(read.ok && read.value.points[0]?.f).toBe(1);
  });

  test('refuses a file that is too large', () => {
    const read = parseTouchstone('!'.repeat(1_000_001), 1);
    expect(!read.ok && read.reason).toContain('大きすぎます');
  });
});

describe('portsOf', () => {
  test('reads the port count from the extension', () => {
    expect(portsOf('a.s1p')).toBe(1);
    expect(portsOf('a.S2P')).toBe(2);
    expect(portsOf('a.s3p')).toBeNull();
  });
});

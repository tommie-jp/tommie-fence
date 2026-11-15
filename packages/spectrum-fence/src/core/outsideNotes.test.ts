import { describe, expect, test } from 'vitest';
import { renderSpectrum } from './index.ts';

const BASE = 'device: tinysa-ultra\nsweep: 0-960M 450\nrbw: 300kHz\nref: 0dBm\nsignal: square 100MHz -10dBm\n';

const errorsOf = (notes: string) => renderSpectrum(BASE + notes).errors.filter((error) => error.notice !== true && error.info !== true);

describe('notes: text below / above (outside the screen)', () => {
  test('draws the text under the screen and makes the figure taller', () => {
    const plain = renderSpectrum(BASE);
    const result = renderSpectrum(BASE + 'notes:\n  - text below red bold: 読み方は\\n2 行め\n');
    expect(errorsOf('notes:\n  - text below red bold: 読み方は\\n2 行め\n')).toEqual([]);
    expect(result.svg).toContain('読み方は');
    expect(result.svg).toContain('2 行め');
    expect(result.svg).toContain('font-weight="700"');
    const height = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);
    expect(height(result.svg)).toBeGreaterThan(height(plain.svg));
  });

  test('draws the text above the screen', () => {
    expect(renderSpectrum(BASE + 'notes:\n  - text above: 上の字\n').svg).toContain('上の字');
    expect(errorsOf('notes:\n  - text above: 上の字\n')).toEqual([]);
  });

  test('refuses an unknown word', () => {
    expect(errorsOf('notes:\n  - text below spam: 字\n').length).toBeGreaterThan(0);
  });
});

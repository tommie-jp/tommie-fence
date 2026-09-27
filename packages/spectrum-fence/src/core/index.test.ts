import { describe, expect, test } from 'vitest';
import { renderSpectrum } from './index.ts';

describe('renderSpectrum — 段 0', () => {
  test('draws the 10 × 10 grid even for an empty fence, and asks for device:', () => {
    const result = renderSpectrum('');
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('data-spectrum-fence');
    expect(result.svg.match(/stroke-dasharray="1 3"/g)).toHaveLength(18);
    expect(result.svg).toContain('>−100<');
    expect(result.errors.map((error) => error.message)).toEqual([
      'spectrum フェンスが空です — device: は ad2 / ad3 / tinysa / tinysa-ultra / generic のどれかを書きます (計算の仕方が変わります)',
    ]);
    expect(result.errorHtml).toContain('spectrum-errors');
  });

  test('writes no NaN or Infinity into the drawing', () => {
    for (const source of ['', 'device: ad2', 'title: x', 'foo: 1', 'device: generic']) {
      expect(renderSpectrum(source).svg).not.toMatch(/NaN|Infinity/);
    }
  });

  test('names the instrument on the status row', () => {
    expect(renderSpectrum('device: tinysa-ultra').svg).toContain('tinySA Ultra');
  });

  test('moves line numbers to the markdown lines', () => {
    const [error] = renderSpectrum('device: ad2\nfoo: 1', { offset: 10 }).errors;
    expect(error?.line).toBe(12);
  });

  test('keeps the title, escaped', () => {
    const { svg } = renderSpectrum('device: ad2\ntitle: <b>図</b>');
    expect(svg).toContain('&lt;b&gt;図');
    expect(svg).not.toContain('<b>');
  });

  test('shows notices only under style: debug (on by default)', () => {
    expect(renderSpectrum('device: ad2\nstyle:\n  debug: off').errorHtml).toBe('');
  });
});

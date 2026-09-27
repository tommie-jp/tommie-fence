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

const ELEVEN_FOUR = [
  'title: 図1 NanoVNA の出力 — 100 MHz の方形波の高調波',
  'device: tinysa-ultra',
  'sweep: 0-960M 450',
  'rbw: 300kHz',
  'ref: -10dBm',
  'signal: square 100MHz -10dBm',
  'markers: [100M, 300M, 500M]',
].join('\n');

const ELEVEN_TWO = (extra: string): string => [
  'device: tinysa-ultra', 'center: 30MHz', 'span: 2MHz', 'points: 101', 'rbw: 3kHz', 'ref: -20dBm',
  'signal: sine 30MHz -40dBm', 'markers: [peak, 30.5MHz]', extra,
].join('\n');

const said = (source: string): readonly string[] => {
  const result = renderSpectrum(source);
  return [...result.errors, ...result.notices].map((error) => error.message);
};

describe('renderSpectrum — 段 1', () => {
  test('draws 11-4: one dashed trace, three markers on the peaks and the readings, saying nothing', () => {
    const result = renderSpectrum(ELEVEN_FOUR);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.svg.match(/<polyline /g)).toHaveLength(1);
    expect(result.svg).toContain('stroke-dasharray="5 3"');
    expect(result.svg.match(/data-marker=/g)).toHaveLength(3);
    expect(result.readingLines).toEqual([
      '読み値 — 理想 (計算)',
      'M  周波数       レベル',
      '1  100.000 MHz  −7.90 dBm',
      '2  300.000 MHz  −17.44 dBm',
      '3  500.000 MHz  −21.88 dBm',
    ]);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    for (const word of ['tinySA Ultra', 'START 0 Hz', 'STOP 960 MHz', 'RBW 300 kHz', 'ATT 0 dB', '450 pt', 'REF −10 dBm', '10 dB/div']) {
      expect(result.svg).toContain(word);
    }
  });

  test('reads the floor of 11-2 at −112 dBm with RBW 3 kHz, and −92 dBm with atten: 20dB (11-3)', () => {
    expect(renderSpectrum(ELEVEN_TWO('')).readingLines.slice(2)).toEqual(['1  30.000 MHz  −40.00 dBm', '2  30.500 MHz  −112.00 dBm']);
    expect(renderSpectrum(ELEVEN_TWO('atten: 20dB')).readingLines.slice(2)).toEqual(['1  30.000 MHz  −40.00 dBm', '2  30.500 MHz  −92.00 dBm']);
    expect(renderSpectrum(ELEVEN_TWO('')).svg).toContain('CENTER 30 MHz');
  });

  test('reads AD 4-2 in dBV, and thins 3200 bins to the width of the grid', () => {
    const result = renderSpectrum('device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: hann\nsignal: square 1kHz 1V\nmarkers: [1kHz, 3kHz]');
    expect(result.notices).toEqual([]);
    expect(result.readingLines.slice(2)).toEqual(['1  1.000 kHz  −0.91 dBV', '2  3.000 kHz  −10.45 dBV']);
    const points = /<polyline points="([^"]*)"/.exec(result.svg)?.[1]?.split(' ') ?? [];
    expect(points.length).toBeLessThanOrEqual(800);
    expect(result.svg).toContain('分解能 6.250 Hz');
    expect(result.svg).toContain('Hann');
  });

  test('says which defaults it filled in, but not the look', () => {
    expect(said('device: ad2\nsignal: sine 1kHz 1V')).toEqual([
      'sweep: が無いので AD2 の範囲 (0 Hz〜25 MHz) で描いています',
      'samples: が無いので 8192 で描いています',
      'window: が無いので flattop で描いています',
    ]);
    expect(said('device: generic\nsweep: 0-1M 101\nrbw: 10kHz')).toEqual(['Generic のフロアは floor: で書きます (いまは −100 dBm で描いています)']);
  });

  test('draws the floor alone on a swept instrument without a signal', () => {
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 0-1M 101\nrbw: 30kHz');
    expect(result.svg.match(/<polyline /g)).toHaveLength(1);
    expect(renderSpectrum('device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: hann').svg).not.toContain('<polyline');
  });

  test('refuses an RBW off the menu, and still draws with the auto value', () => {
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 0-1M 101\nrbw: 5kHz');
    expect(result.errors[0]?.message).toContain('から選びます');
    expect(result.errors[0]?.line).toBe(3);
    expect(result.svg).toContain('RBW 10 kHz');
  });

  test('says when a marker is outside the sweep, or the input is too strong', () => {
    expect(said('device: tinysa-ultra\nsweep: 0-1M 101\nrbw: 30kHz\nmarkers: [2M]')).toEqual(['マーカー 2 MHz は掃引 (0 Hz〜1 MHz) の外です (描いていません)']);
    expect(said('device: tinysa-ultra\nsweep: 0-200M 101\nrbw: 30kHz\nsignal: sine 100MHz +10dBm')[0]).toContain('入力の上限 +6 dBm');
    expect(said('device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: hann\nsignal: sine 1kHz 30V')[0]).toContain('入力の上限 ±25 V');
  });

  test('says when the sweep is too narrow for the FFT resolution, and when points are off the menu', () => {
    expect(said('device: ad2\ncenter: 1MHz\nspan: 50Hz\nsamples: 8192\nwindow: hann')[0]).toContain('bin が');
    expect(said('device: tinysa-ultra\nsweep: 0-1M 401\nrbw: 30kHz')[0]).toContain('から選びます (450 点で描いています)');
  });

  test('shows the display in dBm when unit: dBm is written on an FFT instrument', () => {
    const result = renderSpectrum('device: ad3\nsweep: 0-20MHz\nsamples: 8192\nwindow: hann\nunit: dBm\nsignal: square 1MHz -10dBm\nmarkers: [1M]');
    expect(result.readingLines[2]).toBe('1  1.000 MHz  −7.90 dBm');
    expect(result.svg).toContain('REF 13.01 dBm');
  });

  test('marks a marker near the top edge below the point', () => {
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 0-200M 101\nrbw: 30kHz\nref: -40dBm\nsignal: sine 100MHz -40dBm\nmarkers: [peak]');
    expect(result.svg).toMatch(/data-marker="1"/);
  });
});

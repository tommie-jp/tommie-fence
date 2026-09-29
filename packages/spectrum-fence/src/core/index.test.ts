import { describe, expect, test } from 'vitest';
import { renderSpectrum, STAMP_TEXT } from './index.ts';

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
  'ref: 0dBm',
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
  test('draws 11-4: one solid trace (no measurement to tell it from), three markers on the peaks and the readings, saying nothing', () => {
    const result = renderSpectrum(ELEVEN_FOUR);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.svg.match(/<polyline /g)).toHaveLength(1);
    expect(result.svg).not.toContain('stroke-dasharray="5 3"');
    expect(result.svg.match(/data-marker=/g)).toHaveLength(3);
    expect(result.readingLines).toEqual([
      '読み値 — 理想 (計算)',
      'M  周波数       レベル',
      '1  100.000 MHz  −7.90 dBm',
      '2  300.000 MHz  −17.44 dBm',
      '3  500.000 MHz  −21.88 dBm',
    ]);
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    for (const word of ['tinySA Ultra', 'START 0 Hz', 'STOP 960 MHz', 'RBW 300 kHz', 'ATT 0 dB', '450 pt', 'REF 0 dBm', '10 dB/div']) {
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
      // 1 kHz は分解能 (7.813 kHz) より細かく、理想の山が REF の上に出る (計算はそのまま)。
      '一番高い山 (1.97 dBV、7.813 kHz) は REF (0 dBV) より上で切れています (ref: 10dBV なら入ります)',
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
    expect(said('device: tinysa-ultra\nsweep: 0-200M 101\nrbw: 30kHz\nsignal: sine 100MHz +10dBm').join('\n')).toContain('入力の上限 +6 dBm');
    expect(said('device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: hann\nsignal: sine 1kHz 30V').join('\n')).toContain('入力の上限 ±25 V');
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

// 刻印は既定で付く (ほかのフェンスと同じ)。書き手が消せるのは `stamp: off` だけ (字は書かせない)。
describe('renderSpectrum — 刻印', () => {
  test('stamps the version at the bottom right without being asked', () => {
    expect(renderSpectrum(ELEVEN_FOUR).svg).toContain(`>${STAMP_TEXT}</text>`);
  });

  test('leaves the stamp out when told stamp: off', () => {
    expect(renderSpectrum(`${ELEVEN_FOUR}\nstyle:\n  stamp: off`).svg).not.toContain(STAMP_TEXT);
  });
});

describe('renderSpectrum — 書いてあって読めなかったキー', () => {
  const said = (source: string): readonly string[] => renderSpectrum(source).notices.map((one) => one.message);
  const errorCount = (source: string): number => renderSpectrum(source).errors.length;

  test.each([
    ['samples', 'device: ad2\nsweep: 0-20kHz\nsamples: 8000\nwindow: hann\nsignal: sine 1kHz 1V'],
    ['window', 'device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: blackman\nsignal: sine 1kHz 1V'],
    ['points', 'device: tinysa-ultra\nsweep: 0-960M\npoints: 10\nrbw: 300kHz\nsignal: sine 100MHz -10dBm'],
    ['rbw', 'device: tinysa-ultra\nsweep: 0-960M 450\nrbw: 300\nsignal: sine 100MHz -10dBm'],
    ['sweep', 'device: tinysa-ultra\nsweep: 960M-0\npoints: 450\nrbw: 300kHz\nsignal: sine 100MHz -10dBm'],
    ['floor', 'device: generic\nsweep: 0-960M 450\nrbw: 300kHz\nfloor: -100\nsignal: sine 100MHz -10dBm'],
  ])('%s: says it cannot read the value, and does not also say it is missing', (key, source) => {
    expect(errorCount(source)).toBeGreaterThan(0);
    expect(said(source).filter((message) => message.startsWith(`${key}: が無いので`))).toEqual([]);
    if (key === 'floor') expect(said(source).filter((message) => message.includes('floor: で書きます'))).toEqual([]);
  });

  test('still says a default when the key was not written at all', () => {
    const notices = said('device: ad2\nsweep: 0-20kHz\nsignal: sine 1kHz 1V');
    expect(notices).toContain('samples: が無いので 8192 で描いています');
    expect(notices).toContain('window: が無いので flattop で描いています');
    expect(said('device: tinysa-ultra\nsweep: 0-960M\nsignal: sine 100MHz -10dBm').some((message) => message.startsWith('points: が無いので'))).toBe(true);
  });
});

describe('renderSpectrum — 波の周波数の綴り', () => {
  const base = 'device: tinysa-ultra\nsweep: 0-960M 450\nrbw: 300kHz\nmarkers: [100M]\n';

  test('reads signal: 100M the same as 100MHz (the same spelling as sweep: and markers:)', () => {
    const short = renderSpectrum(`${base}signal: square 100M -10dBm`);
    const long = renderSpectrum(`${base}signal: square 100MHz -10dBm`);
    expect(short.errors).toEqual([]);
    expect(short.readingLines).toEqual(long.readingLines);
    expect(short.readings.rows[1]).toEqual(['1', '100.000 MHz', '−7.90 dBm']);
  });

  test('still refuses a bare number', () => {
    expect(renderSpectrum(`${base}signal: sine 100000000 -10dBm`).errors.map((one) => one.message))
      .toEqual(['周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます']);
  });
});

/** 教科書 01-circuits/09-rf/07-am-modulation の図7 (搬送波 −27.1 dBm)。 */
const AM = (ref: string, extra = ''): string => [
  'device: tinysa-ultra', 'center: 686kHz', 'span: 10kHz', 'rbw: 200Hz', 'points: 450', ref,
  'signal:', '  - sine 686kHz -27.1dBm', '  - sine 685kHz -55.1dBm', '  - sine 687kHz -55.1dBm',
  'markers: [peak, 685k, 687k]', extra,
].join('\n');

describe('renderSpectrum — 山と REF', () => {
  const said = (source: string): readonly string[] => renderSpectrum(source).notices.map((one) => one.message);
  const low = (source: string): readonly string[] => said(source).filter((message) => message.includes('目盛下です'));
  const cut = (source: string): readonly string[] => said(source).filter((message) => message.includes('切れています'));

  test('says nothing while the peak sits less than 3 divisions below REF', () => {
    expect(said(AM('ref: -20dBm'))).toEqual([]);
    expect(said(AM('ref: -10dBm'))).toEqual([]);
    expect(said(AM('ref: 0dBm'))).toEqual([]);
  });

  test('says how far down the peak is from 3 divisions, with a ref: to write', () => {
    expect(low(AM('ref: 10dBm'))).toEqual(['一番高い山 (−27.10 dBm、686.000 kHz) は REF (10 dBm) より 3.7 目盛下です (ref: -10dBm なら上端から 1.7 目盛)']);
  });

  test('points at the ref: line (moved to the markdown line)', () => {
    const [one] = renderSpectrum(AM('ref: 10dBm'), { offset: 100 }).notices;
    expect(one?.line).toBe(106);
  });

  test('counts from the instrument REF when ref: is not written', () => {
    const source = 'device: tinysa-ultra\nsweep: 0-50M 450\nrbw: 300kHz\nsignal: sine 10MHz -52.1dBm';
    expect(low(source)).toEqual(['一番高い山 (−52.10 dBm、10.000 MHz) は REF (−10 dBm) より 4.2 目盛下です (ref: -40dBm なら上端から 1.2 目盛)']);
  });

  test('says the peak is cut off above REF', () => {
    const source = 'device: tinysa-ultra\nsweep: 0-50M 450\nrbw: 300kHz\nsignal: sine 10MHz -5dBm';
    expect(cut(source)).toEqual(['一番高い山 (−5.00 dBm、10.000 MHz) は REF (−10 dBm) より上で切れています (ref: 0dBm なら入ります)']);
  });

  test('says the same on an FFT instrument, in dBV', () => {
    const source = 'device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: hann\nsignal: sine 1kHz 10V';
    expect(cut(source)).toEqual(['一番高い山 (16.99 dBV、1.000 kHz) は REF (0 dBV) より上で切れています (ref: 20dBV なら入ります)']);
  });

  test('says nothing without a signal (only the floor is drawn)', () => {
    expect(said('device: ad2\nsweep: 0-20kHz\nsamples: 8192\nwindow: hann\nfloor: -100dBV')).toEqual([]);
    expect(low('device: generic\nsweep: 0-960M 450\nrbw: 300kHz\nfloor: -90dBm')).toEqual([]);
  });

  test('reads the measured peak when data: is there', () => {
    const csv = 'Frequency (Hz),Trace (dBm)\n1000000,-97\n2000000,-62\n3000000,-97';
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 0-5M 101\nrbw: 30kHz\nref: -20dBm\ndata: m.csv', { data: () => csv });
    expect(result.notices.map((one) => one.message)).toEqual(['一番高い山 (−62.00 dBm、2.000 MHz) は REF (−20 dBm) より 4.2 目盛下です (ref: -50dBm なら上端から 1.2 目盛)']);
  });
});

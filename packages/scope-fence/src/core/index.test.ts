import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

describe('renderScope — 段 0', () => {
  test('draws the grid even for an empty fence, and says it is empty', () => {
    const result = renderScope('');
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('data-scope-fence');
    expect(result.svg).toContain('1ms/div');
    expect(result.errors.map((error) => error.message)).toEqual(['scope フェンスが空です (ch1: から書き始めます)']);
    expect(result.errorHtml).toContain('scope-errors');
  });

  test('writes no NaN or Infinity into the drawing', () => {
    for (const source of ['', 'time: 5ms/div', 'title: x', 'foo: 1']) {
      expect(renderScope(source).svg).not.toMatch(/NaN|Infinity/);
    }
  });

  test('uses the time/div it was given on the status row', () => {
    expect(renderScope('time: 200us/div').svg).toContain('200µs/div');
  });

  test('moves line numbers to the markdown lines', () => {
    const [error] = renderScope('foo: 1', { offset: 10 }).errors;
    expect(error?.line).toBe(11);
  });

  test('keeps the title, escaped', () => {
    const { svg } = renderScope('title: <b>図</b>');
    expect(svg).toContain('&lt;b&gt;図');
    expect(svg).not.toContain('<b>');
  });

  test('shows notices only under style: debug (on by default)', () => {
    expect(renderScope('style:\n  debug: off').errorHtml).toBe('');
  });
});

const FIVE_ONE = [
  'title: 図3 RC の充電',
  'time: 1ms/div',
  'trigger: ch1 rising 1V',
  'ch1: square 100Hz 1V offset 1V',
  'ch2: ch1 | rc 1ms',
  'cursors: [0, 1ms]',
  'measure: [vpp, freq]',
].join('\n');

const said = (source: string): readonly string[] => {
  const result = renderScope(source);
  return [...result.errors, ...result.notices].map((error) => error.message);
};

describe('renderScope — 段 1', () => {
  test('draws 5-1: two dashed waves, two cursors and the readings, saying nothing', () => {
    const result = renderScope(FIVE_ONE);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.svg.match(/<polyline /g)).toHaveLength(2);
    expect(result.svg.match(/stroke-dasharray="5 3"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(result.svg.match(/stroke-dasharray="2 2"/g)).toHaveLength(2);
    expect(result.svg).toContain('CH1 500mV/div');
    expect(result.svg).toContain('Trig CH1 ↑ 1.00 V');
    expect(result.readingLines).toEqual([
      '読み値 — 理想 (計算)',
      'CH   Vpp     Freq',
      'CH1  2.00 V  100.0 Hz',
      'CH2  1.97 V  100.0 Hz',
      '    t                     CH1     CH2',
      'X1  0 s                   1.00 V  14.0 mV',
      'X2  1.000 ms              2.00 V  1.27 V',
      'ΔX  1.000 ms (1.000 kHz)  1.00 V  1.26 V',
    ].map((line) => line.trimEnd()));
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  test('keeps each polyline to two points a pixel column', () => {
    const { svg } = renderScope(FIVE_ONE);
    for (const match of svg.matchAll(/points="([^"]+)"/g)) {
      if (!(match[1] ?? '').includes(' ')) continue;
      expect((match[1] ?? '').split(' ').length).toBeLessThanOrEqual(800);
    }
  });

  test('draws 3-4 with the phase of CH2', () => {
    const result = renderScope('time: 200us/div\ntrigger: ch1 rising\nch1: sine 1kHz 0.53V\nch2: sine 1kHz 0.85V phase -58deg\nmeasure: [vpp, phase]');
    expect(result.readingLines).toContain('CH2  1.70 V  -58.0°');
  });

  test('says the defaults it filled in for time: and trigger:', () => {
    expect(said('ch1: square 100Hz 1V')).toEqual([
      'time: が無いので 2ms/div (一番遅い波の 2 周期) で描いています',
      'trigger: が無いので ch1 の立ち上がり (水準は波形の中央) で合わせています',
    ]);
  });

  test('says there is nothing but the grid when no channel is written', () => {
    expect(said('title: x')).toEqual(['ch1: が無いので格子だけ描いています (ch1: sine 1kHz 1V のように書きます)']);
  });

  test('says a trigger level outside the wave, and leaves t = 0 alone', () => {
    expect(said('time: 1ms/div\ntrigger: ch1 rising 5V\nch1: sine 1kHz 1V')).toEqual([
      'トリガ水準 (5.00 V) が ch1 の波形の外なので、t = 0 に合わせていません',
    ]);
    expect(said('time: 1ms/div\ntrigger: ch1 rising\nch1: dc 1V')).toEqual([
      'トリガ水準 (中央) が ch1 の波形の外なので、t = 0 に合わせていません',
    ]);
  });

  test('says a cursor outside the screen and does not draw it', () => {
    const result = renderScope('time: 1ms/div\ntrigger: ch1 rising\nch1: sine 1kHz 1V\ncursors: [0, 20ms]');
    expect(result.notices.map((one) => one.message)).toEqual(['カーソル 20.00 ms は画面の外です (描いていません)']);
    expect(result.svg.match(/stroke-dasharray="2 2"/g)).toHaveLength(1);
  });

  test('says when rc is too short or too long for the screen', () => {
    expect(said('time: 1s/div\ntrigger: ch1 rising\nch1: square 1Hz 1V\nch2: ch1 | rc 1us')).toContain(
      'rc の τ (1.000 µs) が画面の点の間隔 (1.221 ms) より短いので、ほぼ素通しに描いています',
    );
    expect(said('time: 1us/div\ntrigger: ch1 rising\nch1: square 1kHz 1V\nch2: ch1 | rc 1s')).toContain(
      'rc の τ が画面の幅に比べて長いので、定常まで回しきれていません (time: を遅くします)',
    );
  });

  test('uses the range and position that were written', () => {
    const { svg } = renderScope('time: 1ms/div\ntrigger: ch1 rising\nch1: {wave: sine 1kHz 1V, range: 2V/div, position: 1div}');
    expect(svg).toContain('CH1 2V/div');
  });

  test('says data: cannot be read without a reader, or when the file is missing', () => {
    const source = 'time: 1ms/div\ntrigger: ch1 rising\nch1: sine 1kHz 1V\ndata: a.csv';
    expect(renderScope(source).notices.map((one) => one.message)).toEqual(['この宿主では a.csv を読めません (CLI か VS Code の拡張で描くと実測が重なります)']);
    expect(renderScope(source, { data: () => null }).notices.map((one) => one.message)).toEqual(['a.csv が見つかりません (.md と同じ場所に置きます)']);
    expect(renderScope(source, { data: () => { throw new Error('x'); } }).notices[0]?.message).toContain('見つかりません');
  });

  test('renders a four-channel screen within a tenth of a second', () => {
    const source = 'time: 1ms/div\ntrigger: ch1 rising\nch1: square 100Hz 1V\nch2: ch1 | rc 1ms\nch3: ch2 | rc 1ms\nch4: ch3 | abs | rc 2ms';
    renderScope(source);
    const start = performance.now();
    renderScope(`${source}\n`);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

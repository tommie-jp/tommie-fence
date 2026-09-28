import { describe, expect, test } from 'vitest';
import { renderScope, STAMP_TEXT } from './index.ts';

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
      '助走 (rc / hp / peak の τ・lc の減衰・delay・integrate の 1 周期) が画面の幅に比べて長いので、定常まで回しきれていません (time: を遅くします)',
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

// 刻印は既定で付く (5 つのフェンスと同じ)。書き手が消せるのは `stamp: off` だけ (字は書かせない)。
describe('renderScope — 刻印', () => {
  test('stamps the version at the bottom right without being asked', () => {
    expect(renderScope(FIVE_ONE).svg).toContain(`>${STAMP_TEXT}</text>`);
  });

  test('leaves the stamp out when told stamp: off', () => {
    expect(renderScope(`${FIVE_ONE}\nstyle:\n  stamp: off`).svg).not.toContain(STAMP_TEXT);
  });
});

// 読みにくい尺度を数で言う (range: / position: を手で書いたときだけ。Auto は入る尺度を選ぶ)。
const RC_SCREEN = (ch2: string, ch1 = 'range: 1V/div, position: -3div'): string => [
  'time: 200us/div',
  'trigger: ch1 rising 2.5V',
  `ch1: {wave: square 1kHz 2.5V offset 2.5V, ${ch1}}`,
  `ch2: {wave: ch1 | rc 1ms, ${ch2}}`,
  'measure: [vpp, vmax, vmin, avg]',
].join('\n');

describe('renderScope — 読みにくい尺度', () => {
  test('says a channel whose swing is under 2 divisions, with the range and position that fix it', () => {
    // CH1 は別の尺度 (2V/div) なので、CH2 には同じ尺度で比べる相手がいない。
    const result = renderScope(RC_SCREEN('range: 1V/div, position: -3div', 'range: 2V/div, position: -1.5div'), { offset: 10 });
    expect(result.notices.map((one) => [one.message, one.line])).toEqual([
      ['CH2 の振れは 1.2 目盛です (range: 200mV/div と position: -12.5div なら 6.1 目盛で中央に来ます)', 14],
    ]);
    expect(result.errors).toEqual([]);
  });

  test('says nothing of a small channel laid on the same scale as a channel that swings 2 divisions or more', () => {
    // 平滑後を入力と同じ尺度に重ねて、小さいことを見せる図 (比べる 2 本は同じ尺度)。
    expect(said(RC_SCREEN('range: 1V/div, position: -3div'))).toEqual([]);
    for (const time of ['500us/div', '1ms/div']) {
      expect(said(RC_SCREEN('range: 1V/div, position: -3div').replace('200us/div', time))).toEqual([]);
    }
  });

  test('still says a small channel whose same-scale partner is small too, or that is alone', () => {
    const pair = [
      'time: 5ms/div',
      'trigger: ch1 rising',
      'ch1: {wave: sine 100Hz 0.3V, range: 1V/div, position: 0div}',
      'ch2: {wave: ch1 | gain 0.5, range: 1V/div, position: 0div}',
    ].join('\n');
    expect(said(pair)).toEqual([
      'CH1 の振れは 0.6 目盛です (range: 100mV/div と position: 0div なら 6.0 目盛で中央に来ます)',
      'CH2 の振れは 0.3 目盛です (range: 50mV/div と position: 0div なら 6.0 目盛で中央に来ます)',
    ]);
    expect(said('time: 5ms/div\ntrigger: ch1 rising\nch1: {wave: sine 100Hz 0.3V, range: 1V/div}')).toEqual([
      'CH1 の振れは 0.6 目盛です (range: 100mV/div なら 6.0 目盛になります)',
    ]);
  });

  test('still says a small channel whose partner shares the range but not the position', () => {
    expect(said(RC_SCREEN('range: 1V/div, position: -2div'))).toEqual([
      'CH2 の振れは 1.2 目盛です (range: 200mV/div と position: -12.5div なら 6.1 目盛で中央に来ます)',
    ]);
  });

  test('says nothing from 2 divisions up, or when the range is left to Auto', () => {
    expect(said(RC_SCREEN('range: 500mV/div, position: -4div'))).toEqual([]);
    expect(said(RC_SCREEN('range: 200mV/div, position: -12.5div'))).toEqual([]);
    expect(said(RC_SCREEN('position: -3div'))).toEqual([]);
  });

  test('says how far a wave runs off the screen, and how to bring it back', () => {
    expect(said('time: 1ms/div\ntrigger: ch1 rising\nch1: {wave: square 1kHz 2.5V offset 2.5V, range: 1V/div, position: 0div}')).toEqual([
      'CH1 は画面の上に 1.0 目盛はみ出しています (position: -2.5div なら入ります)',
    ]);
  });

  test('judges a channel by its measured points when data: has them', () => {
    // 理想は 0〜2 V (1V/div で 2 目盛) だが、実測は 0〜0.5 V しか振れていない。
    const csv = ['Time (s),Channel 1 (V)', ...Array.from({ length: 101 }, (_, index) =>
      `${((index - 50) * 1e-4).toExponential(3)},${index % 2 === 0 ? 0 : 0.5}`)].join('\n');
    const source = 'time: 1ms/div\ntrigger: ch1 rising\nch1: {wave: square 1kHz 1V offset 1V, range: 1V/div, position: 0div}\ndata: a.csv';
    expect(renderScope(source, { data: () => csv }).notices.map((one) => one.message)).toEqual([
      'CH1 の振れは 0.5 目盛です (range: 100mV/div と position: -2.5div なら 5.0 目盛で中央に来ます)',
    ]);
  });
});

describe('renderScope — 基準の印', () => {
  test('draws one ▶ a channel, side by side, when two channels share a baseline', () => {
    const { svg } = renderScope(RC_SCREEN('range: 1V/div, position: -3div'));
    const triangles = [...svg.matchAll(/<polygon points="([\d.]+),[\d.]+ ([\d.]+),([\d.]+) /g)]
      .filter((match) => Number(match[2]) < 60);
    expect(triangles).toHaveLength(2);
    const [first, second] = triangles.map((match) => Number(match[2]));
    expect(Math.abs((first ?? 0) - (second ?? 0))).toBeGreaterThan(12);
    expect(new Set(triangles.map((match) => match[3])).size).toBe(1);
  });

  test('keeps a single ▶ for a channel whose baseline is a quarter division or more away', () => {
    const { svg } = renderScope(RC_SCREEN('range: 1V/div, position: -2.75div'));
    const tips = [...svg.matchAll(/<polygon points="[\d.]+,[\d.]+ ([\d.]+),/g)].map((match) => Number(match[1])).filter((x) => x < 60);
    expect(new Set(tips).size).toBe(1);
    expect(tips).toHaveLength(2);
  });
});

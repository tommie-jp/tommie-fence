import { readFileSync } from 'node:fs';
import { extractFences } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { KINDS } from './kinds.ts';
import { render } from './fences.ts';

/**
 * 描画そのものは各パッケージのテストが覆っている。ここで確かめるのは
 * **3 つを同じ形で返せているか** (画面はこの形だけを見て組み立てる)。
 */
describe('render', () => {
  test('breadboard は図とネットリストを返す', () => {
    // Arrange
    const source = 'board: half\nparts:\n  R1: resistor a5 a10 330\n';

    // Act
    const output = render('breadboard', source);

    // Assert
    expect(output.svg).toMatch(/^<svg /);
    expect(output.tex).toBeNull();
    expect(output.netlist.map((net) => net.refs)).toEqual([['R1.1'], ['R1.2']]);
    expect(output.broken).toBe(false);
  });

  test('perfboard も同じ形で返す', () => {
    const output = render('perfboard', 'board: 12x7\nparts:\n  R1: resistor b2 b6 10k\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.tex).toBeNull();
    expect(output.broken).toBe(false);
  });

  test('scope は図を返し、ネットリストを持たない', () => {
    const output = render('scope', 'time: 1ms/div\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.netlist).toEqual([]);
    expect(output.broken).toBe(false);
    expect(render('scope', 'time: 1ms\n').messages.join('\n')).toContain('scope: 1 行目');
  });

  test('spectrum は図を返し、ネットリストを持たない', () => {
    const output = render('spectrum', 'device: tinysa-ultra\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.netlist).toEqual([]);
    expect(output.broken).toBe(false);
    expect(render('spectrum', 'device: ultra\n').messages.join('\n')).toContain('spectrum: 1 行目');
  });

  test('graph は図と読み値を返し、ネットリストを持たない', () => {
    const output = render('graph', 'x: 周波数 Hz log 100..100k\nlines:\n  利得 dB: 20*log10(1/sqrt(1+(x/1.59k)^2))\nnotes:\n  - mark 1.59k\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.netlist).toEqual([]);
    expect(output.broken).toBe(false);
    expect(output.readings.join('\n')).toContain('−3.01 dB');
    expect(render('graph', 'x: 周波数 Hz 2k-32k\n').messages.join('\n')).toContain('graph: 1 行目');
  });

  test('logic は図と読み値を返し、ネットリストを持たない', () => {
    const output = render('logic', 'device: ad3\ntime: 1s/div\nsignals:\n  CLK: clock 1Hz\ncursors: [0.25s]\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.netlist).toEqual([]);
    expect(output.broken).toBe(false);
    expect(output.readings.join('\n')).toContain('CLK');
    expect(render('logic', 'device: ad3\ntime: 1s\n').messages.join('\n')).toContain('logic: 2 行目');
  });

  test('vna は図と読み値を返し、data: は読めないと言う (頁は隣のファイルに届かない)', () => {
    const output = render('vna', 'sweep: 1M-300M\ndut: series R 100\ndata: a.s2p\nmarkers:\n  - 10M\n');

    expect(output.svg).toMatch(/^<svg /);
    expect(output.netlist).toEqual([]);
    expect(output.readings[0]).toBe('読み値 — 理想 (dut: の模型)');
    expect(output.messages.join('\n')).toContain('この宿主では a.s2p を読めません');
    expect(output.broken).toBe(false);
  });

  test('circuit は図の代わりに TeX を返す (ブラウザでは描けない)', () => {
    const output = render('circuit', 'parts:\n  R1: resistor a1 a2 10k\n');

    expect(output.svg).toBe('');
    expect(output.tex).toContain('circuitikz');
    expect(output.broken).toBe(false);
  });

  test('読めなかった行は CLI と同じ文面で返る (行番号・行の中身・印)', () => {
    const output = render('breadboard', 'board: half\nparts:\n  R1: resistr a5 a10\n');

    expect(output.broken).toBe(true);
    expect(output.messages[0]).toContain('3 行目');
    expect(output.messages[0]).toContain('R1: resistr a5 a10');
    expect(output.messages[0]).toContain('^^^^^^^');
  });

  test('circuit の報告も行の中身まで付く', () => {
    const output = render('circuit', 'parts:\n  R1: resistr a1 a2\n');

    expect(output.broken).toBe(true);
    expect(output.messages[0]).toContain('2 行目');
    expect(output.messages[0]).toContain('R1: resistr a1 a2');
  });
});

/** 各パッケージの例から、フェンス 1 本と隣のデータを取り出す (本物の `data:` を通す)。 */
const exampleOf = (pkg: string, name: string, kind: string): string => {
  const markdown = readFileSync(new URL(`../../${pkg}/examples/${name}`, import.meta.url), 'utf8');
  return extractFences(markdown, kind)
    .map((fence) => fence.source)
    .find((source) => /^data:/m.test(source)) ?? '';
};

const sideOf = (pkg: string, name: string): string =>
  readFileSync(new URL(`../../${pkg}/examples/${name}`, import.meta.url), 'utf8');

describe('data: の添付', () => {
  test('読み口を渡さなければ「この宿主では読めません」と言う', () => {
    const source = exampleOf('graph-fence', '00-resonance.md', 'graph');

    expect(render('graph', source).messages.join('\n')).toContain('この宿主では 00-resonance.csv を読めません');
  });

  test('読み口で名前から中身を返すと、実測が重なる', () => {
    const source = exampleOf('graph-fence', '00-resonance.md', 'graph');
    const csv = sideOf('graph-fence', '00-resonance.csv');

    const output = render('graph', source, (name) => (name === '00-resonance.csv' ? csv : null));

    expect(output.messages.join('\n')).not.toContain('この宿主では');
    expect(output.readings.join('\n')).toContain('実測 (00-resonance.csv)');
  });

  test.each([
    ['scope-fence', '00-rc-charging.md', 'scope', '00-rc-charging-ch.csv'],
    ['spectrum-fence', '05-antenna.md', 'spectrum', '05-antenna-fm.csv'],
    ['vna-fence', '00-series.md', 'vna', '00-series-100.s2p'],
  ] as const)('%s にも読み口が届く', (pkg, doc, kind, wanted) => {
    const asked: string[] = [];

    render(kind, exampleOf(pkg, doc, kind), (name) => { asked.push(name); return null; });

    expect(asked).toContain(wanted);
  });

  test('全部の種類が render を通る', () => {
    for (const kind of KINDS) {
      expect(() => render(kind, '')).not.toThrow();
    }
  });
});

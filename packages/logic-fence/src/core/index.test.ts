import { describe, expect, test } from 'vitest';
import { renderLogic } from './index.ts';
import { VERSION } from './version.ts';

/** 本文の 10-20: 74HC163 のアドレスが 1 s ごとに 0 1 2 3 4 5 3 4 5 3。 */
const COUNTER = `title: 図01 74HC163 のアドレス
device: ad3
time: 1s/div
sample: 1kHz
signals:
  CLK: dio0 clock 1Hz
  A: dio1..dio4 counter on CLK rising sequence 0 1 2 3 4 5 3 4 5 3
buses:
  Address: A3..A0 hex
cursors: [4.5s, 5.5s]
trigger: CLK rising at 0s
`;

const said = (source: string): string[] => {
  const { errors, notices } = renderLogic(source);
  return [...errors, ...notices].map((error) => error.message);
};

const HEAD = 'device: ad3\ntime: 1s/div\n';

describe('the 10-20 example (74HC163 counting 0 1 2 3 4 5 3 4 5 3)', () => {
  const result = renderLogic(COUNTER);

  test('says nothing', () => {
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
  });

  test('gives the value of the bus at every second', () => {
    const line = result.readingLines.find((text) => text.startsWith('Address (hex):'));
    expect(line).toBe('Address (hex): 0x0@0 s 0x1@1 s 0x2@2 s 0x3@3 s 0x4@4 s 0x5@5 s 0x3@6 s 0x4@7 s 0x5@8 s 0x3@9 s');
  });

  test('reads the bus at both cursors in hex, and the lanes at the same time', () => {
    const rows = result.readings.rows;
    expect(rows[0]).toEqual(['信号', 'X1 4.500 s', 'X2 5.500 s']);
    expect(rows.find((row) => row[0] === 'Address')).toEqual(['Address', '0x4', '0x5']);
    // 4.5 s はカウンタ 4 (0b0100)。A2 だけが 1
    expect(rows.filter((row) => /^A\d$/.test(row[0] ?? '')).map((row) => row[1])).toEqual(['0', '0', '1', '0']);
    // 変わり目ちょうど (CLK は 4.5 s で立ち下がる) は新しい値
    expect(rows.find((row) => row[0] === 'CLK')).toEqual(['CLK', '0', '0']);
  });

  test('gives the delta of the cursors and its frequency', () => {
    expect(result.readings.rows.at(-1)).toEqual(['ΔX', '1.000 s', '1/ΔX 1.000 Hz']);
  });

  test('draws the lanes A0..A3, the bus and the marks', () => {
    for (const name of ['CLK', 'A0', 'A3', 'Address']) expect(result.svg).toContain(`>${name}</text>`);
    expect(result.svg).toContain('>X1</text>');
    expect(result.svg).toContain('>X2</text>');
    expect(result.svg).toContain('>T</text>');
    expect(result.svg).toContain('>0x5</text>');
  });
});

describe('the drawing', () => {
  test('is a self-contained svg carrying the version, with no NaN or Infinity', () => {
    const { svg } = renderLogic(COUNTER);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`data-logic-fence="${VERSION}"`);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('href');
  });

  test('stamps the version unless style: stamp: off', () => {
    expect(renderLogic(COUNTER).svg).toContain(`logic-fence ${VERSION}`);
    expect(renderLogic(`${COUNTER}style:\n  stamp: off\n`).svg).not.toContain(`logic-fence ${VERSION}`);
  });

  test('draws the grid even when the fence is empty or unreadable', () => {
    for (const source of ['', 'device: ad3', 'foo: [', '- a']) {
      const { svg } = renderLogic(source);
      expect(svg).toContain('<rect');
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });

  test('escapes the title and the lane names', () => {
    const { svg } = renderLogic(`title: <img src=x onerror=alert(1)>\n${HEAD}signals:\n  A: high\n`);
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img');
  });

  test('gives the same drawing for the same fence', () => {
    expect(renderLogic(COUNTER).svg).toBe(renderLogic(COUNTER).svg);
  });

  test('changes only the colours with the theme', () => {
    const light = renderLogic(COUNTER).svg;
    const dark = renderLogic(`${COUNTER}style: dark\n`).svg;
    expect(dark).toContain('#1b1d21');
    const shape = (svg: string): string => svg.replace(/<rect x="0" y="0"[^>]*\/>/, '').replace(/#[0-9a-f]{6}/gi, '#');
    expect(shape(dark)).toEqual(shape(light));
  });

  test('scales to style: width', () => {
    expect(renderLogic(`${COUNTER}style:\n  width: 400\n`).svg).toMatch(/width="400"/);
  });
});

describe('lanes and buses', () => {
  test('an explicit edges lane and a pulse read at the cursors', () => {
    const { readings } = renderLogic(`${HEAD}signals:
  A: edges 0s=0 1.5s=1 3s=0
  P: pulse 2s 500ms
cursors: [1s, 2.2s]
`);
    expect(readings.rows.find((row) => row[0] === 'A')).toEqual(['A', '0', '1']);
    expect(readings.rows.find((row) => row[0] === 'P')).toEqual(['P', '0', '1']);
  });

  test('a bus without a counter follows its member lanes (also when they change together)', () => {
    const { readingLines, errors } = renderLogic(`${HEAD}signals:
  D0: edges 0s=0 2s=1
  D1: edges 0s=0 2s=1
  D2: edges 0s=0 5s=1
buses:
  Data: D2 D1 D0 bin
`);
    expect(errors).toEqual([]);
    expect(readingLines.find((line) => line.startsWith('Data'))).toBe('Data (bin): 0b000@0 s 0b011@2 s 0b111@5 s');
  });

  test('writes a bus in the radix asked for', () => {
    const value = (radix: string): string | undefined => {
      const { readings } = renderLogic(`${HEAD}signals:
  B0: high
  B1: high
  B2: high
  B3: low
buses:
  V: B3 B2 B1 B0 ${radix}
cursors: [1s]
`);
      return readings.rows.find((row) => row[0] === 'V')?.[1];
    };
    expect([value('hex'), value('bin'), value('dec'), value('sint')]).toEqual(['0x7', '0b0111', '7', '7']);
  });

  test('reads a sint bus with the top bit set as negative', () => {
    const { readings } = renderLogic(`${HEAD}signals:
  B0: low
  B1: high
  B2: high
  B3: high
buses:
  V: B3..B0 sint
cursors: [1s]
`);
    expect(readings.rows.find((row) => row[0] === 'V')?.[1]).toBe('-2');
  });

  test('decodes a uart byte into a row and reads it at the cursor', () => {
    const { readings, errors, readingLines } = renderLogic(`device: generic
time: 2ms/div
signals:
  TXD: pattern 100001001011 bit 1ms
decode:
  Serial: uart TXD baud 1000 8N1 ascii
cursors: [5ms]
`);
    expect(errors).toEqual([]);
    expect(readings.rows.find((row) => row[0] === 'Serial')).toEqual(['Serial', "'H'"]);
    expect(readingLines.filter((line) => line.startsWith('Serial'))).toContain("Serial (uart 1000 8N1): 'H'@1 ms");
  });
});

describe('errors', () => {
  test('says which lane a bus is missing and what exists', () => {
    const messages = said(`${HEAD}signals:\n  A: high\nbuses:\n  X: A B hex\n`);
    expect(messages.join()).toContain('レーン B がありません');
    expect(messages.join()).toContain('A');
  });

  test('refuses a bus of more than 16 bits', () => {
    const lanes = Array.from({ length: 17 }, (_, index) => `  L${index}: high`).join('\n');
    expect(said(`device: generic\ntime: 1s/div\nsignals:\n${lanes}\nbuses:\n  X: L16..L0 hex\n`).join()).toContain('16 ビットまで');
  });

  test('refuses more lanes than the device has (AD3 has 16)', () => {
    const lanes = Array.from({ length: 17 }, (_, index) => `  L${index}: high`).join('\n');
    expect(said(`${HEAD}signals:\n${lanes}\n`).join()).toContain('16 本まで');
    expect(said(`device: generic\ntime: 1s/div\nsignals:\n${lanes}\n`)).toEqual([]);
  });

  test('refuses a dio outside the device and a dio used twice', () => {
    expect(said(`${HEAD}signals:\n  A: dio16 high\n`).join()).toContain('dio16 は使えません');
    expect(said(`${HEAD}signals:\n  A: dio3 high\n  B: dio3 low\n`).join()).toContain('dio3 は A が使っています');
  });

  test('refuses a name written twice', () => {
    expect(said(`${HEAD}signals:\n  A: high\n  A: low\n`).join()).toContain('名前 A が重なって');
  });

  test('refuses a counter without a source lane, a width, or values that fit', () => {
    expect(said(`${HEAD}signals:\n  A: bits 3\n`).join()).toContain('知らない種類');
    expect(said(`${HEAD}signals:\n  A: dio1..dio2 counter on NOPE rising\n`).join()).toContain('NOPE がありません');
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\n  A: counter on CLK rising\n`).join()).toContain('幅を書きます');
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\n  A: dio1..dio2 counter on CLK rising sequence 0 1 4\n`).join()).toContain('入りません');
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\n  A: dio1..dio2 counter bits 3 on CLK rising\n`).join()).toContain('合いません');
  });

  test('refuses a range of dio on anything but a counter', () => {
    expect(said(`${HEAD}signals:\n  A: dio1..dio2 clock 1Hz\n`).join()).toContain('counter だけ');
  });

  test('the counter source must come before it', () => {
    expect(said(`${HEAD}signals:\n  A: dio1..dio2 counter on CLK rising\n  CLK: clock 1Hz\n`).join()).toContain('CLK がありません');
  });

  test('a decode of a lane that is not there', () => {
    expect(said(`${HEAD}signals:\n  A: high\ndecode:\n  S: uart NOPE baud 9600 8N1\n`).join()).toContain('NOPE がありません');
  });

  test('a trigger of a lane that is not there (a bus cannot be triggered on)', () => {
    expect(said(`${HEAD}signals:\n  A: clock 1Hz\ntrigger: Q rising\n`).join()).toContain('Q がありません');
  });
});

describe('notices', () => {
  test('a trigger where the lane has no such edge, and the nearest one', () => {
    const messages = said(`${HEAD}signals:\n  CLK: clock 1Hz\ntrigger: CLK rising at 0.3s\n`);
    expect(messages.join()).toContain('CLK の立ち上がりは 300.0 ms にありません');
    expect(messages.join()).toContain('いちばん近いのは');
  });

  test('a trigger on a falling edge that exists is fine, and one on a rising edge of a falling-only time is not', () => {
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\ntrigger: CLK falling at 0.5s\n`)).toEqual([]);
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\ntrigger: CLK rising at 0.5s\n`).join()).toContain('立ち上がりは');
  });

  test('a trigger without at takes the first such edge in the window', () => {
    const { svg, notices } = renderLogic(`${HEAD}signals:\n  CLK: clock 1Hz\ntrigger: CLK falling\n`);
    expect(notices).toEqual([]);
    expect(svg).toContain('>T</text>');
  });

  test('a trigger outside the window, and a trigger with no such edge', () => {
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\ntrigger: CLK rising at 20s\n`).join()).toContain('窓');
    expect(said(`${HEAD}signals:\n  A: high\ntrigger: A rising\n`).join()).toContain('立ち上がりがありません');
  });

  test('a cursor outside the window is said and not drawn', () => {
    const { svg, notices, readings } = renderLogic(`${HEAD}signals:\n  A: high\ncursors: [15s]\n`);
    expect(notices.map((notice) => notice.message).join()).toContain('カーソル X1');
    expect(svg).not.toContain('>X1</text>');
    expect(readings.rows).toEqual([]);
  });

  test('a sample rate above the device, and a window that does not fit the buffer', () => {
    expect(said(`${HEAD}sample: 200MHz\nsignals:\n  A: high\n`).join()).toContain('125.0 MHz までです');
    const buffer = said(`${HEAD}sample: 100kHz\nsignals:\n  A: high\n`).join();
    expect(buffer).toContain('バッファ (32768)');
    expect(buffer).toContain('Record');
  });

  test('a generic device checks neither', () => {
    expect(said('device: generic\ntime: 1s/div\nsample: 1GHz\nsignals:\n  A: high\n')).toEqual([]);
  });

  test('a stretch shorter than two samples', () => {
    // 1 s/div の 3 px は 50 ms。100 ms の幅は線で描けるが、10 Hz の標本 (100 ms) の 2 つ分には足りない。
    const messages = said(`${HEAD}sample: 10Hz\nsignals:\n  P: pulse 2s 100ms\n`);
    expect(messages.join()).toContain('2 標本より短く');
    expect(said(`${HEAD}sample: 20Hz\nsignals:\n  P: pulse 2s 100ms\n`)).toEqual([]);
  });

  test('a clock too fast for the window is drawn as a band and said so', () => {
    const { svg, notices, readingLines } = renderLogic(`${HEAD}signals:\n  FAST: clock 1kHz\n`);
    expect(notices[0]?.message).toContain('3 px より近く');
    expect(svg).toContain('fill-opacity="0.3"');
    expect(readingLines.join()).toContain('密');
  });

  test('a clock at 3 px or more per edge is drawn as a line', () => {
    // 0.5 s/div、周期 0.5 s → 半周期が 1 目盛 (60 px)
    expect(said('device: ad3\ntime: 500ms/div\nsignals:\n  C: clock 1Hz\n')).toEqual([]);
  });

  test('a dense lane makes the bus dense', () => {
    const { svg, readingLines } = renderLogic(`${HEAD}signals:\n  D0: clock 5kHz\n  D1: clock 1Hz\nbuses:\n  X: D1 D0 hex\n`);
    expect(readingLines.find((line) => line.startsWith('X'))).toContain('密');
    expect(svg).not.toContain('>0x');
  });

  test('sequence shorter than the edges in the window is said', () => {
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\n  A: dio1..dio2 counter on CLK rising sequence 0 1 2\n`).join()).toContain('最後の値を保ちます');
    expect(said(`${HEAD}signals:\n  CLK: clock 1Hz\n  A: dio1..dio2 counter on CLK rising sequence 0 1 2 repeat\n`)).toEqual([]);
  });

  test('a bus with a stretch shorter than 3 px is said', () => {
    const messages = said(`device: generic\ntime: 1s/div\nsignals:\n  D0: edges 0s=0 2s=1\n  D1: edges 0s=0 2.02s=1\nbuses:\n  X: D1 D0 hex\n`);
    expect(messages.join()).toContain('3 px より短い値の区間');
  });

  test('keeps notices out of the band under style: debug: off', () => {
    const source = `device: ad3\ntime: 1us/div\nsample: 200MHz\nsignals:\n  A: high\nstyle:\n  debug: off\n`;
    const result = renderLogic(source);
    expect(result.notices).toHaveLength(1);
    expect(result.errorHtml).toBe('');
  });
});

describe('limits', () => {
  test('a window out of range is refused and the grid is drawn with the placeholder window (no NaN)', () => {
    for (const source of [
      'device: ad3\ntime: 1000000000s/div\nsignals:\n  A: clock 1Hz\ncursors: [1s]\n',
      'device: ad3\ntime: 1ps/div\nsignals:\n  A: high\n',
      `device: ad3\ntime: 1s/div\nstart: 1${'0'.repeat(300)}s\nsignals:\n  A: clock 1Hz\n`,
    ]) {
      const { svg, errors } = renderLogic(source);
      expect(errors.length, source).toBeGreaterThan(0);
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });

  test('a lane with thousands of edges reads at the cursors quickly and is drawn as a band', () => {
    const pairs = Array.from({ length: 4000 }, (_, index) => `${index}ms=${index % 2}`).join(' ');
    const started = Date.now();
    const { readings, notices } = renderLogic(`device: generic\ntime: 1s/div\nsignals:\n  D0: edges ${pairs}\n  D1: edges ${pairs}\nbuses:\n  X: D1 D0 bin\ncursors: [1.5015s]\n`);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(readings.rows.find((row) => row[0] === 'X')?.[1]).toBe('0b11');
    expect(notices.length).toBeGreaterThan(0);
  });

  test('a clock too fast to count cannot feed a counter', () => {
    expect(said('device: generic\ntime: 1s/div\nsignals:\n  CLK: clock 1GHz\n  Q: counter bits 4 on CLK rising\n').join()).toContain('edge が多すぎて数えられません');
  });
});

describe('reporting', () => {
  test('gives lines of the markdown when an offset is given', () => {
    const { errors } = renderLogic(`${HEAD}signals:\n  A: dio0 sqare 1Hz\n`, { offset: 10 });
    expect(errors[0]?.line).toBe(14);
    expect(errors[0]?.text).toContain('sqare');
  });

  test('puts the errors of a broken fence in the band, not in the svg', () => {
    const { svg, errorHtml } = renderLogic(`${HEAD}signals:\n  A: dio0 sqare 1Hz\n`);
    expect(errorHtml).toContain('logic-error-item');
    expect(svg).not.toContain('sqare');
  });
});

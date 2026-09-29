import { describe, expect, test } from 'vitest';
import { renderLogic } from './index.ts';
import { parseFence } from './parser/parseFence.ts';
import { parseStyle } from './parser/style.ts';

const said = (source: string): string[] => {
  const { errors, notices } = renderLogic(source);
  return [...errors, ...notices].map((error) => error.message);
};

describe('quoted YAML scalars', () => {
  test('window, a signal line and cursors read the same with or without quotes', () => {
    const { doc, errors } = parseFence('device: ad3\nwindow: "10s"\nsample: \'1kHz\'\nsignals:\n  CLK: "dio0 clock 1Hz"\n  B: \'high\'\nbuses:\n  X: "CLK B hex"\ncursors: ["1s", \'2s\']\ntrigger: "CLK rising at 0s"\n');
    expect(errors).toEqual([]);
    expect(doc.time?.value.perDiv).toBe(1);
    expect(doc.sample?.value).toBe(1000);
    expect(doc.signals.map((entry) => entry.name)).toEqual(['CLK', 'B']);
    expect(doc.buses[0]?.bits).toEqual(['CLK', 'B']);
    expect(doc.cursors.map((cursor) => cursor.time)).toEqual([1, 2]);
    expect(doc.trigger?.at).toBe(0);
  });

  test('cursors written as a bare string ask for a list', () => {
    const messages = parseFence('device: ad3\ntime: 1s/div\ncursors: 1s 2s\n').errors.map((error) => error.message).join();
    expect(messages).toContain('リスト');
  });
});

describe('uart frame that starts before the window', () => {
  const source = (bits: string, perDiv = '2ms'): string => `device: generic\ntime: ${perDiv}/div\nsignals:\n  T: pattern ${bits} bit 1ms\ndecode:\n  S: uart T baud 1000 8N1 hex\ncursors: [15ms]\n`;

  test('does not take a data edge as a start bit', () => {
    // 窓の左端で線が low (スタートビットの途中)。0 の後ろの 10000010 はデータで、頭の 0 は窓より前から始まったフレーム。
    const { readingLines, notices } = renderLogic(source('0_10000010_1_11'));
    expect(readingLines.join('\n')).not.toContain('0xD0');
    expect(notices.map((notice) => notice.message).join()).toContain('窓より前');
  });

  test('still reads a frame that starts after the line has been idle for a frame', () => {
    const { readingLines } = renderLogic(source('0_10000010_1_1111111111_0_00010010_1_11', '4ms'));
    expect(readingLines.join('\n')).toContain('0x48');
  });
});

describe('counter far from t = 0', () => {
  const far = 'device: generic\nwindow: 1ms\nstart: 100000s\nsignals:\n  CLK: clock 1kHz\n  Q: counter bits 4 on CLK rising start 3\ncursors: [100000.0005s]\n';

  test('counts by period arithmetic instead of from t = 0', () => {
    const result = renderLogic(far);
    expect(result.errors).toEqual([]);
    // 100000 s × 1 kHz: 立ち上がりは t = 0 から 1e8 + 1 回目 (index 1e8) が窓の左端。値 = (3 + 1e8) mod 16 = 3。
    const bits = result.readings.rows.filter((row) => /^Q\d$/.test(row[0] ?? '')).map((row) => Number(row[1]));
    expect(bits.reduce((sum, bit, index) => sum + bit * 2 ** index, 0)).toBe((3 + 1e8) % 16);
  });

  test('a counter cannot count the output of another counter far from 0', () => {
    expect(said('device: generic\nwindow: 1ms\nstart: 100s\nsignals:\n  CLK: clock 1kHz\n  Q: counter bits 2 on CLK rising\n  R: counter bits 2 on Q0 rising\n').join()).toContain('数えられません');
  });
});

describe('small fixes', () => {
  test('style: stamp: constructor is refused, not accepted as a flag', () => {
    expect(parseStyle({ stamp: 'constructor' }, 1).errors).toHaveLength(1);
  });

  test('a very long word in a bus is refused quickly', () => {
    const started = Date.now();
    const messages = said(`device: ad3\ntime: 1s/div\nbuses:\n  X: ${'a'.repeat(30000)}9 hex\n`).join();
    expect(Date.now() - started).toBeLessThan(500);
    expect(messages).toContain('長すぎ');
  });

  test('an edge at the right end of the window does not make a zero-width bus segment', () => {
    const { readingLines } = renderLogic('device: ad3\ntime: 1s/div\nsignals:\n  D: edges 0s=0 10s=1\nbuses:\n  X: D hex\n');
    expect(readingLines.find((line) => line.startsWith('X (hex)'))).toBe('X (hex): 0x0@0 s');
  });

  test('repeat on a counter without sequence is refused', () => {
    expect(said('device: ad3\ntime: 1s/div\nsignals:\n  CLK: clock 1Hz\n  Q: counter bits 2 on CLK rising repeat\n').join()).toContain('repeat は sequence');
  });

  test('a name used by a lane and a bus or a decode row is reported', () => {
    const messages = said('device: ad3\ntime: 2ms/div\nsignals:\n  A: high\n  B: high\nbuses:\n  A: A B hex\ndecode:\n  B: uart A baud 1000 8N1\n').join();
    expect(messages).toContain('名前 A が重なって');
    expect(messages).toContain('名前 B が重なって');
  });
});

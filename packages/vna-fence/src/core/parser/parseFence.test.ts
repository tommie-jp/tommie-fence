import { describe, expect, test } from 'vitest';
import { DEFAULT_TRACES, parseFence } from './parseFence.ts';

const read = (lines: readonly string[]) => parseFence(lines.join('\n'));
const messages = (lines: readonly string[]): string[] => read(lines).errors.map((error) => error.message);

describe('parseFence', () => {
  test('reads a whole fence', () => {
    const { doc, errors } = read([
      'device: v2',
      'sweep: 1M-300M 201',
      'title: 図1',
      'dut:',
      '  - shunt C 47p',
      '  - series L 100n',
      'data: 3-1.s2p',
      'traces:',
      '  - S21 logmag',
      'markers:',
      '  - 10M',
      'notes:',
      '  - mark 10M -6dB',
      '  - text 10M -6dB: 字',
      'style: dark',
    ]);
    expect(errors).toEqual([]);
    expect(doc.device).toBe('v2');
    expect(doc.sweep).toEqual({ start: 1e6, stop: 300e6, points: 201 });
    expect(doc.title).toBe('図1');
    expect(doc.dut).toHaveLength(2);
    expect(doc.dut[1]?.line).toBe(6);
    expect(doc.data).toEqual({ name: '3-1.s2p', line: 7 });
    expect(doc.traces).toEqual([{ param: 'S21', format: 'logmag', vf: null, line: 9 }]);
    expect(doc.markers).toEqual([{ f: 10e6, line: 11 }]);
    expect(doc.notes.map((note) => note.kind)).toEqual(['mark', 'text']);
    expect(doc.style.theme).toBe('dark');
  });

  test('takes a single dut element on one line', () => {
    expect(read(['sweep: 1M-2M', 'dut: series R 100']).doc.dut).toHaveLength(1);
  });

  test('an empty fence still gives a document', () => {
    const result = parseFence('');
    expect(result.doc.traces).toBe(DEFAULT_TRACES);
    expect(result.errors[0]?.message).toContain('空です');
  });

  test('a missing sweep falls back to the device range, and says so', () => {
    const result = read(['device: v2', 'dut: series R 1']);
    expect(result.doc.sweep.stop).toBe(3e9);
    expect(result.errors[0]).toMatchObject({ notice: true });
    expect(result.errors[0]?.message).toContain('機種の範囲');
  });

  test.each([
    [['foo: 1'], '知らないキー'],
    [['sweep: 1M-2M', 'sweep: 1M-3M'], '2 つあります'],
    [['device: h5'], 'device:'],
    [['sweep: x'], 'sweep:'],
    [['sweep:', '  a: 1'], '1 行で'],
    [['title:', '  a: 1'], 'title:'],
    [['dut:', '  a: 1'], 'dut:'],
    [['dut:', '  - a: 1'], '1 行に 1 つ'],
    [['dut:', '  - series Q 1'], '知らない素子'],
    [['dut:', '  - open', '  - series R 1'], '最後に'],
    [['data: ../x.s2p'], 'data:'],
    [['data: x.csv'], 'data:'],
    [['traces: {}'], 'traces:'],
    [['traces:', '  - a: 1'], '1 行に 1 本'],
    [['traces:', '  - S22 logmag'], 'S22'],
    [['markers: {}'], 'markers:'],
    [['markers:', '  - x'], '読めません'],
    [['notes: 1'], 'notes:'],
    [['notes:', '  - arrow'], '注釈は'],
    [['notes:', '  - text 1M 1dB: '], '注釈は'],
    [['notes:', '  - a: 1', '    b: 2'], '注釈は'],
    [['notes:', '  - mark 1M 1dB: x'], 'mark には'],
    [['- a'], '一番外側'],
    [['a: [1'], 'YAML'],
    [['1: 2', '? [a]', ': 3'], 'キーは文字'],
    [['style: neon'], 'テーマ'],
  ])('says what is wrong with %j', (lines, said) => {
    expect(messages(lines).join('\n')).toContain(said);
  });

  test('caps traces and markers at the four the device has', () => {
    const traces = messages(['traces:', ...['S11 logmag', 'S21 logmag', 'S11 smith', 'S11 swr', 'S11 phase'].map((line) => `  - ${line}`)]);
    expect(traces.join('\n')).toContain('4 本まで');
    const markers = messages(['markers:', ...['1M', '2M', '3M', '4M', '5M'].map((line) => `  - ${line}`)]);
    expect(markers.join('\n')).toContain('4 つまで');
  });

  test('a trace written twice is drawn once', () => {
    const result = read(['sweep: 1M-2M', 'traces:', '  - S11 logmag', '  - S11 logmag']);
    expect(result.doc.traces).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ notice: true });
  });

  test('caps dut elements and notes', () => {
    const dut = messages(['dut:', ...Array.from({ length: 21 }, () => '  - series R 1')]);
    expect(dut.join('\n')).toContain('20 個まで');
    const notes = messages(['notes:', ...Array.from({ length: 51 }, () => '  - mark 1M 1dB')]);
    expect(notes.join('\n')).toContain('50 個まで');
  });

  test('traces written but all unreadable fall back to the default three', () => {
    expect(read(['sweep: 1M-2M', 'traces:', '  - S22 logmag']).doc.traces).toBe(DEFAULT_TRACES);
  });

  test('an empty title is no title', () => {
    expect(read(['sweep: 1M-2M', "title: ''"]).doc.title).toBeNull();
  });
});

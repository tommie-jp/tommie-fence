import { describe, expect, test } from 'vitest';
import { renderPerfboard } from '../index.ts';
import { migrateSilk } from './silk.ts';

const FENCE = [
  'board: akizuki-c',
  'title: 図01 LED',
  'points:',
  '  IN: a1',
  'parts:',
  '  R1: resistor c3 c7 10k',
  '  D1: led c10 c12 red',
  '  BAT:',
  '    type: device',
  '    at: -c4',
  '    pins: + -',
  'wires:',
  '  - IN -- a3',
  '  - a3 -- c3',
  'notes:',
  '  - mark c3 red',
  '  - arrow g4 c5 red',
  '  - text g6: ここから電源',
].join('\n');

describe('migrateSilk', () => {
  test('respells every address for an Akizuki board, which counts the rows from the bottom', () => {
    const { source, changed, problems } = migrateSilk(FENCE);

    expect(problems).toEqual([]);
    expect(changed).toBe(true);
    // 15 行の基板で、上から a 行目は下から数えて 15 行目 = O。c は M、g は I。
    // 基板の外の `-c4` (3 行ぶん上) は 3 行ぶん下の `s` へ回る。
    expect(source).toContain('  IN: o1');
    expect(source).toContain('R1: resistor m3 m7 10k');
    expect(source).toContain('  - IN -- o3');
    expect(source).toContain('  - mark m3 red');
    expect(source).toContain('  - arrow i4 m5 red');
    expect(source).toContain('  - text i6: ここから電源');
    expect(source).toContain('    at: s4');
  });

  test('marks the board as counted by its silk, so a second run leaves the fence alone', () => {
    const first = migrateSilk(FENCE);
    const second = migrateSilk(first.source);

    expect(first.source).toContain('board:\n  size: akizuki-c\n  silk: board\n');
    expect(second).toEqual({ source: first.source, changed: false, problems: [] });
  });

  test('adds the mark under size: when the board is already a map, keeping its other items', () => {
    const mapped = FENCE.replace('board: akizuki-c', 'board:\n  size: akizuki-c\n  slots: on');
    const { source } = migrateSilk(mapped);

    expect(source).toContain('board:\n  size: akizuki-c\n  silk: board\n  slots: on\n');
  });

  test('keeps the comment after a scalar board', () => {
    const { source } = migrateSilk(FENCE.replace('board: akizuki-c', 'board: akizuki-c # 手持ち'));

    expect(source).toContain('  size: akizuki-c  # 手持ち\n  silk: board');
  });

  test('refuses a fence that still has the retired labels row and col, leaving it as it was', () => {
    const old = FENCE.replace('title:', 'style:\n  labels:\n    row: numeric\ntitle:');
    const result = migrateSilk(old);

    expect(result.changed).toBe(false);
    expect(result.problems[0]).toContain('廃止');
  });

  test('respells the wires written as a quoted string with a # colour', () => {
    // `#` は YAML では行末コメントの始まりだが、引用の中なので色の語。
    const quoted = FENCE.replace('  - a3 -- c3', '  - "a3 -- c3 #00aaaa"');
    const { source, problems } = migrateSilk(quoted);

    expect(problems).toEqual([]);
    expect(source).toContain('  - "o3 -- m3 #00aaaa"');
  });

  test('keeps the leading zero of an address made of digits only, written alone as a value', () => {
    // 0 行 (基板の外) を指す点は、英字が 0 になって `0` と数字だけで綴る。
    const outside = 'board: akizuki-c\npoints:\n  TOP: a0\n  OUT: p1\nparts:\n  R1: resistor b3 b7 10k\n';
    const { source, problems } = migrateSilk(outside);

    expect(problems).toEqual([]);
    expect(source).toContain('  TOP: o0');
    expect(source).toContain('  OUT: 01');
  });

  test('keeps the words that are not addresses, and the layout of the lines', () => {
    const { source } = migrateSilk(FENCE);

    expect(source).toContain('title: 図01 LED');
    expect(source).toContain('  R1: resistor');
    expect(source).toContain('    pins: + -');
  });

  test('does not touch a board counted by holes, which has no silk of its own', () => {
    const plain = FENCE.replace('akizuki-c', '25x15');

    expect(migrateSilk(plain)).toEqual({ source: plain, changed: false, problems: [] });
  });

  test('does not touch a fence that already says which way it counts', () => {
    const written = FENCE.replace('board: akizuki-c', 'board:\n  size: akizuki-c\n  silk: fence');

    expect(migrateSilk(written).changed).toBe(false);
  });

  test('keeps the same circuit: the migrated fence wires the same pins together', () => {
    const { source } = migrateSilk(FENCE);

    expect(renderPerfboard(source).netlist).toEqual(renderPerfboard(FENCE.replace('board: akizuki-c', 'board:\n  size: akizuki-c\n  silk: fence')).netlist);
  });
});

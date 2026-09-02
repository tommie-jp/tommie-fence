import { describe, expect, test } from 'vitest';
import { listFences } from './fenceList.ts';

const MARKDOWN = [
  '# ノート',
  '',
  '```circuit',
  'title: Fig.01 RC',
  'parts:',
  '  R1: resistor a1 a3 10k',
  '```',
  '',
  '本文',
  '',
  '```circuit',
  'parts:',
  '  C1: capacitor a1 a3 100n',
  '```',
  '',
  '```breadboard',
  'title: not mine',
  '```',
  '',
].join('\n');

describe('listFences', () => {
  test('lists every circuit fence with the line it opens on', () => {
    expect(listFences(MARKDOWN).map((fence) => fence.line)).toEqual([3, 11]);
  });

  test('carries the title, so the picker can name the fence', () => {
    expect(listFences(MARKDOWN).map((fence) => fence.title)).toEqual(['Fig.01 RC', null]);
  });

  test('leaves other fence languages alone', () => {
    expect(listFences(MARKDOWN)).toHaveLength(2);
  });

  test('is empty when there is nothing to pick from', () => {
    expect(listFences('# なし\n')).toEqual([]);
  });

  test('still lists a fence it cannot read, so the picker does not hide it', () => {
    // 読めないフェンスも文書にはある。一覧から消すと、直すために選べない。
    expect(listFences('```circuit\nparts: [\n```\n')).toEqual([{ line: 1, title: null }]);
  });
});

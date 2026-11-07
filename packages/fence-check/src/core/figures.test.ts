import type { Scene } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { checkFence, titleOf } from './figures.ts';
import type { SceneMakers } from './figures.ts';

const empty = (fence: Scene['fence']): Scene => ({
  fence, sheet: null, parts: [], wires: [], captions: [], approximate: false, skipped: 2,
});

describe('titleOf', () => {
  test('reads the title line and drops quotes', () => {
    expect(titleOf('board: half\ntitle: "図1 LED"\n')).toBe('図1 LED');
    expect(titleOf('board: half\n')).toBeNull();
  });
});

describe('checkFence', () => {
  const makers: SceneMakers = {
    circuit: () => { throw new Error('読めません'); },
    breadboard: () => [empty('breadboard'), { ...empty('breadboard'), sheet: '裏' }],
    perfboard: () => [empty('perfboard')],
  };

  test('one result per sheet', () => {
    const results = checkFence('a.md', { fence: 'breadboard', source: 'title: 図2\n', line: 10 }, makers);
    expect(results.map((one) => one.sheet)).toEqual([null, '裏']);
    expect(results[0]).toMatchObject({ file: 'a.md', line: 10, title: '図2', skipped: 2, failure: null });
  });

  test('a fence that cannot be read is kept with its reason, not thrown', () => {
    const [result] = checkFence('a.md', { fence: 'circuit', source: '', line: 3 }, makers);
    expect(result?.failure).toBe('読めません');
  });
});

import { describe, expect, test } from 'vitest';
import { applyChanges, bodyOf, docOver, linesOf, replaceLines } from './doc.ts';

const body = 'title: 図01\nparts:\n  R1: resistor a9 b9\n';

describe('linesOf / bodyOf', () => {
  test('記号の行で挟んで、戻すと元の本文になる', () => {
    // Act
    const lines = linesOf('breadboard', body);

    // Assert
    expect(lines[0]).toBe('```breadboard');
    expect(lines.at(-1)).toBe('```');
    expect(bodyOf(lines)).toBe(body);
  });

  test('空の本文でも記号の行は立つ', () => {
    expect(linesOf('circuit', '')).toEqual(['```circuit', '', '```']);
  });
});

describe('docOver', () => {
  test('書き換えたあとの本文を見せる (覚え込まない)', () => {
    // Arrange
    let now = body;
    const document = docOver('breadboard', () => now);

    // Act
    now = 'title: 図02\n';

    // Assert
    expect(document.getText()).toContain('図02');
    expect(document.lineCount).toBe(3);
    expect(document.lineAt(1).text).toBe('title: 図02');
  });

  test('範囲の外は投げる (黙って空行を返さない)', () => {
    const document = docOver('breadboard', () => body);

    expect(() => document.lineAt(99)).toThrow(/99 行目/);
  });
});

describe('applyChanges', () => {
  const lines = linesOf('breadboard', body);

  test('控えと合えば当てる', () => {
    // Act
    const out = applyChanges(lines, [
      { line: 3, from: { column: 15, text: 'a9' }, to: { column: 15, text: 'a10' } },
    ]);

    // Assert
    expect(out?.[3]).toBe('  R1: resistor a10 b9');
  });

  test('同じ行に 2 か所あっても、右がずれない', () => {
    const out = applyChanges(lines, [
      { line: 3, from: { column: 15, text: 'a9' }, to: { column: 15, text: 'a10' } },
      { line: 3, from: { column: 18, text: 'b9' }, to: { column: 19, text: 'b10' } },
    ]);

    expect(out?.[3]).toBe('  R1: resistor a10 b10');
  });

  test('控えと合わなければ何もしない', () => {
    const out = applyChanges(lines, [
      { line: 3, from: { column: 15, text: 'z9' }, to: { column: 15, text: 'a10' } },
    ]);

    expect(out).toBeNull();
  });

  test('無い行を指していたら何もしない', () => {
    expect(applyChanges(lines, [
      { line: 99, from: { column: 0, text: 'x' }, to: { column: 0, text: 'y' } },
    ])).toBeNull();
  });
});

describe('replaceLines', () => {
  const lines = linesOf('breadboard', body);

  test('本文を丸ごと入れ替える', () => {
    const out = replaceLines(lines, 1, 3, ['title: 別の図']);

    expect(out && bodyOf(out)).toBe('title: 別の図\n');
  });

  test('文書からはみ出す指定は断る', () => {
    expect(replaceLines(lines, 1, 99, ['x'])).toBeNull();
    expect(replaceLines(lines, 1, 0, ['x'])).toBeNull();
  });
});

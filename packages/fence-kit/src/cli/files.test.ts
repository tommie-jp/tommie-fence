import { afterAll, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { collectFiles, isYamlInput, readInput } from './files.ts';
import { reportNetlist } from './report.ts';

/**
 * CLI が読む入力の集め方。**3 つのフェンスで同じもの**を使うので、
 * 写しが 3 つあったころは片方だけ直っていた (空のディレクトリを断る守りは
 * perfboard にしか入っていなかった) — その守りをここで見張る。
 */

const root = mkdtempSync(join(tmpdir(), 'fence-kit-files-'));
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

const dir = (name: string): string => {
  const made = join(root, name);
  mkdirSync(made, { recursive: true });
  return made;
};

const file = (at: string, name: string, text = 'x'): string => {
  const path = join(at, name);
  writeFileSync(path, text, 'utf8');
  return path;
};

describe('読む入力を集める', () => {
  test('takes a file as it is, whatever the extension', () => {
    const only = file(dir('one'), 'a.md');

    expect(collectFiles(only)).toEqual([only]);
  });

  test('picks the fences and the whole-figure files out of a directory, in name order', () => {
    const at = dir('many');
    file(at, 'b.md');
    file(at, 'a.yaml');
    file(at, 'c.txt');
    file(at, 'd.markdown');

    expect(collectFiles(at)).toEqual([join(at, 'a.yaml'), join(at, 'b.md'), join(at, 'd.markdown')]);
  });

  test('looks one level down only, so a folder of broken examples is not swept in', () => {
    const at = dir('nested');
    file(at, 'a.md');
    file(dir('nested/errors'), 'bad.md');

    expect(collectFiles(at)).toEqual([join(at, 'a.md')]);
  });

  test('refuses a directory with nothing to read, rather than letting CI go green on nothing', () => {
    expect(() => collectFiles(dir('empty'))).toThrow('に .md も .yaml もありません');
  });
});

describe('入力 1 つを読む', () => {
  test('reads the text and drops the extension from the name', () => {
    const path = file(dir('read'), 'figure.md', 'title: t\n');
    const input = readInput(path, null);

    expect(input.source).toBe('title: t\n');
    expect(input.stem).toBe('figure');
    expect(input.whole).toBe(false);
  });

  test('writes beside the input when no --out was given', () => {
    const at = dir('beside');
    const path = file(at, 'figure.md');

    expect(readInput(path, null).directory).toBe(resolve(at));
  });

  test('writes where --out says when it was given', () => {
    const path = file(dir('out'), 'figure.md');

    expect(readInput(path, '/somewhere').directory).toBe('/somewhere');
  });

  test('reads a .yaml as one whole figure, not as a file of fences', () => {
    const path = file(dir('yaml'), 'figure.yaml');

    expect(readInput(path, null).whole).toBe(true);
    expect(isYamlInput(path)).toBe(true);
    expect(isYamlInput('figure.md')).toBe(false);
  });
});

describe('ネットリストの出し方', () => {
  const said = (netlist: readonly { name: string; refs: readonly string[] }[]): readonly string[] => {
    const lines: string[] = [];
    const before = console.log;
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
    try {
      reportNetlist(netlist);
    } finally {
      console.log = before;
    }
    return lines;
  };

  test('says nothing when there is no netlist', () => {
    expect(said([])).toEqual([]);
  });

  test('lines the names up, so the eye can follow which leg is on which net', () => {
    const lines = said([{ name: 'N1', refs: ['R1.1'] }, { name: 'LONGER', refs: ['R1.2', 'D1.A'] }]);

    expect(lines[0]).toContain('ネットリスト:');
    expect(lines[1]).toBe('    N1     : R1.1');
    expect(lines[2]).toBe('    LONGER : R1.2, D1.A');
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { collectProblems } from './problems/collect.ts';
import { MAPLESS_LANGUAGES, scopeProblems, vnaProblems } from './mapless.ts';
import { NEIGHBOR_READERS, dataForUri, readerFor, scopeDataFrom, vnaDataFrom } from './neighborData.ts';

const home = mkdtempSync(join(tmpdir(), 'mapless-ext-'));
writeFileSync(join(home, 'm.s1p'), '# HZ S RI R 50\n1000000 0.5 0\n2000000 0.5 0\n');
writeFileSync(join(home, 'w.csv'), 'Time (s),Channel 1 (V)\n0,1\n');
const doc = { scheme: 'file', fsPath: join(home, 'note.md') };
const FENCE = '# 題\n\n```vna\nsweep: 1M-2M\ndata: m.s1p\ntraces:\n  - S11 logmag\n```\n';

describe('data: の読み口 (デスクトップ)', () => {
  test('reads the file next to a file document, each fence with its own names', () => {
    expect(dataForUri(doc, vnaDataFrom)?.('m.s1p')).toContain('# HZ S RI R 50');
    expect(dataForUri(doc, scopeDataFrom)?.('w.csv')).toContain('Channel 1');
    // 名前の形はフェンスごと: vna は .csv を、scope は .s1p を読まない。
    expect(dataForUri(doc, vnaDataFrom)?.('w.csv')).toBeNull();
    expect(dataForUri(doc, scopeDataFrom)?.('m.s1p')).toBeNull();
  });

  test('has no neighbour for untitled or git documents', () => {
    expect(dataForUri({ scheme: 'untitled', fsPath: '/x/a.md' }, vnaDataFrom)).toBeUndefined();
    expect(dataForUri(undefined, scopeDataFrom)).toBeUndefined();
  });

  test('takes the document from the markdown-it env', () => {
    expect(readerFor(vnaDataFrom)({ currentDocument: doc })?.('m.s1p')).toContain('0.5');
    expect(NEIGHBOR_READERS.scope({ currentDocument: doc })?.('w.csv')).toContain('0,1');
    expect(NEIGHBOR_READERS.vna({})).toBeUndefined();
    expect(NEIGHBOR_READERS.scope(null)).toBeUndefined();
  });
});

describe('殻を持たないフェンスの Problems', () => {
  test('names both fences without a map', () => {
    expect(MAPLESS_LANGUAGES).toEqual(['vna', 'scope']);
  });

  test('lists vna lines in Problems, with the file found when a reader is given', () => {
    const found = collectProblems(FENCE, [vnaProblems(dataForUri(doc, vnaDataFrom))], { erc: false });
    expect(found).toEqual([]);
  });

  test('says the file cannot be read without a reader (the web host)', () => {
    const said = collectProblems(FENCE, [vnaProblems()], { erc: false });
    expect(said).toEqual([{ language: 'vna', line: 5, kind: 'notice', message: expect.stringContaining('この宿主では m.s1p を読めません') }]);
  });

  test('lists scope lines in Problems on the markdown line', () => {
    const said = collectProblems('# 題\n\n```scope\ntime: 1ms\n```\n', [scopeProblems()], { erc: false });
    expect(said).toEqual([{ language: 'scope', line: 4, kind: 'error', message: expect.stringContaining('/div を付けます') }]);
  });
});

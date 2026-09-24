import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { collectProblems } from './problems/collect.ts';
import { vnaProblems } from './vna.ts';
import { dataForUri, readDataFromEnv } from './vnaData.ts';

const home = mkdtempSync(join(tmpdir(), 'vna-ext-'));
writeFileSync(join(home, 'm.s1p'), '# HZ S RI R 50\n1000000 0.5 0\n2000000 0.5 0\n');
const doc = { scheme: 'file', fsPath: join(home, 'note.md') };
const FENCE = '# 題\n\n```vna\nsweep: 1M-2M\ndata: m.s1p\ntraces:\n  - S11 logmag\n```\n';

describe('vna の data: (デスクトップ)', () => {
  test('reads the Touchstone next to a file document', () => {
    expect(dataForUri(doc)?.('m.s1p')).toContain('# HZ S RI R 50');
  });

  test('has no neighbour for untitled or git documents', () => {
    expect(dataForUri({ scheme: 'untitled', fsPath: '/x/a.md' })).toBeUndefined();
    expect(dataForUri(undefined)).toBeUndefined();
  });

  test('takes the document from the markdown-it env', () => {
    expect(readDataFromEnv({ currentDocument: doc })?.('m.s1p')).toContain('0.5');
    expect(readDataFromEnv({})).toBeUndefined();
    expect(readDataFromEnv(null)).toBeUndefined();
  });
});

describe('vnaProblems', () => {
  test('lists vna lines in Problems, with the file found when a reader is given', () => {
    const found = collectProblems(FENCE, [vnaProblems(dataForUri(doc))], { erc: false });
    expect(found).toEqual([]);
  });

  test('says the file cannot be read without a reader (the web host)', () => {
    const said = collectProblems(FENCE, [vnaProblems()], { erc: false });
    expect(said).toEqual([{ language: 'vna', line: 5, kind: 'notice', message: expect.stringContaining('この宿主では m.s1p を読めません') }]);
  });
});

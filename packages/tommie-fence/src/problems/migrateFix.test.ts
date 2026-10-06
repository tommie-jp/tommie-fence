import { describe, expect, test } from 'vitest';
import { codeActionProviders } from '../../test/vscodeStub.ts';
import { isOldSpelling, migratedLines, registerMigrateFix } from './migrateFix.ts';

/**
 * 旧い番地の綴り (`a1f5`) のクイックフィックス (52 の docs/126 の段 9)。
 * **書き換えの中身は core の migrateCircuitFences** — ここは「どの行をどう差し替えるか」と
 * vscode への配線だけを見る。
 */
const OLD = ['# 回路', '', '```circuit', 'parts:', '  R1: resistor a1 a3 10k', '```', '', '```breadboard', 'parts:', '  R1: resistor a1 a5', '```', ''].join('\n');

describe('isOldSpelling', () => {
  test('picks the circuit problems that say the spelling is old', () => {
    expect(isOldSpelling({ message: 'a1 は旧い綴りです。1,1 と書きます', code: 'circuit' })).toBe(true);
    expect(isOldSpelling({ message: '種類 resistr は知りません', code: 'circuit' })).toBe(false);
    expect(isOldSpelling({ message: 'a1 は旧い綴りです。1,1 と書きます', code: 'bread' })).toBe(false);
  });
});

describe('migratedLines', () => {
  test('rewrites only the lines of the circuit fences, leaving the breadboard holes alone', () => {
    const { lines, changed } = migratedLines(OLD);

    expect(lines).toEqual([{ line: 4, text: '  R1: resistor 1,1 3,1 10k' }]);
    expect(changed).toBe(2);
  });

  test('has nothing to do for a document in the new spelling', () => {
    expect(migratedLines('```circuit\nparts:\n  R1: resistor 1,1 3,1\n```\n').lines).toEqual([]);
  });
});

describe('registerMigrateFix', () => {
  type Provider = { provideCodeActions(document: unknown, range: unknown, context: unknown): { title: string; edit?: { replaced: unknown[] } }[] };
  const subscriptions: unknown[] = [];
  registerMigrateFix({ subscriptions } as never);
  const provider = codeActionProviders.at(-1) as Provider;
  const document = {
    getText: () => OLD,
    uri: 'file:///note.md',
    lineAt: (line: number) => ({ range: { line } }),
  };
  const diagnostic = { message: 'a1 は旧い綴りです。1,1 と書きます', code: 'circuit' };

  test('offers one fix that rewrites every old address in the document', () => {
    const [action] = provider.provideCodeActions(document, null, { diagnostics: [diagnostic] });

    expect(action?.title).toContain('x,y');
    expect(action?.edit?.replaced).toEqual([['file:///note.md', { line: 4 }, '  R1: resistor 1,1 3,1 10k']]);
  });

  test('offers nothing when no problem says the spelling is old', () => {
    expect(provider.provideCodeActions(document, null, { diagnostics: [{ message: 'x', code: 'circuit' }] })).toEqual([]);
  });
});

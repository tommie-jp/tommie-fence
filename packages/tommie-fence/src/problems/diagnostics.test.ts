import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { configuration, diagnosticLog, listeners, state } from '../../test/vscodeStub.ts';
import { fenceEditors } from '../editor/fences.ts';
import { PROBLEMS_DELAY_MS, registerProblems } from './diagnostics.ts';

/**
 * Problems パネルへ流す配線 (52 の docs/57)。**いつ組み直すか**を見る —
 * 何を出すかは `collect.test.ts` が見ている。
 */
const BROKEN = '```perfboard\nboard: 12x7\nparts:\n  R1: resistr b2 b6\n```\n';
const LOOSE = '```perfboard\nboard: 12x7\nparts:\n  R1: resistor b2 b6 1k\n```\n';

type FakeDocument = { languageId: string; uri: { scheme: string; toString(): string }; text: string } & Record<string, unknown>;

const documentOf = (text: string, name = 'note.md', languageId = 'markdown', scheme = 'file'): FakeDocument => {
  const document: FakeDocument = {
    languageId,
    text,
    uri: { scheme, toString: () => `${scheme}:///${name}` },
    getText: () => document.text,
    get lineCount() { return document.text.split('\n').length; },
    lineAt: (line: number) => ({ range: { line } }),
  };
  return document;
};

type Diagnostic = { readonly message: string; readonly severity: number; readonly source: string; readonly code: string; readonly range: { readonly line: number } };

/** その URI に最後に置かれた診断。消されていれば null。 */
const lastFor = (uri: string): readonly Diagnostic[] | null => {
  const last = [...diagnosticLog].reverse().find((entry) => entry[1] === uri);
  return last === undefined || last[0] === 'delete' ? null : (last[2] as readonly Diagnostic[]);
};
const setsFor = (uri: string): number => diagnosticLog.filter((entry) => entry[0] === 'set' && entry[1] === uri).length;

const register = (): (() => void) => {
  const subscriptions: { dispose(): void }[] = [];
  registerProblems({ subscriptions } as unknown as vscode.ExtensionContext, fenceEditors());
  return () => { for (const one of subscriptions) one.dispose(); };
};

describe('registerProblems', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    diagnosticLog.length = 0;
    listeners.open = [];
    listeners.close = [];
    listeners.document = [];
    listeners.configuration = [];
    state.textDocuments = [];
    for (const section of Object.keys(configuration)) delete configuration[section];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('reads the documents already open when it starts', () => {
    // Arrange
    state.textDocuments = [documentOf(BROKEN)];

    // Act
    register();

    // Assert — 読めない行 (Markdown の 4 行目) は Error で、0 始まりの 3 行目の範囲。
    const errors = (lastFor('file:///note.md') ?? []).filter((one) => one.severity === 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ source: 'tommie-fence', code: 'perf', range: { line: 3 } });
  });

  test('puts notices as warnings and ERC as information', () => {
    // Arrange — 読めない行のある板は「ERC を掛けていません」とお知らせも言う。
    configuration['tommieFence.problems'] = { erc: true };
    state.textDocuments = [documentOf(BROKEN, 'broken.md'), documentOf(LOOSE, 'loose.md')];

    // Act
    register();

    // Assert
    const severities = (uri: string) => new Set((lastFor(uri) ?? []).map((one) => one.severity));
    expect(severities('file:///broken.md')).toEqual(new Set([0, 1]));
    expect(severities('file:///loose.md')).toEqual(new Set([2]));
  });

  test('leaves ERC out unless the setting asks for it', () => {
    state.textDocuments = [documentOf(LOOSE)];

    register();

    expect(lastFor('file:///note.md')).toEqual([]);
  });

  test('reads a markdown file when it opens, and forgets it when it closes', () => {
    // Arrange
    register();
    const opened = documentOf(BROKEN);

    // Act / Assert
    for (const listen of listeners.open) listen(opened);
    expect(lastFor('file:///note.md')?.length).toBeGreaterThan(0);

    for (const listen of listeners.close) listen(opened);
    expect(lastFor('file:///note.md')).toBeNull();
  });

  test('does not touch files that are not markdown', () => {
    register();

    for (const listen of listeners.open) listen(documentOf(BROKEN, 'a.txt', 'plaintext'));

    expect(diagnosticLog).toEqual([]);
  });

  test('leaves the old copy in a diff view alone, so a broken line is not listed twice', () => {
    register();

    for (const listen of listeners.open) listen(documentOf(BROKEN, 'note.md', 'markdown', 'git'));

    expect(diagnosticLog).toEqual([]);
  });

  test('re-reads once after a burst of typing, not per keystroke', () => {
    // Arrange
    const document = documentOf(LOOSE);
    state.textDocuments = [document];
    register();
    const before = setsFor('file:///note.md');

    // Act — 3 打鍵で読めない行にする。
    for (const text of [LOOSE.replace('resistor', 'resisto'), LOOSE.replace('resistor', 'resist'), BROKEN]) {
      document.text = text;
      for (const listen of listeners.document) listen({ document });
    }

    // Assert — 待っている間は組み直さない。止まってから 1 回。
    expect(setsFor('file:///note.md')).toBe(before);
    vi.advanceTimersByTime(PROBLEMS_DELAY_MS);
    expect(setsFor('file:///note.md')).toBe(before + 1);
    expect((lastFor('file:///note.md') ?? []).some((one) => one.severity === 0)).toBe(true);
  });

  test('re-reads every open document when the setting changes', () => {
    // Arrange
    state.textDocuments = [documentOf(LOOSE)];
    register();
    expect(lastFor('file:///note.md')).toEqual([]);

    // Act
    configuration['tommieFence.problems'] = { erc: true };
    for (const listen of listeners.configuration) {
      listen({ affectsConfiguration: (section: string) => section === 'tommieFence.problems' });
    }

    // Assert
    expect(lastFor('file:///note.md')?.length).toBeGreaterThan(0);
  });

  test('ignores settings of other sections', () => {
    state.textDocuments = [documentOf(LOOSE)];
    register();
    const before = diagnosticLog.length;

    for (const listen of listeners.configuration) listen({ affectsConfiguration: () => false });

    expect(diagnosticLog).toHaveLength(before);
  });

  test('drops a pending re-read when disposed', () => {
    // Arrange
    const document = documentOf(LOOSE);
    state.textDocuments = [document];
    const dispose = register();
    const before = setsFor('file:///note.md');
    document.text = BROKEN;
    for (const listen of listeners.document) listen({ document });

    // Act
    dispose();
    vi.advanceTimersByTime(PROBLEMS_DELAY_MS);

    // Assert
    expect(setsFor('file:///note.md')).toBe(before);
    expect(listeners.open).toEqual([]);
  });
});

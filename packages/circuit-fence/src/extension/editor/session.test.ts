import { describe, expect, test, vi } from 'vitest';
import { changesForFence } from './docEdits.ts';
import type { DocLike, EditorLike } from './documentLike.ts';
import type { Change } from './history.ts';
import { createSession } from './session.ts';
import type { LitRange, Outgoing, SessionHost } from './session.ts';

/** 文字列を持つだけの文書。書き換えは `patch` が当てる。 */
type Doc = DocLike & { readonly set: (text: string) => void };

const docOf = (uri: string, text: string): Doc => {
  let current = text;
  return {
    uri,
    getText: () => current,
    lineAt: (line: number) => ({ text: current.split('\n')[line] ?? '' }),
    set: (next: string) => { current = next; },
  };
};

const RC = [
  '# ノート',
  '',
  '```circuit',
  'title: RC',
  'parts:',
  '  R1:  resistor a1 a3 10k',
  '  C1:  capacitor a3 c3 100n',
  '```',
  '',
].join('\n');

const SECOND = ['', '```circuit', 'parts:', '  L1: inductor b1 b3 1m', '```', ''].join('\n');
const TWO = RC + SECOND;

/** vscode の `applyEdit` の代わり。**当てる前に照合する**ところまで同じ。 */
const patch = (document: Doc, changes: readonly Change[]): boolean => {
  const lines = document.getText().split('\n');
  const fits = changes.every((change) => {
    const line = lines[change.line] ?? '';
    return line.slice(change.from.column, change.from.column + change.from.text.length) === change.from.text;
  });
  if (!fits) return false;

  // 後ろから当てると、前の桁がずれない。
  const back = [...changes].sort((a, b) => b.line - a.line || b.from.column - a.from.column);
  const patched = back.reduce<readonly string[]>((acc, change) => acc.map((line, index) => (
    index !== change.line
      ? line
      : line.slice(0, change.from.column) + change.to.text + line.slice(change.from.column + change.from.text.length)
  )), lines);
  document.set(patched.join('\n'));
  return true;
};

type Fake = SessionHost<Doc> & {
  readonly sent: Outgoing[];
  readonly lit: { readonly uri: string; readonly ranges: readonly LitRange[] }[];
  editor: EditorLike<Doc> | null;
  docs: readonly Doc[];
};

const hostOf = (docs: readonly Doc[], editor: EditorLike<Doc> | null, over: Partial<SessionHost<Doc>> = {}): Fake => {
  const fake: Fake = {
    sent: [],
    lit: [],
    editor,
    docs,
    post: (message) => { fake.sent.push(message); },
    activeEditor: () => fake.editor,
    openDocument: (uri) => fake.docs.find((one) => one.uri.toString() === uri) ?? null,
    applyEdits: async (document, fenceLine, edits) => {
      const changes = changesForFence(document, fenceLine, edits);
      return patch(document, changes) ? changes : null;
    },
    applyChanges: async (document, changes) => patch(document, changes),
    highlight: (uri, ranges) => { fake.lit.push({ uri, ranges }); },
    ...over,
  };
  return fake;
};

/** カーソル (0 始まり) を置いたエディタ。 */
const at = (document: Doc, line: number, character = 0): EditorLike<Doc> => ({
  document,
  selection: { active: { line, character } },
});

const last = <K extends Outgoing['kind']>(host: Fake, kind: K): Extract<Outgoing, { kind: K }> | undefined =>
  host.sent.filter((message): message is Extract<Outgoing, { kind: K }> => message.kind === kind).at(-1);

const A = 'file:///a.md';

describe('マップを組む', () => {
  test('draws the fence under the cursor, with nothing to pick when there is one fence', () => {
    const doc = docOf(A, RC);
    const session = createSession(hostOf([doc], at(doc, 5)));

    const view = session.view();

    expect(view.html).toContain('data-part="R1"');
    expect(view.picker).toBe('');
  });

  test('offers a picker when the document holds more than one fence', () => {
    const doc = docOf(A, TWO);
    const session = createSession(hostOf([doc], at(doc, 5)));

    const { picker } = session.view();

    expect(picker).toContain('<option value="3" selected>RC (3 行目)</option>');
    expect(picker).toContain('<option value="10">10 行目のフェンス</option>');
  });

  test('follows the cursor into another fence', () => {
    const doc = docOf(A, TWO);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    host.editor = at(doc, 11);

    expect(session.view().html).toContain('data-part="L1"');
    expect(session.view().picker).toContain('value="10" selected');
  });

  test('says so when the fence is lost, instead of leaving the old map', () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    host.editor = null;
    host.docs = [];

    expect(session.view().html).toContain('フェンスを見失いました');
  });

  test('sends history, then the map, then what the cursor points at', () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);

    session.refresh();

    expect(host.sent.map((message) => message.kind)).toEqual(['history', 'map', 'aim']);
    expect(last(host, 'aim')).toMatchObject({ what: 'part', id: 'R1' });
  });
});

describe('動かす', () => {
  test('rewrites the address and says what it did', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });

    expect(doc.getText()).toContain('R1:  resistor b1 b3 10k');
    expect(last(host, 'status')?.text).toContain('R1 を b1 へ動かしました');
    expect(last(host, 'status')?.text).toContain('離れた接続');
  });

  test('moves a node with everything written at it', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'moveNode', from: 'a3', to: 'a4' });

    expect(doc.getText()).toContain('resistor a1 a4 10k');
    expect(doc.getText()).toContain('capacitor a4 c3 100n');
    expect(last(host, 'status')?.text).toContain('a3 の節点を a4 へ動かしました');
  });

  test('refuses an address it cannot read, in words', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'move', part: 'R1', to: 'zz99x' });

    expect(doc.getText()).toBe(RC);
    expect(last(host, 'status')?.text).toContain('番地として読めません');
  });

  test('keeps working on the remembered document when no editor is active', async () => {
    // パネルを前に出すとアクティブなエディタが無くなる。覚えている文書へ当てる。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();
    host.editor = null;

    await session.handle({ kind: 'move', part: 'C1', to: 'b3' });

    expect(doc.getText()).toContain('C1:  capacitor b3 d3 100n');
  });
});

describe('戻す・やり直す (自前の履歴)', () => {
  test('undoes the last move from the map and reports the buttons', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });
    expect(last(host, 'history')).toEqual({ kind: 'history', canUndo: true, canRedo: false });

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toBe(RC);
    expect(last(host, 'history')).toEqual({ kind: 'history', canUndo: false, canRedo: true });
    expect(last(host, 'status')?.text).toContain('を戻しました');
  });

  test('refuses when the text was edited by hand since, rather than breaking it', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });
    doc.set(doc.getText().replace('b1 b3', 'b1 b5'));

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toContain('b1 b5');
    expect(last(host, 'status')?.text).toContain('戻せません');
  });

  test('says when there is nothing to undo', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'redo' });

    expect(last(host, 'status')?.text).toContain('やり直せる移動がありません');
  });
});

describe('戻す・やり直す (VS Code に頼む)', () => {
  test('hands undo to VS Code and keeps no history of its own', async () => {
    const doc = docOf(A, RC);
    const nativeUndo = vi.fn(async () => {});
    const host = hostOf([doc], at(doc, 5), { nativeUndo });
    const session = createSession(host);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });

    await session.handle({ kind: 'undo' });

    expect(nativeUndo).toHaveBeenCalledWith('undo');
    expect(host.sent.some((message) => message.kind === 'history')).toBe(false);
  });
});

describe('フェンスを選ぶ', () => {
  test('switches to the chosen fence even though the cursor sits in another', async () => {
    const doc = docOf(A, TWO);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'fence', line: 10 });

    expect(last(host, 'map')?.html).toContain('data-part="L1"');
    expect(last(host, 'map')?.picker).toContain('value="10" selected');
  });

  test('says so when the line has no fence', async () => {
    const doc = docOf(A, TWO);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'fence', line: 1 });

    expect(last(host, 'status')?.text).toContain('フェンスがありません');
  });
});

describe('文書を固定する (カスタムエディタ)', () => {
  test('starts on the first fence without any editor', () => {
    const doc = docOf(A, TWO);
    const session = createSession(hostOf([doc], null), { pinned: doc });

    expect(session.view().html).toContain('data-part="R1"');
    expect(session.view().picker).toContain('value="3" selected');
  });

  test('does not follow the cursor into another document', () => {
    const doc = docOf(A, RC);
    const other = docOf('file:///b.md', '```circuit\nparts:\n  L1: inductor b1 b3 1m\n```\n');
    const session = createSession(hostOf([doc, other], at(other, 2)), { pinned: doc });

    const view = session.view();

    expect(view.html).toContain('data-part="R1"');
    expect(view.html).not.toContain('data-part="L1"');
  });

  test('follows the cursor within its own document', () => {
    const doc = docOf(A, TWO);
    const session = createSession(hostOf([doc], at(doc, 11)), { pinned: doc });

    expect(session.view().picker).toContain('value="10" selected');
  });

  test('says the document has no fence yet, rather than showing a blank page', () => {
    const empty = docOf('file:///e.md', '# なし\n');
    const session = createSession(hostOf([empty], null), { pinned: empty });

    expect(session.view().html).toContain('circuit フェンスがありません');
  });

  test('tells the host which documents matter to it', () => {
    const doc = docOf(A, RC);
    const session = createSession(hostOf([doc], null), { pinned: doc });

    expect(session.isBoundTo(A)).toBe(true);
    expect(session.follows(A)).toBe(true);
    expect(session.follows('file:///b.md')).toBe(false);
  });

  test('follows every document when not pinned', () => {
    const doc = docOf(A, RC);
    const session = createSession(hostOf([doc], at(doc, 5)));

    expect(session.follows('file:///b.md')).toBe(true);
  });
});

describe('光らせる', () => {
  test('lights up where the grabbed part is written, in document lines', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    const lit = host.lit.at(-1);
    const lines = RC.split('\n');
    expect(lit?.uri).toBe(A);
    expect(lit?.ranges.every((range) => range.line === 5)).toBe(true);
    expect(lit?.ranges.map((range) => lines[range.line]?.slice(range.start, range.end))).toEqual(expect.arrayContaining(['a1', 'a3']));
  });

  test('lights up a node by its address', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();

    await session.handle({ kind: 'select', what: 'node', id: 'a3' });

    expect(host.lit.at(-1)?.ranges.map((range) => range.line).sort()).toEqual([5, 6]);
  });

  test('clears the light when the grab is released', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    await session.handle({ kind: 'select' });

    expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [] });
  });

  test('clears the old document when the map moves to another', async () => {
    const doc = docOf(A, RC);
    const other = docOf('file:///b.md', RC);
    const host = hostOf([doc, other], at(doc, 5));
    const session = createSession(host);
    session.view();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    host.editor = at(other, 5);
    session.refresh();

    expect(host.lit.some((one) => one.uri === A && one.ranges.length === 0)).toBe(true);
  });

  test('clears the light when disposed', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = createSession(host);
    session.view();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    session.dispose();

    expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [] });
  });
});

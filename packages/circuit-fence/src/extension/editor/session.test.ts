import { describe, expect, test, vi } from 'vitest';
import { changesForFence, createSession } from 'fence-kit';
import type { Change, DocLike, EditorLike, LitRange, Outgoing, SessionHost } from 'fence-kit';
import { createCircuitEditor } from './circuitEditor.ts';

/** 文字列を持つだけの文書。書き換えは `patch` が当てる。 */
type Doc = DocLike & { readonly set: (text: string) => void };

const docOf = (uri: string, text: string): Doc => {
  let current = text;
  return {
    uri,
    getText: () => current,
    get lineCount() { return current.split('\n').length; },
    // vscode の TextDocument は範囲の外で投げる。**偽物も投げる** —
    // 空文字を返すと、範囲を外れて呼んでいることが試験で隠れる。
    lineAt: (line: number) => {
      const lines = current.split('\n');
      const text = lines[line];
      if (text === undefined) throw new Error(`Illegal value for \`line\` (${line})`);
      return { text };
    },
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

const BAD = ['# ノート', '', '```circuit', 'parts:', '  R1: resistr a1 a3', '```', ''].join('\n');

const NPN = ['# ノート', '', '```circuit', 'parts:', '  Q1: npn b5', '  R1: resistor a1 a3',
  'wires:', '  - a1 -- Q1.b', '```', ''].join('\n');

/** 向きを書けない記号 (上下がその記号の意味そのもの)。 */
const VCC = ['# ノート', '', '```circuit', 'parts:', '  VCC: vcc b5', '```', ''].join('\n');

const SECOND = ['', '```circuit', 'parts:', '  L1: inductor b1 b3 1m', '```', ''].join('\n');
const THIRD = ['', '```circuit', 'parts:', '  D1: diode c1 c3', '```', ''].join('\n');
const TWO = RC + SECOND;
const THREE = TWO + THIRD;

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
    applyEdits: async (document, fenceLine, edits) => patch(document, changesForFence(document, fenceLine, edits)),
    // 本文の入れ替え。**vscode と同じく行の範囲を丸ごと差し替える。**
    replaceBody: async (document, fenceLine, count, body) => {
      const lines = document.getText().split('\n');
      if (count <= 0 || fenceLine + count > lines.length) return false;
      document.set([...lines.slice(0, fenceLine), ...body, ...lines.slice(fenceLine + count)].join('\n'));
      return true;
    },
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

/** テストの呼び口。**フェンスのエディタは毎回同じもの**を渡す (殻の段取りを見るテストなので)。 */
const sessionOf = <D extends DocLike>(host: SessionHost<D>, options: Parameters<typeof createSession<D>>[2] = {}) =>
  createSession(host, createCircuitEditor(), options);

const A = 'file:///a.md';

describe('マップを組む', () => {
  test('draws the fence under the cursor, with nothing to pick when there is one fence', () => {
    const doc = docOf(A, RC);
    const session = sessionOf(hostOf([doc], at(doc, 5)));

    const view = session.view();

    expect(view.html).toContain('data-part="R1"');
    expect(view.picker).toBe('');
  });

  test('offers a picker when the document holds more than one fence', () => {
    const doc = docOf(A, TWO);
    const session = sessionOf(hostOf([doc], at(doc, 5)));

    const { picker } = session.view();

    expect(picker).toContain('<option value="3" selected>RC (3 行目)</option>');
    expect(picker).toContain('<option value="10">10 行目のフェンス</option>');
  });

  test('follows the cursor into another fence', () => {
    const doc = docOf(A, TWO);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    host.editor = at(doc, 11);

    expect(session.view().html).toContain('data-part="L1"');
    expect(session.view().picker).toContain('value="10" selected');
  });

  test('says so when the fence is lost, instead of leaving the old map', () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    host.editor = null;
    host.docs = [];

    expect(session.view().html).toContain('フェンスを見失いました');
  });

  test('sends history, then the map, then what the cursor points at and its fields', () => {
    // **欄まで送る。** カーソルは「いまどれを見ているか」なので、光らせるだけ
    // でなく直せるところまで出す (実機で頼まれた)。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);

    session.refresh();

    expect(host.sent.map((message) => message.kind)).toEqual(['history', 'map', 'aim', 'fields']);
    expect(last(host, 'aim')).toMatchObject({ what: 'part', id: 'R1' });
    expect(last(host, 'fields')).toMatchObject({ part: { id: 'R1', type: 'resistor' } });
  });

  test('leaves the fields alone when the cursor points at nothing', () => {
    // マップで選んだ欄を、カーソルが余白へ動いただけで閉じない。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 0));
    const session = sessionOf(host);

    session.refresh();

    expect(host.sent.map((message) => message.kind)).not.toContain('fields');
  });
});

describe('動かす', () => {
  test('rewrites the address and says what it did', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });

    expect(doc.getText()).toContain('R1:  resistor b1 b3 10k');
    expect(last(host, 'status')?.text).toContain('R1 を b1 へ動かしました');
    expect(last(host, 'status')?.text).toContain('離れた接続');
  });

  test('moves a node with everything written at it', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'moveNode', from: 'a3', to: 'a4' });

    expect(doc.getText()).toContain('resistor a1 a4 10k');
    expect(doc.getText()).toContain('capacitor a4 c3 100n');
    expect(last(host, 'status')?.text).toContain('a3 の節点を a4 へ動かしました');
  });

  test('refuses an address it cannot read, in words', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'move', part: 'R1', to: 'zz99x' });

    expect(doc.getText()).toBe(RC);
    expect(last(host, 'status')?.text).toContain('番地として読めません');
  });

  test('keeps working on the remembered document when no editor is active', async () => {
    // パネルを前に出すとアクティブなエディタが無くなる。覚えている文書へ当てる。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
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
    const session = sessionOf(host);
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
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });
    doc.set(doc.getText().replace('b1 b3', 'b1 b5'));

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toContain('b1 b5');
    expect(last(host, 'status')?.text).toContain('戻せません');
  });

  test('refuses when another line of the fence was edited by hand', async () => {
    // 本文を丸ごと書き戻すので、当てると手で書いた分まで消える。触っていない
    // 行の直しでも断る (エディタの Ctrl+Z なら、そこだけ戻せる)。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });
    doc.set(doc.getText().replace('title: RC', 'title: RC 回路'));

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toContain('title: RC 回路');
    expect(doc.getText()).toContain('b1 b3');
    expect(last(host, 'status')?.text).toContain('戻せません');
  });

  test('puts an indented fence back exactly as it was written', async () => {
    // 控えは文書から読んだ生の行。字下げを組み直さないので、そのまま戻る。
    const indented = ['- item', '', '  ```circuit', '  parts:',
      '    R1: resistor a1 a3 10k', '  ```', ''].join('\n');
    const doc = docOf(A, indented);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'move', part: 'R1', to: 'b1' });
    expect(doc.getText()).toContain('    R1: resistor b1 b3 10k');

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toBe(indented);
  });

  test('says when there is nothing to undo', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
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
    const session = sessionOf(host);
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
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'fence', line: 10 });

    expect(last(host, 'map')?.html).toContain('data-part="L1"');
    expect(last(host, 'map')?.picker).toContain('value="10" selected');
  });

  test('keeps the chosen fence while the cursor stays in the fence it was in', async () => {
    // 選んだ直後の何気ないカーソル移動 (打鍵でも動く) で選択が捨てられると、
    // カーソルの居ないフェンスは一覧から選べない。
    const doc = docOf(A, THREE);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'fence', line: 10 });

    host.editor = at(doc, 6);
    session.refresh();

    expect(last(host, 'map')?.html).toContain('data-part="L1"');
  });

  test('follows again once the cursor enters a different fence', async () => {
    const doc = docOf(A, THREE);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'fence', line: 10 });

    host.editor = at(doc, 16);
    session.refresh();

    expect(last(host, 'map')?.html).toContain('data-part="D1"');
  });

  test('says so when the line has no fence', async () => {
    const doc = docOf(A, TWO);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'fence', line: 1 });

    expect(last(host, 'status')?.text).toContain('フェンスがありません');
  });
});

describe('文書を固定する (カスタムエディタ)', () => {
  test('starts on the first fence without any editor', () => {
    const doc = docOf(A, TWO);
    const session = sessionOf(hostOf([doc], null), { pinned: doc });

    expect(session.view().html).toContain('data-part="R1"');
    expect(session.view().picker).toContain('value="3" selected');
  });

  test('does not follow the cursor into another document', () => {
    const doc = docOf(A, RC);
    const other = docOf('file:///b.md', '```circuit\nparts:\n  L1: inductor b1 b3 1m\n```\n');
    const session = sessionOf(hostOf([doc, other], at(other, 2)), { pinned: doc });

    const view = session.view();

    expect(view.html).toContain('data-part="R1"');
    expect(view.html).not.toContain('data-part="L1"');
  });

  test('follows the cursor within its own document', () => {
    const doc = docOf(A, TWO);
    const session = sessionOf(hostOf([doc], at(doc, 11)), { pinned: doc });

    expect(session.view().picker).toContain('value="10" selected');
  });

  test('says the document has no fence yet, rather than showing a blank page', () => {
    const empty = docOf('file:///e.md', '# なし\n');
    const session = sessionOf(hostOf([empty], null), { pinned: empty });

    expect(session.view().html).toContain('circuit フェンスがありません');
  });

  test('tells the host which documents matter to it', () => {
    const doc = docOf(A, RC);
    const session = sessionOf(hostOf([doc], null), { pinned: doc });

    expect(session.isBoundTo(A)).toBe(true);
    expect(session.follows(A)).toBe(true);
    expect(session.follows('file:///b.md')).toBe(false);
  });

  test('follows every document when not pinned', () => {
    const doc = docOf(A, RC);
    const session = sessionOf(hostOf([doc], at(doc, 5)));

    expect(session.follows('file:///b.md')).toBe(true);
  });
});

describe('光らせる', () => {
  test('lights up where the grabbed part is written, in document lines', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
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
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'select', what: 'node', id: 'a3' });

    expect(host.lit.at(-1)?.ranges.map((range) => range.line).sort()).toEqual([5, 6]);
  });

  test('clears the light when the grab is released', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    await session.handle({ kind: 'select' });

    expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [] });
  });

  test('clears the old document when the map moves to another', async () => {
    const doc = docOf(A, RC);
    const other = docOf('file:///b.md', RC);
    const host = hostOf([doc, other], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    host.editor = at(other, 5);
    session.refresh();

    expect(host.lit.some((one) => one.uri === A && one.ranges.length === 0)).toBe(true);
  });

  test('clears the light when disposed', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    session.dispose();

    expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [] });
  });
});

describe('読めなかったところを帯に出す', () => {
  test('says nothing when the fence reads cleanly', () => {
    const doc = docOf(A, RC);
    const session = sessionOf(hostOf([doc], at(doc, 5)));

    expect(session.view().issues).toBe('');
  });

  test('points at the Markdown line, not the line inside the fence', () => {
    const doc = docOf(A, BAD);
    const session = sessionOf(hostOf([doc], at(doc, 4)));

    const { issues } = session.view();

    expect(issues).toContain('data-line="5"');
    expect(issues).toContain('5 行目');
    expect(issues).toContain('resistr');
  });

  test('marks the offending part on the map as well as in the band', () => {
    const doc = docOf(A, ['# x', '', '```circuit', 'parts:', '  R1: resistor a1 a3',
      'wires:', '  - a1 -- zz9', '```', ''].join('\n'));
    const session = sessionOf(hostOf([doc], at(doc, 4)));

    expect(session.view().html).toContain('data-part="R1"');
    expect(session.view().issues).toContain('cf-error');
  });

  test('sends the band along with the map', () => {
    const doc = docOf(A, BAD);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);

    session.refresh();

    expect(last(host, 'map')?.issues).toContain('data-line="5"');
  });

  test('lights the whole line when the band is clicked', async () => {
    const doc = docOf(A, BAD);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'goto', line: 5 });

    expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [{ line: 4, start: 0, end: '  R1: resistr a1 a3'.length }] });
  });

  test('survives a row that points past the end of the document', async () => {
    // 閉じていないフェンスの YAML エラーは本文の 1 行先に出る。文書が
    // 2 行しかないのに帯は 3 行目を指すので、そのまま lineAt を呼ぶと
    // vscode が投げる (実際に踏める: 打ちかけのフェンスが文末にあるとき)。
    const doc = docOf(A, '```circuit\nparts: [');
    const host = hostOf([doc], at(doc, 1));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'goto', line: 3 });

    expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [{ line: 1, start: 0, end: 'parts: ['.length }] });
  });

  test('ignores a click on a row that carries no line', async () => {
    const doc = docOf(A, BAD);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();
    const before = host.lit.length;

    await session.handle({ kind: 'goto' });

    expect(host.lit).toHaveLength(before);
  });
});

describe('帯の行を押したら、その行を見せる', () => {
  test('asks for the text editor first, since the tab itself can be the map', () => {
    // circuit Editor ではその文書のテキストエディタが 1 つも開いていないことがある。
    // 光らせるだけでは、見える所に何も起きない。
    const doc = docOf(A, BAD);
    const shown: { uri: string; line: number }[] = [];
    const host = hostOf([doc], null, {
      showDocument: async (uri: string, line: number) => { shown.push({ uri, line }); },
    });
    const session = sessionOf(host, { pinned: doc });
    session.view();

    return session.handle({ kind: 'goto', line: 5 }).then(() => {
      expect(shown).toEqual([{ uri: A, line: 4 }]);
      expect(host.lit.at(-1)).toEqual({ uri: A, ranges: [{ line: 4, start: 0, end: '  R1: resistr a1 a3'.length }] });
    });
  });

  test('works without a host that can show documents', async () => {
    const doc = docOf(A, BAD);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'goto', line: 5 });

    expect(host.lit.at(-1)?.ranges).toHaveLength(1);
  });
});

describe('読めない知らせ', () => {
  test('says something when the map sends a move without a target', async () => {
    // webview は「R1 を b1 へ…」を出したまま待つ。黙って戻ると点が消えない。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'move', part: 'R1' });

    expect(last(host, 'status')?.text).toContain('読めません');
  });

  test('says something when the map sends a node move without a source', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'moveNode', to: 'b1' });

    expect(last(host, 'status')?.text).toContain('読めません');
  });
});

describe('消す・回す', () => {
  test('takes the part out of the fence and says so', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'delete', what: 'part', id: 'R1' });

    expect(doc.getText()).not.toContain('R1');
    expect(doc.getText()).toContain('C1');
    expect(last(host, 'status')?.text).toContain('消しました');
  });

  test('says how many wires went with the part', async () => {
    const doc = docOf(A, NPN);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'delete', what: 'part', id: 'Q1' });

    expect(doc.getText()).not.toContain('Q1.b');
    expect(last(host, 'status')?.text).toContain('配線 1 本');
  });

  test('takes out the wire written on that line', async () => {
    const doc = docOf(A, NPN);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    // 帯もマップも、配線はフェンスの中の行で指す (5 行目 = wires: の次)。
    await session.handle({ kind: 'delete', what: 'wire', id: '5' });

    expect(doc.getText()).not.toContain('a1 -- Q1.b');
    expect(doc.getText()).toContain('Q1: npn b5');
  });

  test('undoes a delete, because the copy is the whole body', async () => {
    // 桁の控えでは行の増減を戻せなかった。本文の控えなら 1 歩で戻る。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'delete', what: 'part', id: 'R1' });

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toBe(RC);
  });

  test('turns a two-terminal part a quarter clockwise', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'turn', part: 'R1', quarters: 1 });

    expect(doc.getText()).toContain('R1:  resistor a1 c1 10k');
  });

  test('flips the two ends round', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'flip', part: 'R1' });

    expect(doc.getText()).toContain('R1:  resistor a3 a1 10k');
  });

  test('turns a multi-terminal part by writing the orientation word', async () => {
    const doc = docOf(A, NPN);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'turn', part: 'Q1', quarters: 1 });

    expect(doc.getText()).toContain('  Q1: npn b5 r90');
  });

  test('says why a symbol that cannot be turned was left alone', async () => {
    const doc = docOf(A, VCC);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'turn', part: 'VCC', quarters: 1 });

    expect(doc.getText()).toBe(VCC);
    expect(last(host, 'status')?.text).toContain('回せません');
  });

  test('says something when the map sends a delete it cannot read', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'delete', what: 'part' });

    expect(last(host, 'status')?.text).toContain('読めません');
  });
});

describe('配線を引く', () => {
  test('writes a new wire line into the fence', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addWire', from: 'a1', to: 'c1' });

    expect(doc.getText()).toContain('wires:');
    expect(doc.getText()).toContain('- a1 -- c1');
    expect(last(host, 'status')?.text).toContain('引きました');
  });

  test('bends the way the map asked', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addWire', from: 'a1', to: 'c5', operator: '-|' });

    expect(doc.getText()).toContain('- a1 -| c5');
  });

  test('undoes a drawn wire, taking the line back out', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'addWire', from: 'a1', to: 'c1' });

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toBe(RC);
  });

  test('says so when an end cannot be read as an address', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addWire', from: 'a1', to: 'zz9' });

    expect(last(host, 'status')?.text).toContain('番地として読めません');
  });
});

describe('組み直し', () => {
  test('does not rebuild or resend the map when the source has not changed', () => {
    // 1 回の書き換えで組み直しが 2 度来る (文書が変わった知らせと、操作を捌いたあと)。
    // 同じ本文なら図を組み直さず、webview へも送り直さない — 送ると中身が入れ替わり、
    // 掴んでいたものとカーソルの下が捨てられる。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    session.refresh();
    const first = host.sent.filter((message) => message.kind === 'map').length;
    session.refresh();
    session.refresh();

    expect(host.sent.filter((message) => message.kind === 'map').length).toBe(first);
  });

  test('sends the map again once the source really changed', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    session.refresh();
    const before = host.sent.filter((message) => message.kind === 'map').length;

    await session.handle({ kind: 'addPart', type: 'ground', at: ['c5'] });

    expect(host.sent.filter((message) => message.kind === 'map').length).toBe(before + 1);
  });
});

describe('部品を置く', () => {
  test('writes a one-terminal part where the map said, naming it from the prefix', () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    return session.handle({ kind: 'addPart', type: 'ground', at: ['c5'] }).then(() => {
      expect(doc.getText()).toContain('G1: ground c5');
      expect(last(host, 'status')?.text).toContain('置きました');
    });
  });

  test('writes a two-terminal part between the two crossings', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addPart', type: 'inductor', at: ['c1', 'c3'] });

    expect(doc.getText()).toContain('L1: inductor c1 c3');
  });

  test('names a part whose id is drawn as a net name by its default, without asking', async () => {
    // port / vcc / vee は ID がそのまま図に出る。窓で止めず、既定の名前で置いて欄で直す。
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addPart', type: 'port', at: ['c5'] });
    await session.handle({ kind: 'addPart', type: 'vcc', at: ['c1'] });

    expect(doc.getText()).toContain('IN: port c5');
    expect(doc.getText()).toContain('VCC: vcc c1');
  });

  test('writes the part turned and flipped as the ghost showed it', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addPart', type: 'inductor', at: ['c1'], turn: 1, flip: false });

    expect(doc.getText()).toContain('L1: inductor c1 e1');
  });

  test('answers a preview with the crossings the part would take, without touching the document', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'preview', key: 'k1', what: 'place', type: 'inductor', to: 'c1', turn: 0, flip: false });

    const ghost = host.sent.find((message) => message.kind === 'ghost');
    expect(ghost).toMatchObject({ kind: 'ghost', key: 'k1', cells: ['c1', 'c3'], ok: true, why: '' });
    // **置く前の部品の絵も返す。** 図にまだ無い部品なので、写しの図から切り出す。
    // 名前は置いたときに付くもの (`GHOST` ではない)。
    expect(ghost?.chip).toContain('data-part="L1"');
    expect(ghost?.from).toEqual(['c1', 'c3']);
    expect(doc.getText()).toBe(RC);
  });

  test('answers a preview that cannot be placed with the reason, so it shows before the click', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'preview', key: 'k2', what: 'place', type: 'inductor', to: 'c99', turn: 0, flip: false });

    const ghost = host.sent.find((message) => message.kind === 'ghost');
    expect(ghost && 'ok' in ghost && ghost.ok).toBe(false);
    expect(ghost && 'why' in ghost ? ghost.why : '').not.toBe('');
  });

  test('previews a move with the crossings after the move', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'preview', key: 'k3', what: 'move', part: 'R1', to: 'b1' });

    const ghost = host.sent.find((message) => message.kind === 'ghost');
    // `from` は動かす前の穴。**殻はこれで運んでいる部品の絵を行き先へずらす**。
    expect(ghost).toEqual({
      kind: 'ghost', key: 'k3', cells: ['b1', 'b3'], ok: true, why: '', from: ['a1', 'a3'],
    });
  });

  test('says so when a crossing cannot be read as an address', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'addPart', type: 'ground', at: ['zz9'] });

    expect(last(host, 'status')?.text).toContain('番地として読めません');
  });

  test('undoes a placed part, taking the line back out', async () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    await session.handle({ kind: 'addPart', type: 'ground', at: ['c5'] });

    await session.handle({ kind: 'undo' });

    expect(doc.getText()).toBe(RC);
  });
});

describe('欄 (インスペクタ)', () => {
  const opened = () => {
    const doc = docOf(A, RC);
    const host = hostOf([doc], at(doc, 5));
    const session = sessionOf(host);
    session.view();
    return { doc, host, session };
  };

  test('sends what the fields hold when a part is picked', () => {
    const { host, session } = opened();

    session.handle({ kind: 'select', what: 'part', id: 'R1' });

    expect(last(host, 'fields')?.part).toMatchObject({ id: 'R1', type: 'resistor', value: '10k' });
  });

  test('closes the form when something that has no fields is picked', async () => {
    const { host, session } = opened();
    await session.handle({ kind: 'select', what: 'part', id: 'R1' });

    await session.handle({ kind: 'select', what: 'node', id: 'a1' });

    expect(last(host, 'fields')?.part).toBeNull();
  });

  test('writes a field the form changed', async () => {
    const { doc, host, session } = opened();

    await session.handle({ kind: 'setField', part: 'R1', field: 'value', text: '4k7' });

    expect(doc.getText()).toContain('R1:  resistor a1 a3 4k7');
    expect(last(host, 'status')?.text).toContain('値を 4k7 に');
  });

  test('takes a field away when the form was emptied', async () => {
    const { doc, session } = opened();

    await session.handle({ kind: 'setField', part: 'R1', field: 'value', text: '' });

    expect(doc.getText()).toContain('R1:  resistor a1 a3\n');
  });

  test('renames a part, carrying what points at it', async () => {
    const doc = docOf(A, NPN);
    const host = hostOf([doc], at(doc, 4));
    const session = sessionOf(host);
    session.view();

    await session.handle({ kind: 'rename', part: 'Q1', text: 'T1' });

    expect(doc.getText()).toContain('T1: npn b5');
    expect(doc.getText()).toContain('a1 -- T1.b');
    expect(last(host, 'status')?.text).toContain('改名しました');
  });

  test('says why a rename was refused, rather than half-doing it', async () => {
    const { doc, host, session } = opened();

    await session.handle({ kind: 'rename', part: 'R1', text: 'C1' });

    expect(doc.getText()).toBe(RC);
    expect(last(host, 'status')?.text).toContain('もう使われています');
  });

  test('says something when the form sends a field it cannot read', async () => {
    const { host, session } = opened();

    await session.handle({ kind: 'setField', part: 'R1', field: 'colour', text: 'red' });

    expect(last(host, 'status')?.text).toContain('読めませんでした');
  });
});

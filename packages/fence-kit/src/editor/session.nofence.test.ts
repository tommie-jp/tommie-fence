import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor } from './fenceEditor.ts';
import type { Outgoing } from './session.ts';

/**
 * **フェンスが 1 本も無い文書でも置ける** (52 の docs/54 の決め 7)。
 *
 * 前は「この文書に … フェンスがありません」と言って終わりだったので、
 * 新しい `.md` を開いた人は、まず字でフェンスを書かないと図を掴めなかった。
 * **エディターが主体**なら、置いた瞬間にフェンスができるほうが筋が通る。
 *
 * 作れるのは**頁やタブそのものがマップのとき**だけ。パネルがカーソルを追う
 * 形では、カーソルはフェンスの外を指していて、どの行に作るか決められない。
 */

const PLAIN = '# ただのノート\n\n本文だけで、フェンスは 1 本も無い。\n';
const MADE = ['# ただのノート', '', '本文だけで、フェンスは 1 本も無い。', '', '```fake', '```', ''];

const ok = () => ({ ok: true as const, value: { edits: [], diff: { lost: [], gained: [] } } });

type Call = readonly [string, ...unknown[]];

/** `made` が真なら、`createFence` のあとの文書はフェンスを 1 本持っている。 */
const open = (options: { readonly canCreate?: boolean; readonly pinned?: boolean } = {}) => {
  const calls: Call[] = [];
  let made = false;
  const text = (): string => (made ? MADE.join('\n') : PLAIN);

  const editor: FenceEditor = {
    language: 'fake',
    fences: () => (made ? [{ line: 5, title: null }] : []),
    fenceAt: (_markdown, line) => (made && line >= 5 && line <= 6 ? { line: 5, source: '', indents: [] } : null),
    firstFence: () => (made ? { line: 5, source: '', indents: [] } : null),
    view: () => ({ map: '<svg class="cf-map"></svg>', issues: '' }),
    aimAt: () => null,
    spansOf: () => [],
    fieldsOf: () => null,
    colorNames: () => '',
    nameOf: (handle) => handle,
    nextId: () => 'X1',
    cellsOf: () => [],
    foldsWire: true,
    fine: null,
    step: () => null,
    stepsTo: () => null,
    palette: () => '<button data-type="resistor" data-ends="2"></button>',
    typeNames: () => '',
    movePart: () => ok(),
    movePoint: () => ok(),
    addPart: (_s, part) => { calls.push(['addPart', part.id, part.type, part.at]); return ok(); },
    duplicate: () => ok(),
    addWire: (_s, from, to) => { calls.push(['addWire', from, to]); return ok(); },
    deletePart: () => ok(),
    deleteWire: () => ok(),
    rename: () => ok(),
    setField: () => ok(),
    turn: () => ok(),
    flip: () => ok(),
  };

  const doc = {
    uri: { toString: () => 'file:///plain.md' },
    getText: text,
    lineCount: () => text().split('\n').length,
    lineAt: (line: number) => ({ text: text().split('\n')[line] ?? '' }),
  };
  const sent: Outgoing[] = [];
  const host = {
    post: (message: Outgoing) => sent.push(message),
    documents: () => [doc],
    activeEditor: () => null,
    openDocument: () => doc,
    applyEdits: async () => true,
    replaceBody: async () => true,
    highlight: () => {},
    copyText: async () => {},
    ...(options.canCreate === false ? {} : {
      createFence: async (_document: unknown, language: string) => {
        calls.push(['createFence', language]);
        made = true;
        return 5;
      },
    }),
  };

  const session = createSession(host as never, [editor], options.pinned === false ? {} : { pinned: doc as never });
  const status = (): string => [...sent].reverse().find((one) => one.kind === 'status')?.text ?? '';
  return { session, calls, sent, status };
};

describe('フェンスが無い文書', () => {
  test('置くと、まずフェンスを作ってからそこへ置く', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'addPart', type: 'resistor', at: ['b3'] });

    expect(calls).toEqual([['createFence', 'fake'], ['addPart', 'X1', 'resistor', ['b3']]]);
  });

  test('配線を引くときも同じ', async () => {
    const { session, calls } = open();

    await session.handle({ kind: 'addWire', from: 'a1', to: 'a3' });

    expect(calls[0]).toEqual(['createFence', 'fake']);
  });

  // **升目は出す。** 出さないと、パレットから種類を選んでも押す場所が無い。
  test('フェンスが無くても升目は出る', () => {
    const { session } = open();

    expect(session.view().html).toContain('cf-map');
  });

  test('升目の下に、置くと作ることを出す', () => {
    const { session } = open();

    expect(session.view().issues).toContain('フェンスがありません');
  });

  // **作れないときは今までどおり。** パネルがカーソルを追う形では、
  // どの行に作るかを決められない。
  test('文書を固定していなければ、今までどおり理由を言って終わる', async () => {
    const { session, calls, status } = open({ pinned: false });

    await session.handle({ kind: 'addPart', type: 'resistor', at: ['b3'] });

    expect(calls).toEqual([]);
    expect(status()).toContain('フェンス');
  });

  test('作る口を持たない殻では、今までどおり案内を出す', () => {
    const { session } = open({ canCreate: false });

    expect(session.view().html).toContain('フェンスがありません');
  });
});

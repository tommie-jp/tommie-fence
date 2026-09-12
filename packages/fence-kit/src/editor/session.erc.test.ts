import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor, FenceView } from './fenceEditor.ts';
import type { Outgoing } from './session.ts';

/**
 * **検査 (ERC) は帯の「検査 N」の釦の向こうに畳む** (52 の docs/52・55)。
 *
 * 件数は常に数えて釦に出し、中身は押したときだけ広げる。押した状態は
 * セッションが持つ (文書には書かない) ので、開き直すと畳んだ状態に戻る。
 */

const FENCE = ['```fake', 'R1: resistor a1 a3', '```', ''];
const MARKDOWN = FENCE.join('\n');
const ok = () => ({ ok: true as const, value: { edits: [], diff: { lost: [], gained: [] } } });

/** `'none'` は「ERC を持たないフェンス」。**既定の引数は使わない** — `undefined` を
 *  渡しても既定が効いてしまい、持たない場合を書き分けられない。 */
const open = (erc: FenceView['erc'] | 'none' = { count: 2, html: '<ul class="cf-issues">2 件</ul>' }) => {
  const view: FenceView = {
    map: '<svg class="cf-map"></svg>',
    issues: '<ul></ul>',
    ...(erc === 'none' ? {} : { erc }),
  };
  const editor: FenceEditor = {
    language: 'fake',
    fences: () => [{ line: 1, title: null }],
    fenceAt: (_markdown, line) => (line >= 1 && line <= 3 ? { line: 1, source: 'R1: resistor a1 a3\n', indents: [] } : null),
    firstFence: () => ({ line: 1, source: 'R1: resistor a1 a3\n', indents: [] }),
    view: () => view,
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
    palette: () => '',
    typeNames: () => '',
    movePart: () => ok(),
    movePoint: () => ok(),
    addPart: () => ok(),
    duplicate: () => ok(),
    addWire: () => ok(),
    deletePart: () => ok(),
    deleteWire: () => ok(),
    rename: () => ok(),
    setField: () => ok(),
    turn: () => ok(),
    flip: () => ok(),
  };

  const doc = {
    uri: { toString: () => 'file:///a.md' },
    getText: () => MARKDOWN,
    lineCount: FENCE.length,
    lineAt: (line: number) => ({ text: FENCE[line] ?? '' }),
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
  };

  const session = createSession(host as never, [editor], { pinned: doc as never });
  return { session, sent };
};

describe('検査の釦', () => {
  test('件数は畳んでいても出す', () => {
    const { session } = open();

    expect(session.view().erc).toEqual({ count: 2, open: false, html: '' });
  });

  // **畳んでいるときは中身を送らない。** 送っても出さないなら、webview まで
  // 運ぶ意味が無い (書き換えのたびに運ぶことになる)。
  test('畳んでいるうちは中身を送らない', () => {
    const { session } = open();

    expect(session.view().erc?.html).toBe('');
  });

  test('押すと広がり、中身が付いてくる', async () => {
    const { session, sent } = open();

    await session.handle({ kind: 'erc' });

    const view = [...sent].reverse().find((one) => one.kind === 'map');
    expect(view).toMatchObject({ erc: { count: 2, open: true, html: '<ul class="cf-issues">2 件</ul>' } });
  });

  test('もう一度押すと畳む', async () => {
    const { session } = open();

    await session.handle({ kind: 'erc' });
    await session.handle({ kind: 'erc' });

    expect(session.view().erc?.open).toBe(false);
  });

  // **持たないフェンスでは釦を組まない。** 数えるものが無いのに常に 0 の釦は、
  // 狭い帯のノイズにしかならない (breadboard は ERC を持たない)。
  test('ERC を持たないフェンスでは erc を出さない', () => {
    const { session } = open('none');

    expect(session.view().erc).toBeUndefined();
  });

  test('件数 0 でも釦は出す (数えた結果が 0 だと分かる)', () => {
    const { session } = open({ count: 0, html: '' });

    expect(session.view().erc).toEqual({ count: 0, open: false, html: '' });
  });
});

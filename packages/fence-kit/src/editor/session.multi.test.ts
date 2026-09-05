import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';
import type { FenceEditor } from './fenceEditor.ts';

/**
 * **1 つの殻で 2 つ以上のフェンスを扱う** (52 の docs/19 の手順 1〜2)。
 * 実装は各パッケージが持つので、ここでは言語の違う張りぼてを 2 つ渡して、
 * 「いまのフェンスの言語で引く」ところだけを見る。
 */
const fenceOf = (language: string, mark: string): FenceEditor => ({
  language,
  fences: (markdown) => (markdown.includes(mark) ? [{ line: markdown.split('\n').indexOf(mark) + 1, title: null }] : []),
  fenceAt: (markdown, line) => {
    const at = markdown.split('\n').indexOf(mark) + 1;
    return at > 0 && line >= at && line <= at + 2 ? { line: at, source: language, indents: [] } : null;
  },
  firstFence: (markdown) => (markdown.includes(mark) ? { line: markdown.split('\n').indexOf(mark) + 1, source: language, indents: [] } : null),
  view: (source) => ({ map: `<svg data-of="${source}"></svg>`, issues: '' }),
  aimAt: () => null,
  spansOf: () => [],
  fieldsOf: () => null,
  colorNames: () => '',
  nameOf: (handle) => handle,
  nextId: () => 'X1',
  cellsOf: () => [],
  foldsWire: false,
  step: () => null,
  stepsTo: () => null,
  palette: () => `<p>${language}</p>`,
  typeNames: () => '',
  movePart: () => ({ ok: false, error: { message: '', line: null } }),
  movePoint: () => ({ ok: false, error: { message: '', line: null } }),
  addPart: () => ({ ok: false, error: { message: '', line: null } }),
  duplicate: () => ({ ok: false, error: { message: '', line: null } }),
  addWire: () => ({ ok: false, error: { message: '', line: null } }),
  deletePart: () => ({ ok: false, error: { message: '', line: null } }),
  deleteWire: () => ({ ok: false, error: { message: '', line: null } }),
  rename: () => ({ ok: false, error: { message: '', line: null } }),
  setField: () => ({ ok: false, error: { message: '', line: null } }),
  turn: () => ({ ok: false, error: { message: '', line: null } }),
  flip: () => ({ ok: false, error: { message: '', line: null } }),
});

const MARKDOWN = ['```one', 'x', '```', '', '```two', 'y', '```'].join('\n');

const docOf = () => ({
  uri: { toString: () => 'file:///a.md' },
  getText: () => MARKDOWN,
  lineCount: MARKDOWN.split('\n').length,
  lineAt: (line: number) => ({ text: MARKDOWN.split('\n')[line] ?? '' }),
});

const sessionOf = () => {
  const doc = docOf();
  const host = {
    post: () => {},
    documents: () => [doc],
    activeEditor: () => null,
    applyEdits: async () => true,
    replaceBody: async () => true,
    highlight: () => {},
  };
  return createSession(host as never, [fenceOf('one', '```one'), fenceOf('two', '```two')], { pinned: doc as never });
};

describe('1 つの殻で 2 つのフェンス', () => {
  test('lists both fences, in the order they are written, with the language on each', () => {
    const picker = sessionOf().view().picker;

    expect(picker).toContain('one');
    expect(picker).toContain('two');
    expect(picker.indexOf('one')).toBeLessThan(picker.indexOf('two'));
  });

  test('draws the first fence, whichever language it is', () => {
    // どちらの実装に訊くかは**いまのフェンス**で決まる。
    expect(sessionOf().view().html).toContain('data-of="one"');
  });

  test('sends the vocabulary of the fence it is showing, so the palette follows the language', () => {
    // **語彙も言語ごと。** 最初の HTML に焼き込むと、言語をまたいだときに
    // 最初に開いた言語のパレットが残る (畳んだあと実測で見つけた)。
    expect(sessionOf().view().chrome.palette).toBe('<p>one</p>');
  });

  test('sends the vocabulary again with every map, not just the first one', () => {
    // 送り直しに乗っていないと、受け手 (webview) が入れ替えようがない。
    const posted: { kind: string; chrome?: { palette: string } }[] = [];
    const doc = docOf();
    const host = {
      post: (message: { kind: string }) => posted.push(message),
      documents: () => [doc],
      activeEditor: () => null,
      applyEdits: async () => true,
      replaceBody: async () => true,
      highlight: () => {},
    };
    const live = createSession(host as never, [fenceOf('one', '```one'), fenceOf('two', '```two')], { pinned: doc as never });

    live.refresh();

    expect(posted.find((one) => one.kind === 'map')?.chrome?.palette).toBe('<p>one</p>');
  });
});

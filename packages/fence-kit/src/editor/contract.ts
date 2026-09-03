import { applyRewrite } from './lines.ts';
import type { FenceEditor } from './fenceEditor.ts';

/**
 * **殻がフェンスに求めることを、3 つとも同じ手で確かめる。**
 *
 * `FenceEditor` は文字列で話す約束なので、殻の側からは「置ける種類だと言ったのに
 * 置けない」「置いたのに穴を返さない」といった食い違いが**型では見えない**。
 * 実際、パレットに出ている 3 本足 5 種がどれも置けない状態が版をまたいで残った
 * (52 の docs/16)。そこで**パレットが出す種類を数えて、全部を通す**。
 *
 * vitest は使わない — 見つけたことを字にして返すだけの純関数にして、
 * 各パッケージのテストが `expect(...).toEqual([])` する
 * (fence-kit は 3 つのフェンスに依存できないので、実装を渡してもらう)。
 */

/** 契約を確かめるための、そのフェンスの見本。 */
export type ContractFixture = {
  /** 読める本文。部品が 1 つ以上あり、`parts:` は行ごとに書いてある。 */
  readonly source: string;
  /** 何も無い穴 (そこへ置く・動かす)。まわりに部品 1 つぶんの余地があること。 */
  readonly room: string;
  /** `source` にある部品の名札。 */
  readonly part: string;
  /** その部品を動かす先 (板の上で、`room` とは別の穴)。 */
  readonly moveTo: string;
};

/** パレットの markup から、置ける種類を取り出す (webview が見るのと同じ印)。 */
export const paletteTypes = (markup: string): readonly string[] =>
  [...markup.matchAll(/data-type="([^"]+)"/g)].map((found) => found[1] ?? '');

/** その種類は 2 端子か (webview が見るのと同じ印)。 */
export const paletteTwoEnds = (markup: string, type: string): boolean =>
  new RegExp(`data-type="${type}"[^>]*data-ends="2"`).test(markup)
  || new RegExp(`data-ends="2"[^>]*data-type="${type}"`).test(markup);

const failed = (result: { readonly ok: boolean }): string =>
  ('error' in result && typeof result.error === 'object' && result.error !== null && 'message' in result.error
    ? String(result.error.message)
    : '理由なし');

/**
 * 契約を確かめる。**破れているものを字にして並べる** (何も無ければ空)。
 * 数えるのは、殻が実際に通る道だけ。
 */
export function checkFenceEditor(editor: FenceEditor, fixture: ContractFixture): readonly string[] {
  const problems: string[] = [];
  const say = (message: string): void => { problems.push(message); };
  const { source, room, part, moveTo } = fixture;

  // --- 見本そのもの (これが読めないと以下が全部嘘になる) ---
  if (editor.view(source, 1).map === '') say('見本の図が空です');
  if (editor.cellsOf(source, part).length === 0) say(`見本の部品 ${part} の穴を返しません`);
  if (typeof editor.foldsWire !== 'boolean') say('foldsWire が真偽値ではありません');

  // --- パレットに出る種類は、全部 1 クリックで置けること ---
  const markup = editor.palette();
  const types = paletteTypes(markup);
  if (types.length === 0) say('パレットに置ける種類がありません');

  for (const type of types) {
    const id = editor.nextId(source, type);
    if (id === null) {
      say(`${type}: パレットに出ているのに名前を付けられません`);
      continue;
    }
    // **マップは押した穴を 1 つ送るだけ。** 足の並べ方はフェンスが決める。
    const placed = editor.addPart(source, { id, type, at: [room] });
    if (!placed.ok) {
      say(`${type}: 穴 1 つで置けません (${failed(placed)})`);
      continue;
    }
    const after = applyRewrite(source, placed.value);
    if (editor.cellsOf(after, id).length === 0) {
      say(`${type}: 置いたのに ${id} の穴を返しません`);
    }
    // ゴーストは同じ関数を通る。**見せる物と書く物が食い違わない**ことを見る。
    const trial = editor.addPart(source, { id, type, at: [room], preview: true });
    if (!trial.ok) {
      say(`${type}: 本番は置けるのに試し当てが断られます (${failed(trial)})`);
    } else if (applyRewrite(source, trial.value) !== after) {
      say(`${type}: 試し当てと本番で書く行が違います`);
    }
    // 2 端子は間隔を選べる (穴 2 つでも置ける)。
    if (paletteTwoEnds(markup, type) && !editor.addPart(source, { id, type, at: [room, moveTo] }).ok) {
      say(`${type}: 2 端子なのに穴 2 つで置けません`);
    }
  }

  // --- 掴んで動かす・消す ---
  const moved = editor.movePart(source, part, moveTo);
  if (!moved.ok) {
    say(`${part} を ${moveTo} へ動かせません (${failed(moved)})`);
  } else if (!editor.cellsOf(applyRewrite(source, moved.value), part).includes(moveTo)) {
    say(`${part} を動かしたのに ${moveTo} を返しません`);
  }

  const removed = editor.deletePart(source, part);
  if (!removed.ok) {
    say(`${part} を消せません (${failed(removed)})`);
  } else if (editor.cellsOf(applyRewrite(source, removed.value), part).length > 0) {
    say(`${part} を消したのに、まだ穴を返します`);
  }

  // --- 欄と光らせる先 ---
  const fields = editor.fieldsOf(source, part);
  if (fields === null) say(`${part} の欄がありません`);
  else if (fields.id !== editor.nameOf(part)) say(`${part} の欄の名前が名札と合いません`);
  if (editor.spansOf(source, 'part', part).length === 0) say(`${part} を書いている場所が分かりません`);

  return problems;
}

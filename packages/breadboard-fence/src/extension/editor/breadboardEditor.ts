import { renderIssues } from 'fence-kit';
import type { EditResult, FenceEditor } from 'fence-kit';
import { issuesOf, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt } from '../../core/edit/map.ts';
import { insertWire } from '../../core/edit/insert.ts';
import { movePart, movablePartIds, partSpans } from '../../core/edit/move.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import { deletePart, deleteWire } from '../../core/edit/remove.ts';
import { extractBreadboardFences } from '../../core/fences.ts';
import { renderBreadboard } from '../../core/index.ts';
import { parseAddress } from '../../core/model/address.ts';
import { normalizeNewlines } from '../../core/newlines.ts';
import { parseFence } from '../../core/parser/parseFence.ts';
import type { Address } from '../../core/types.ts';

/**
 * breadboard フェンスの編集を、殻が求める形 (`FenceEditor`) に束ねる。
 * **ここが穴の綴りを知る唯一の場所** — 殻は文字列で話す (52 の docs/13)。
 *
 * **マップは図そのもの。** circuit は別の升目 (似顔絵) を組むが、こちらは
 * 自分で SVG を組んでいて穴の座標が線形に出るので、図の上に透明な層を
 * 重ねるだけでよい (`renderBreadboard(source, { edit: true })`)。
 */

/** まだ作っていない操作。**黙って何もしない**のではなく、そう言って断る。 */
const notYet = (what: string): EditResult =>
  ({ ok: false, error: { message: `${what}はまだマップからできません (テキストで書きます)`, line: null } });

const unreadable = (written: string): EditResult =>
  ({ ok: false, error: { message: `穴として読めません: ${written}`, line: null } });

const readAddress = (written: string): Address | null => parseAddress(written);

export function createBreadboardEditor(): FenceEditor {
  return {
    language: 'breadboard',

    fences: (markdown) => extractBreadboardFences(markdown).map((fence) => ({
      line: fence.line,
      title: parseFence(normalizeNewlines(fence.source)).doc?.title ?? null,
    })),
    fenceAt,
    firstFence: (markdown) => extractBreadboardFences(markdown)[0] ?? null,

    view: (source, fenceLine) => ({
      // **図そのものが升目。** 掴む層は編集のときだけ重なる。
      map: renderBreadboard(source, { edit: true }).svg,
      issues: renderIssues(shiftIssues(issuesOf(source), fenceLine)),
    }),

    aimAt,

    spansOf: (source, what, id) => {
      if (what !== 'node') return partSpans(source, id);
      const at = readAddress(id);
      return at === null ? [] : nodeSpans(source, at);
    },

    // 欄 (インスペクタ) はまだ無い。**null は「欄を閉じる」**なので黙って閉じる。
    fieldsOf: () => null,

    // 名札は「同じ名前が 2 つ以上あるとき」に要る。breadboard の ID は
    // 配線から指すための名前なので重ならない — 名札はそのまま名前。
    nameOf: (handle) => handle,
    nextId: () => null,
    nameHint: () => '',

    palette: () => '',
    typeNames: () => '',

    movePart: (source, handle, to) => {
      const at = readAddress(to);
      if (at === null) return unreadable(to);
      if (!movablePartIds(source).includes(handle)) {
        return { ok: false, error: { message: `動かせる部品ではありません: ${handle}`, line: null } };
      }
      return movePart(source, handle, at);
    },

    movePoint: (source, from, to) => {
      const at = readAddress(from);
      const target = readAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      return movePoint(source, at, target);
    },

    deletePart,
    deleteWire,

    addWire: (source, from, to) => {
      const at = readAddress(from);
      const target = readAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      return insertWire(source, at, target);
    },

    // 残りは第 2 段の続き (52 の docs/13 の手順 6)。**できないことは、できないと言う。**
    addPart: () => notYet('部品を置くの'),
    rename: () => notYet('名前を変えるの'),
    setField: () => notYet('欄の書き換えは'),
    turn: () => notYet('回すの'),
    flip: () => notYet('反転は'),
  };
}

import { renderIssues } from 'fence-kit';
import type { EditResult, FenceEditor } from 'fence-kit';
import { normalizeNewlines } from 'fence-kit';
import { issuesOf, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt } from '../../core/edit/map.ts';
import { movePart, movablePartIds, partSpans } from '../../core/edit/move.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import { extractPerfboardFences } from '../../core/fences.ts';
import { renderPerfboard } from '../../core/index.ts';
import { parseAddress } from '../../core/model/address.ts';
import { parseFence } from '../../core/parser/parseFence.ts';

/**
 * perfboard フェンスの編集を、殻が求める形 (`FenceEditor`) に束ねる。
 * **ここが穴の綴りを知る唯一の場所** — 殻は文字列で話す (52 の docs/13)。
 *
 * **マップは図そのもの。** 格子が一様なので、図の上に透明な層を重ねるだけで
 * 掴める (`renderPerfboard(source, { edit: true })`)。
 */

/** まだ作っていない操作。**黙って何もしない**のではなく、そう言って断る。 */
const notYet = (what: string): EditResult =>
  ({ ok: false, error: { message: `${what}はまだマップからできません (テキストで書きます)`, line: null } });

const unreadable = (written: string): EditResult =>
  ({ ok: false, error: { message: `穴として読めません: ${written}`, line: null } });

export function createPerfboardEditor(): FenceEditor {
  return {
    language: 'perfboard',

    fences: (markdown) => extractPerfboardFences(markdown).map((fence) => ({
      line: fence.line,
      title: parseFence(normalizeNewlines(fence.source)).doc?.title ?? null,
    })),
    fenceAt,
    firstFence: (markdown) => extractPerfboardFences(markdown)[0] ?? null,

    view: (source, fenceLine) => ({
      // **図そのものが升目。** 掴む層は編集のときだけ重なる。
      map: renderPerfboard(source, { edit: true }).svg,
      issues: renderIssues(shiftIssues(issuesOf(source), fenceLine)),
    }),

    aimAt,

    spansOf: (source, what, id) => {
      if (what !== 'node') return partSpans(source, id);
      const at = parseAddress(id);
      return at === null ? [] : nodeSpans(source, at);
    },

    // 欄 (インスペクタ) はまだ無い。**null は「欄を閉じる」**なので黙って閉じる。
    fieldsOf: () => null,

    // 部品の ID は配線から指すための名前なので重ならない — 名札はそのまま名前。
    nameOf: (handle) => handle,
    nextId: () => null,
    nameHint: () => '',

    palette: () => '',
    typeNames: () => '',

    movePart: (source, handle, to) => {
      const at = parseAddress(to);
      if (at === null) return unreadable(to);
      if (!movablePartIds(source).includes(handle)) {
        return { ok: false, error: { message: `動かせる部品ではありません: ${handle}`, line: null } };
      }
      return movePart(source, handle, at);
    },

    movePoint: (source, from, to) => {
      const at = parseAddress(from);
      const target = parseAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      return movePoint(source, at, target);
    },

    // 第 2 段で作る (52 の docs/13 の手順 6)。**できないことは、できないと言う。**
    addPart: () => notYet('部品を置くの'),
    addWire: () => notYet('配線を引くの'),
    deletePart: () => notYet('部品を消すの'),
    deleteWire: () => notYet('配線を消すの'),
    rename: () => notYet('名前を変えるの'),
    setField: () => notYet('欄の書き換えは'),
    turn: () => notYet('回すの'),
    flip: () => notYet('反転は'),
  };
}

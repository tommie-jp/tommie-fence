import { renderIssues } from 'fence-kit';
import type { EditResult, FenceEditor } from 'fence-kit';
import { renderPalette, renderTypeOptions } from '../../core/edit/palette.ts';
import { partFields, setField } from '../../core/edit/field.ts';
import type { PartField } from '../../core/edit/field.ts';
import { issuesOf, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt } from '../../core/edit/map.ts';
import { insertPart, insertWire, nextPartId } from '../../core/edit/insert.ts';
import { renamePart } from '../../core/edit/rename.ts';
import { flipPart, turnPart } from '../../core/edit/turn.ts';
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

    fieldsOf: partFields,

    // 名札は「同じ名前が 2 つ以上あるとき」に要る。breadboard の ID は
    // 配線から指すための名前なので重ならない — 名札はそのまま名前。
    nameOf: (handle) => handle,
    // ID がそのまま図に出る種類は無い (どれも接頭辞で名前が付く)。
    nameHint: () => '',

    palette: renderPalette,
    typeNames: renderTypeOptions,
    nextId: nextPartId,

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

    rename: renamePart,

    setField: (source, handle, field, text) => (
      field === 'type' || field === 'value' || field === 'label'
        ? setField(source, handle, field as PartField, text)
        : { ok: false, error: { message: `書き換えられない欄です: ${field}`, line: null } }
    ),

    addPart: (source, part) => {
      const at = part.at.map((one) => readAddress(one));
      const bad = at.indexOf(null);
      if (bad >= 0) return unreadable(part.at[bad] ?? '');
      return insertPart(source, { id: part.id, type: part.type, at: at as NonNullable<typeof at[number]>[] });
    },
    turn: turnPart,
    flip: flipPart,
  };
}

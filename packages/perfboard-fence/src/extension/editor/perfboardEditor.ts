import { renderIssues } from 'fence-kit';
import type { EditResult, FenceEditor } from 'fence-kit';
import { normalizeNewlines } from 'fence-kit';
import { renderPalette, renderTypeOptions } from '../../core/edit/palette.ts';
import { partFields, setField } from '../../core/edit/field.ts';
import type { PartField } from '../../core/edit/field.ts';
import { issuesOf, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt } from '../../core/edit/map.ts';
import { insertPart, insertWire, nextPartId, partCells } from '../../core/edit/insert.ts';
import { renamePart } from '../../core/edit/rename.ts';
import { flipPart, turnPart } from '../../core/edit/turn.ts';
import { movePart, movablePartIds, partSpans } from '../../core/edit/move.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import { deletePart, deleteWire } from '../../core/edit/remove.ts';
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

const unreadable = (written: string): EditResult =>
  ({ ok: false, error: { message: `穴として読めません: ${written}`, line: null } });

const readAddress = (written: string) => parseAddress(written);

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
      const at = readAddress(id);
      return at === null ? [] : nodeSpans(source, at);
    },

    fieldsOf: partFields,

    // 部品の ID は配線から指すための名前なので重ならない — 名札はそのまま名前。
    nameOf: (handle) => handle,
    cellsOf: partCells,
    // 配線は穴から穴へ 1 本 (折れの綴りが文法に無い)。
    foldsWire: false,

    palette: renderPalette,
    typeNames: renderTypeOptions,
    nextId: nextPartId,

    movePart: (source, handle, to, trial) => {
      const at = readAddress(to);
      if (at === null) return unreadable(to);
      if (!movablePartIds(source).includes(handle)) {
        return { ok: false, error: { message: `動かせる部品ではありません: ${handle}`, line: null } };
      }
      return movePart(source, handle, at, trial?.preview === true);
    },

    movePoint: (source, from, to, trial) => {
      const at = readAddress(from);
      const target = readAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      return movePoint(source, at, target, trial?.preview === true);
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
      field === 'type' || field === 'value'
        ? setField(source, handle, field as PartField, text)
        : { ok: false, error: { message: `この文法に ${field} の欄はありません`, line: null } }
    ),

    addPart: (source, part) => {
      const at = part.at.map((one) => readAddress(one));
      const bad = at.indexOf(null);
      if (bad >= 0) return unreadable(part.at[bad] ?? '');
      return insertPart(source, {
        id: part.id,
        type: part.type,
        at: at as NonNullable<typeof at[number]>[],
        turn: part.turn ?? 0,
        flip: part.flip ?? false,
        preview: part.preview ?? false,
      });
    },
    turn: turnPart,
    flip: flipPart,
  };
}

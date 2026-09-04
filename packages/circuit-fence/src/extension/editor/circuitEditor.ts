import { listFences } from '../../core/edit/fenceList.ts';
import { partFields, setField } from '../../core/edit/field.ts';
import type { PartField } from '../../core/edit/field.ts';
import { nameOfHandle } from '../../core/edit/handles.ts';
import { issuesOf, renderIssues, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt, gridMap, partCells } from '../../core/edit/map.ts';
import { renderMapHtml } from '../../core/edit/mapSvg.ts';
import { duplicatePart, insertPart, insertWire, nextPartId } from '../../core/edit/insert.ts';
import { movePart, partSpans, stepCell } from '../../core/edit/move.ts';
import { renderPalette, renderTypeOptions } from '../../core/edit/palette.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import { deletePart, deleteWire } from '../../core/edit/remove.ts';
import { flipPart, turnPart } from '../../core/edit/turn.ts';
import { extractCircuitFences } from '../../core/fences.ts';
import { formatAddress, parseAddress } from '../../core/model/address.ts';
import type { Address } from '../../core/model/address.ts';
import { renamePart } from '../../core/edit/rename.ts';
import type { EditResult, FenceEditor, NewPart } from 'fence-kit';
import { isWireHandle, renderColorOptions, wireFields } from '../../core/edit/wireField.ts';
import {
  deleteNote, duplicateNote, flipNote, isNoteHandle, moveNote, noteCells, noteFields, noteLineOf, noteSpans,
  setNoteField, turnNote,
} from '../../core/edit/note.ts';

/**
 * circuit フェンスの編集エンジンを、殻が求める形 (`FenceEditor`) に束ねる。
 *
 * **ここが番地の綴りを知る唯一の場所**になる。殻は文字列で話し、読めない綴りは
 * この中で断って行番号つきのお知らせにする (今まで `session.ts` が
 * `parseAddress` を 7 か所で呼んでいたのを、こちらへ寄せた)。
 */

/** 番地として読めなかったときの断り。**綴りをそのまま見せる** (直す手がかり)。 */
const unreadable = (written: string): EditResult =>
  ({ ok: false, error: { message: `番地として読めません: ${written}`, line: null } });

/** 書ける欄。ほかの綴りが来たら断る (webview からの知らせは信用しない)。 */
const FIELDS: readonly string[] = ['type', 'value', 'label'];

export function createCircuitEditor(): FenceEditor {
  /** 番地の並びを読む。1 つでも読めなければ、その綴りを名指して断る。 */
  const addresses = (written: readonly string[]): readonly Address[] | string => {
    const parsed = written.map((one) => parseAddress(one));
    const bad = parsed.indexOf(null);
    return bad >= 0 ? (written[bad] ?? '') : (parsed as readonly Address[]);
  };

  return {
    language: 'circuit',

    fences: listFences,
    fenceAt,
    firstFence: (markdown) => extractCircuitFences(markdown)[0] ?? null,

    view: (source, fenceLine) => {
      const issues = issuesOf(source);
      // **絵に印を付けるのは読めなかった行だけ。** お知らせは読めているので、
      // 同じ赤で囲むと「間違い」に見えてしまう (帯には別の色で並ぶ)。
      const bad = new Set(
        issues
          .filter((issue) => issue.kind === 'error')
          .map((issue) => issue.error.line)
          .filter((line): line is number => line !== null),
      );
      return {
        map: renderMapHtml(gridMap(source), bad),
        // 帯は Markdown の行で出す。押すとそこへ飛べる (フェンスの中の行では飛べない)。
        issues: renderIssues(shiftIssues(issues, fenceLine)),
      };
    },

    aimAt: (source, line, column) => {
      const aim = aimAt(source, line, column);
      if (aim === null) return null;
      // **殻へは文字列で返す** (番地の型を持ち込ませない)。
      const id = aim.kind === 'part' ? aim.id
        : aim.kind === 'node' ? formatAddress(aim.address)
          : String(aim.line);
      return { kind: aim.kind, id };
    },

    spansOf: (source, what, id) => {
      if (isNoteHandle(id)) return noteSpans(source, id);
      if (what !== 'node') return partSpans(source, id);
      const at = parseAddress(id);
      return at === null ? [] : nodeSpans(source, at);
    },

    fieldsOf: (source, handle) => {
      if (isNoteHandle(handle)) return noteFields(source, handle);
      if (isWireHandle(handle)) return wireFields(source, handle);
      return partFields(source, handle);
    },
    // 注釈には名前が無いので、名札は行番号。人に見せるときは「注釈」と呼ぶ。
    nameOf: (handle) => (isNoteHandle(handle) ? `注釈 (${noteLineOf(handle) ?? '?'} 行目)` : nameOfHandle(handle)),
    nextId: nextPartId,
    cellsOf: (source, handle) => (isNoteHandle(handle) ? noteCells(source, handle) : partCells(source, handle)),
    // 配線は `-|` / `|-` で折れる (`Shift` を押しながら放す)。
    foldsWire: true,
    step: stepCell,

    palette: renderPalette,
    typeNames: renderTypeOptions,
    colorNames: renderColorOptions,

    movePart: (source, handle, to, trial) => {
      const at = parseAddress(to);
      if (at === null) return unreadable(to);
      if (isNoteHandle(handle)) return moveNote(source, handle, at);
      return movePart(source, handle, at, trial?.preview === true);
    },

    movePoint: (source, from, to, trial) => {
      const at = parseAddress(from);
      const target = parseAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      return movePoint(source, at, target, trial?.preview === true);
    },

    addPart: (source, part: NewPart) => {
      const at = addresses(part.at);
      return typeof at === 'string'
        ? unreadable(at)
        : insertPart(source, {
          id: part.id,
          type: part.type,
          at,
          turn: part.turn ?? 0,
          flip: part.flip ?? false,
          preview: part.preview ?? false,
        });
    },

    addWire: (source, from, to, operator) => {
      const at = parseAddress(from);
      const target = parseAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      const how = operator === '-|' || operator === '|-' ? operator : '--';
      return insertWire(source, { kind: 'cell', address: at }, { kind: 'cell', address: target }, how);
    },

    deletePart: (source, handle) => (isNoteHandle(handle) ? deleteNote(source, handle) : deletePart(source, handle)),
    deleteWire,
    rename: renamePart,

    setField: (source, handle, field, text) => (
      isNoteHandle(handle)
        ? setNoteField(source, handle, field, text)
        : FIELDS.includes(field)
        ? setField(source, handle, field as PartField, text)
        : { ok: false, error: { message: `書き換えられない欄です: ${field}`, line: null } }
    ),

    duplicate: (source, handle, id) => (isNoteHandle(handle) ? duplicateNote(source, handle) : duplicatePart(source, handle, id)),
    turn: (source, handle, quarters) => (
      isNoteHandle(handle) ? turnNote(source, handle, quarters) : turnPart(source, handle, quarters)
    ),
    flip: (source, handle) => (isNoteHandle(handle) ? flipNote(source, handle) : flipPart(source, handle)),
  };
}

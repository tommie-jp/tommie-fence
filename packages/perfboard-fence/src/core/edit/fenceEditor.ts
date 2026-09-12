import { renderIssues, wireColorNames } from 'fence-kit';
import type { EditResult, FenceEditor } from 'fence-kit';
import { normalizeNewlines } from 'fence-kit';
import { renderPalette, renderTypeOptions } from './palette.ts';
import { partFields, setField } from './field.ts';
import type { PartField } from './field.ts';
import { issuesOf, shiftIssues } from './issues.ts';
import { aimAt, fenceAt } from './map.ts';
import { insertPart, insertWire, duplicatePart, nextPartId, partCells } from './insert.ts';
import { renamePart } from './rename.ts';
import { isWireHandle, renderColorOptions, setWireField, wireFields, moveWireEnd } from './wireField.ts';
import {
  deleteNote, duplicateNote, flipNote, isNoteHandle, moveNote, noteCells, noteFields, noteLineOf, noteSpans, noteText,
  setNoteField, turnNote,
} from './note.ts';
import { flipPart, turnPart } from './turn.ts';
import { movePart, movablePartIds, partSpans, stepCell, stepsTo } from './move.ts';
import { deviceCells, deviceSpans, deviceTarget, isDevice, moveDevice } from './device.ts';
import { movePoint, nodeSpans } from './point.ts';
import { deletePart, deleteWire } from './remove.ts';
import { extractPerfboardFences } from '../fences.ts';
import { renderPerfboard } from '../index.ts';
import { isCrossing, parseAddress } from '../model/address.ts';
import { parseFence } from '../parser/parseFence.ts';

/**
 * perfboard フェンスの編集を、殻が求める形 (`FenceEditor`) に束ねる。
 * **ここが穴の綴りを知る唯一の場所** — 殻は文字列で話す (52 の docs/13)。
 *
 * **マップは図そのもの。** 格子が一様なので、図の上に透明な層を重ねるだけで
 * 掴める (`renderPerfboard(source, { edit: true })`)。
 */

/**
 * 穴の間へ置こうとしたときの断り。**足は穴に挿す**ので、交点の間に置けるのは
 * 注釈だけ (breadboard と同じ約束)。
 */
const betweenHoles = (written: string) => ({
  ok: false as const,
  error: { message: `穴の間には置けません: ${written} (間に置けるのは注釈だけです)`, line: null },
});

const unreadable = (written: string): EditResult =>
  ({ ok: false, error: { message: `穴として読めません: ${written}`, line: null } });

const readAddress = (written: string) => parseAddress(written);

export function createPerfboardEditor(): FenceEditor {
  return {
    language: 'perfboard',

    fences: (markdown) => extractPerfboardFences(markdown).map((fence) => ({
      line: fence.line,
      title: parseFence(normalizeNewlines(fence.source)).doc.title,
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
      if (isNoteHandle(id)) return noteSpans(source, id);
      // **板の外の機器は入れ子で書く**ので、光らせるのは `at:` の値 (`device.ts`)。
      if (what !== 'node' && isDevice(source, id)) return deviceSpans(source, id);
      if (what !== 'node') return partSpans(source, id);
      const at = readAddress(id);
      return at === null ? [] : nodeSpans(source, at);
    },

    fieldsOf: (source, handle) => {
      if (isNoteHandle(handle)) return noteFields(source, handle);
      if (isWireHandle(handle)) return wireFields(source, handle);
      return partFields(source, handle);
    },

    // 部品の ID は配線から指すための名前なので重ならない — 名札はそのまま名前。
    // 注釈には名前が無いので、名札は行番号。人に見せるときは「注釈」と呼ぶ。
    nameOf: (handle) => (isNoteHandle(handle) ? `注釈 (${noteLineOf(handle) ?? '?'} 行目)` : handle),
    // 写せる字を持つのは `text` の注釈だけ (右クリックの「テキストコピー」)。
    textOf: (source, handle) => (isNoteHandle(handle) ? noteText(source, handle) : null),
    cellsOf: (source, handle) => {
      if (isNoteHandle(handle)) return noteCells(source, handle);
      // 機器は番地で置いたときだけ穴に載る (帯に並べた機器には指せる穴が無い)。
      if (isDevice(source, handle)) return deviceCells(source, handle);
      return partCells(source, handle);
    },
    // 配線は穴から穴へ 1 本 (折れの綴りが文法に無い)。
    foldsWire: false,
    // **注釈だけが交点の間に置ける** (`b5c3`)。足は穴に挿すので、部品・配線・
    // 節点は交点そのものを指す (breadboard と同じ約束)。
    // 既定が 1/10 升で、`Shift` を押している間だけ升ちょうど。
    fine: 10,
    fineFor: 'note' as const,
    step: stepCell,
    stepsTo,

    palette: renderPalette,
    typeNames: renderTypeOptions,
    colorNames: renderColorOptions,
    // **固定の色見本を属性に出す** (実機で「ドロップダウンメニューではなく、
    // 固定の色パレット」)。被覆の色は板の 2 つで同じ表 (`fence-kit` の colors.ts)。
    wireColors: wireColorNames,
    nextId: nextPartId,

    movePart: (source, handle, to, trial) => {
      const at = readAddress(to);
      if (at === null) return unreadable(to);
      if (isNoteHandle(handle)) return moveNote(source, handle, at, trial?.preview === true);
      // 機器は `at:` を書き換えて動かす (箱の左上が落ちた穴に来る)。
      // **機器も穴を指す** — `at:` に書けるのは番地なので、端数は断る。
      if (isDevice(source, handle)) {
        if (!isCrossing(at)) return betweenHoles(to);
        return moveDevice(source, handle, deviceTarget(at), trial?.preview === true);
      }
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
      if (!isCrossing(target)) return betweenHoles(to);
      return movePoint(source, at, target, trial?.preview === true);
    },

    deletePart: (source, handle) => (isNoteHandle(handle) ? deleteNote(source, handle) : deletePart(source, handle)),
    // 掴んだ端だけを付け替える (もう片方も色も動かない)。
    moveWireEnd: (source, handle, end, to) => moveWireEnd(source, handle, end, to),
    deleteWire,

    addWire: (source, from, to, _operator, color) => {
      const at = readAddress(from);
      const target = readAddress(to);
      if (at === null) return unreadable(from);
      if (target === null) return unreadable(to);
      if (!isCrossing(at)) return betweenHoles(from);
      if (!isCrossing(target)) return betweenHoles(to);
      return insertWire(source, at, target, color);
    },

    rename: renamePart,

    setField: (source, handle, field, text) => (
      isNoteHandle(handle)
        ? setNoteField(source, handle, field, text)
        : isWireHandle(handle)
        ? setWireField(source, handle, field, text)
        : field === 'type' || field === 'value'
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
    duplicate: (source, handle, id) => (isNoteHandle(handle) ? duplicateNote(source, handle) : duplicatePart(source, handle, id)),
    turn: (source, handle, quarters) => (
      isNoteHandle(handle) ? turnNote(source, handle, quarters) : turnPart(source, handle, quarters)
    ),
    flip: (source, handle) => (isNoteHandle(handle) ? flipNote(source, handle) : flipPart(source, handle)),
  };
}

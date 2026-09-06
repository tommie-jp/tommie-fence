import { renderIssues, wireColorNames } from 'fence-kit';
import type { EditResult, FenceEditor } from 'fence-kit';
import { renderPalette, renderTypeOptions } from './palette.ts';
import { partFields, setField } from './field.ts';
import type { PartField } from './field.ts';
import { issuesOf, shiftIssues } from './issues.ts';
import { aimAt, fenceAt } from './map.ts';
import { insertPart, insertWire, duplicatePart, nextPartId, partCells } from './insert.ts';
import { renamePart } from './rename.ts';
import { flipPart, turnPart } from './turn.ts';
import { movePart, movablePartIds, partSpans, stepCell, stepsTo } from './move.ts';
import {
  deviceCells, deviceFields, devicePinSpans, deviceSpans, duplicateDevice, isDevice, moveDevice, setDeviceField,
} from './device.ts';
import { movePoint, nodeSpans } from './point.ts';
import { deletePart, deleteWire } from './remove.ts';
import { isWireHandle, renderColorOptions, setWireField, wireFields, moveWireEnd } from './wireField.ts';
import {
  deleteNote, duplicateNote, flipNote, isNoteHandle, moveNote, noteCells, noteFields, noteLineOf, noteSpans, noteText,
  setNoteField, turnNote,
} from './note.ts';
import { extractBreadboardFences } from '../fences.ts';
import { renderBreadboard } from '../index.ts';
import { parseAddress, isCrossing } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { Address } from '../types.ts';

/**
 * breadboard フェンスの編集を、殻が求める形 (`FenceEditor`) に束ねる。
 * **ここが穴の綴りを知る唯一の場所** — 殻は文字列で話す (52 の docs/13)。
 *
 * **マップは図そのもの。** circuit は別の升目 (似顔絵) を組むが、こちらは
 * 自分で SVG を組んでいて穴の座標が線形に出るので、図の上に透明な層を
 * 重ねるだけでよい (`renderBreadboard(source, { edit: true })`)。
 */

/**
 * 穴の間へ置こうとしたときの断り。**足は穴に挿す**ので、交点の間に置けるのは
 * 注釈だけ (52 の docs、実機で「text はどこでも移動できるように」)。
 */
const betweenHoles = (written: string) => ({
  ok: false as const,
  error: { message: `穴の間には置けません: ${written} (間に置けるのは注釈だけです)`, line: null },
});

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
      if (isNoteHandle(id)) return noteSpans(source, id);
      // **板の外の機器は入れ子で書く**ので、光らせるのは `at:` の値と、
      // その機器のピンを指している配線の名前 (`device.ts`)。
      if (what !== 'node' && isDevice(source, id)) return [...deviceSpans(source, id), ...devicePinSpans(source, id)];
      if (what !== 'node') return partSpans(source, id);
      const at = readAddress(id);
      return at === null ? [] : nodeSpans(source, at);
    },

    fieldsOf: (source, handle) => {
      if (isNoteHandle(handle)) return noteFields(source, handle);
      if (isWireHandle(handle)) return wireFields(source, handle);
      // 機器に書けるのは名前とラベルだけ (値は文法が使わず、種類は device そのもの)。
      if (isDevice(source, handle)) return deviceFields(source, handle);
      return partFields(source, handle);
    },

    // 名札は「同じ名前が 2 つ以上あるとき」に要る。breadboard の ID は
    // 配線から指すための名前なので重ならない — 名札はそのまま名前。
    // 注釈には名前が無いので、名札は行番号。人に見せるときは「注釈」と呼ぶ。
    nameOf: (handle) => (isNoteHandle(handle) ? `注釈 (${noteLineOf(handle) ?? '?'} 行目)` : handle),
    // 写せる字を持つのは `text` の注釈だけ (右クリックの「テキストコピー」)。
    textOf: (source, handle) => (isNoteHandle(handle) ? noteText(source, handle) : null),
    cellsOf: (source, handle) => {
      if (isNoteHandle(handle)) return noteCells(source, handle);
      // 帯に並べた機器には指せる穴が無い (左右の位置はつながる穴が決める)。
      if (isDevice(source, handle)) return deviceCells();
      return partCells(source, handle);
    },

    // 配線は穴から穴へ 1 本 (折れの綴りが文法に無い)。
    foldsWire: false,
    // 穴の間は無い (足は穴に挿す)。Ctrl を押しても素のクリック。
    // **注釈だけが交点の間に置ける** (`b5c3`)。足は穴に挿すので、部品と配線は
    // 交点そのものを指す (52 の docs、実機で「text はどこでも移動できるように」)。
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
      // 機器は `at:` を書き換えて動かす (この板で選べるのは上下の帯だけ)。
      if (isDevice(source, handle)) return moveDevice(source, handle, at, trial?.preview === true);
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
        : field !== 'type' && field !== 'value' && field !== 'label'
        ? { ok: false, error: { message: `書き換えられない欄です: ${field}`, line: null } }
        // **機器は入れ子で書く**ので、直すのはブロックの中の 1 行 (`device.ts`)。
        : isDevice(source, handle)
        ? setDeviceField(source, handle, field as PartField, text)
        : setField(source, handle, field as PartField, text)
    ),

    addPart: (source, part) => {
      const at = part.at.map((one) => readAddress(one));
      const bad = at.indexOf(null);
      if (bad >= 0) return unreadable(part.at[bad] ?? '');
      const between = at.findIndex((one) => one !== null && !isCrossing(one));
      if (between >= 0) return betweenHoles(part.at[between] ?? '');
      return insertPart(source, {
        id: part.id,
        type: part.type,
        at: at as NonNullable<typeof at[number]>[],
        turn: part.turn ?? 0,
        flip: part.flip ?? false,
        preview: part.preview ?? false,
      });
    },
    duplicate: (source, handle, id) => (
      isNoteHandle(handle)
        ? duplicateNote(source, handle)
        : isDevice(source, handle)
        ? duplicateDevice(handle)
        : duplicatePart(source, handle, id)
    ),
    turn: (source, handle, quarters) => (
      isNoteHandle(handle) ? turnNote(source, handle, quarters) : turnPart(source, handle, quarters)
    ),
    flip: (source, handle) => (isNoteHandle(handle) ? flipNote(source, handle) : flipPart(source, handle)),
  };
}

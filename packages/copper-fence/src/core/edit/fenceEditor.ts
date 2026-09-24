import { normalizeNewlines, renderIssues, wireColorNames } from 'fence-kit';
import type { FenceEditor } from 'fence-kit';
import { extractCopperFences } from '../fences.ts';
import { renderCopper } from '../index.ts';
import { parseFence } from '../parser/parseFence.ts';
import { FINE, cellsOf, step, stepsTo } from './cells.ts';
import { fieldsOf, flip, rename, setField, turn } from './fields.ts';
import { ercView, issuesOf, problemsOf } from './issues.ts';
import { aimAt, fenceAt, spansOf } from './map.ts';
import { movePart, movePoint, moveWireEnd } from './move.ts';
import { addPart, addWire, duplicate, nextId, renderColorOptions, renderPalette, renderTypeOptions } from './place.ts';
import { deletePart, deleteWire } from './remove.ts';

/**
 * マップのエディタ (fence-kit の殻) へ渡す口。**殻はこれしか知らない**ので、
 * copper の文法 (mm の番地・銅の形・端面 SMA) はここより向こうに閉じる。
 *
 * - 置き先の升は **1mm ごと**、端数 1/2 (0.5mm) が既定で `Shift` で 1mm ちょうど
 * - 線路とジャンパは**配線**として掴む (端だけも動かせる)。線路を引くと 50Ω の幅
 * - 島・via・切り欠きは**部品**として掴む
 */
export function createCopperEditor(): FenceEditor {
  return {
    language: 'copper',

    fences: (markdown) => extractCopperFences(markdown).map((fence) => ({
      line: fence.line,
      title: parseFence(normalizeNewlines(fence.source)).doc.title,
    })),
    fenceAt,
    firstFence: (markdown) => extractCopperFences(markdown)[0] ?? null,

    view: (source, fenceLine) => ({
      map: renderCopper(source, { edit: true }).svg,
      issues: renderIssues(issuesOf(source, fenceLine)),
      erc: ercView(source, fenceLine),
    }),
    problems: problemsOf,

    aimAt,
    spansOf,
    fieldsOf,
    nameOf: (handle) => (/^wire:\d+$/.test(handle) ? `線 (${handle.slice(5)} 行目)` : handle),
    colorNames: renderColorOptions,
    wireColors: wireColorNames,
    nextId,
    cellsOf,
    // 線路は折れ線に書けるので、斜めに引けば横→縦に折って書く。
    foldsWire: true,
    fine: FINE,
    fineFor: 'all',
    step,
    stepsTo,

    palette: renderPalette,
    typeNames: renderTypeOptions,

    movePart: (source, handle, to, trial) => movePart(source, handle, to, trial?.preview === true),
    movePoint: (source, from, to, trial) => movePoint(source, from, to, trial?.preview === true),
    moveWireEnd,
    addPart,
    duplicate,
    addWire: (source, from, to) => addWire(source, from, to),
    deletePart,
    deleteWire,
    rename,
    setField,
    turn,
    flip,
  };
}

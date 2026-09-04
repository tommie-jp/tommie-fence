/**
 * fence-kit — 3 つのフェンス (circuit / breadboard / perfboard) で
 * 重複している部分の置き場。
 *
 * ここに置くのは**フェンスの言語に依らないもの**だけ。先回りして共通化せず、
 * 実際に重複してから引き上げる (リポジトリ直下の CLAUDE.md)。
 *
 * ビルド工程を持たない。`exports` が `src/index.ts` を直に指し、使う側の
 * esbuild が束ねる。**external にしない** — `.vsix` を詰めるときパッケージを
 * 単体で install するので、npm 上に無い fence-kit は解決できない
 * (理由は直下の CLAUDE.md の約束 3)。
 */
export { normalizeNewlines } from './newlines.ts';
export { extractFences, outputStem } from './fences.ts';
export { stampText } from './stamp.ts';
export { keptSourceLines } from './sourceListing.ts';
export type { FenceBlock } from './fences.ts';
export { escapeMarkup, element } from './markup.ts';
export { num, svgText, TEXT_HALO_WIDTH } from './svg.ts';
export {
  DEFAULT_TOLERANCE, capacitorCode, inductorCode, parseMicrohenries, parseOhms, parsePicofarads,
  parseResistor, resistorBandColors, resistorBands,
} from './values.ts';
export {
  BAND_COLORS, LED_COLORS, WIRE_COLORS, DEFAULT_LED_COLOR, DEFAULT_WIRE_COLOR,
  bandColor, ledColor, wireColor, wireColorNames,
} from './colors.ts';
export { fit, textWidth } from './textFit.ts';
export {
  REAL_INK, SMA_SIZE, bodySize, crystalCan, drawBody, drawsOwnLeads, hasBody, smaBody,
} from './parts/bodies.ts';
export { drawPackage, packageHalfWidth, packageReach } from './parts/packages.ts';
export { partIcon } from './parts/icon.ts';
export type { PackageShape } from './parts/packages.ts';
export type { BodyInk, BodyPart } from './parts/bodies.ts';
export { computeNets } from './nets.ts';
export type { Net, NetInput, NetMember, StripId } from './nets.ts';
export type { TextOptions } from './svg.ts';
export type { Attributes } from './markup.ts';
export { chipOf } from './editor/chip.ts';
export { describeDiff, strippedIndent } from './editor/edits.ts';
export type { Connection, Edit, LineEdit, NetDiff, Rewrite, Span } from './editor/edits.ts';
export type {
  Aim, EditChanges, EditResult, FenceEditor, FenceEntry, FenceView, NewPart, PartField, PartFields, Trial,
} from './editor/fenceEditor.ts';

/**
 * マップの殻。**フェンスの文法を知らない** — 何を掴めるかも書き換え方も
 * `FenceEditor` の向こう側にある (52 の docs/13)。
 * DOM を触る webview は `fence-kit/webview` から取る (ここには出さない)。
 */
export { createSession } from './editor/session.ts';
export type {
  Incoming, LitRange, MapView, Outgoing, Session, SessionHost, SessionOptions,
} from './editor/session.ts';
export { createHistory, sameBody } from './editor/history.ts';
export type { History, Step } from './editor/history.ts';
export type { Change, Replacement } from './editor/docEdits.ts';
export { bodyAfter, changesForFence, fenceBody } from './editor/docEdits.ts';
export { indentOn } from './editor/documentLike.ts';
export type { DocLike, EditorLike } from './editor/documentLike.ts';
export {
  FLOW_REFUSAL, afterLastLine, appendUnderKey, applyEdits, applyLineEdits, applyRewrite, dropLines, indentOf,
  insertLines, isFlowKey, isKeyLine, keyLineOf,
} from './editor/lines.ts';
export { leadOffsets, leadSpan, needsRoom, orientInserted } from './editor/place.ts';
export type { OrientResult, Rewritten } from './editor/place.ts';
export { checkFenceEditor, paletteTwoEnds, paletteTypes } from './editor/contract.ts';
export type { ContractFixture } from './editor/contract.ts';
export { renderIssues } from './editor/issues.ts';
export type { IssueRow } from './editor/issues.ts';
export { COLOR_LIST_ID, TYPE_LIST_ID, makeNonce, panelHtml, renderFencePicker } from './editor/panelHtml.ts';
export type { MapViewHtml, PanelChrome, PanelHtmlOptions } from './editor/panelHtml.ts';

/**
 * fence-kit — 3 つのフェンス (circuit / breadboard / perfboard) で
 * 重複している部分の置き場。
 *
 * ここに置くのは**フェンスの言語に依らないもの**だけ。先回りして共通化せず、
 * 実際に重複してから引き上げる (リポジトリ直下の CLAUDE.md)。
 *
 * **この入口はビルド工程を通らない。** `exports` が `src/index.ts` を直に指し、
 * 使う側の esbuild が束ねる。**external にしない** — `.vsix` を詰めるときパッケージを
 * 単体で install するので、npm 上に無い fence-kit は解決できない
 * (理由は直下の CLAUDE.md の約束 3)。dist を持つのは VS Code の外の宿主へ
 * 配る 2 つ (`fence-kit/shell` と `fence-kit/map.web.js`) だけ (52 の docs/59)。
 */
export { normalizeNewlines } from './newlines.ts';
export { SHEET_TOP_KEYS, hasSheets, mergeNetlists, renderSheets, splitSheets, stackSheets } from './sheets.ts';
export type { SheetKit, SheetOptions, SheetSource, SheetSplit } from './sheets.ts';
export { rememberRecent } from './rememberRecent.ts';
export { extractFences, outputStem } from './fences.ts';
export { fenceNames, isFenceOf } from './fenceNames.ts';
export { stampText } from './stamp.ts';
export { keptSourceLines } from './sourceListing.ts';
export type { FenceBlock } from './fences.ts';
export { escapeMarkup, element } from './markup.ts';
export { BOARD_HALO_OPACITY, BOARD_INK_OPACITY, BOLD_FAMILY, num, svgText, TEXT_HALO_WIDTH } from './svg.ts';
export {
  DEFAULT_TOLERANCE, HERTZ_HINT, capacitorCode, formatHertz, formatHertzShort, hertzUnit, inductorCode, isBareNumber,
  parseHertz, parsePrefixedHertz,
  parseMicrohenries, parseOhms, parsePicofarads, parseResistor, partValueProblem, resistorBandColors, resistorBands,
} from './values.ts';
export {
  MONO_FAMILY, MONO_WIDEN, monoBandHeight, monoBaseline, monoLinesSize, monoTableLines, monoTableSize, monoText,
  monoWidth, renderMonoLines, renderMonoTable,
} from './mono.ts';
export type { MonoBand, MonoSize, MonoSpacing } from './mono.ts';
export {
  formatDegrees, formatHertzReading, formatPercent, formatPerDiv, formatSeconds, formatVolts,
  parseDegrees, parsePerDiv, parsePercent, parseSeconds, parseVolts,
} from './units.ts';
export type { Amplitude, AmplitudeKind } from './units.ts';
export { WAVE_SHAPES, linesOf, parseWave, periodOf, sampleWave } from './wave.ts';
export { WINDOW_NAMES, fft, fftArrays, kaiser, nextPowerOfTwo, windowOf } from './dsp.ts';
export type { Complex, FftDirection, WindowName } from './dsp.ts';
export type { LinesRead, SpectralLine, WaveRead, WaveShape, WaveSpec } from './wave.ts';
export {
  BAND_COLORS, LED_COLORS, WIRE_COLORS, DEFAULT_LED_COLOR, DEFAULT_WIRE_COLOR,
  bandColor, ledColor, wireColor, wireColorNames,
} from './colors.ts';
export { fit, textWidth } from './textFit.ts';
export {
  REAL_INK, SMA_SIZE, bodySize, crystalCan, drawBody, drawsOwnLeads, hasBody, smaBody, transformerCore,
} from './parts/bodies.ts';
export { boardPartNames, lookupBoardPart } from './parts/boards.ts';
export { drawNamedChip, lookupNamedChip, namedChipLooks, namedChipTypes } from './parts/namedChips.ts';
export { lookupGateUnits, lookupPinout, lookupRole, pinoutModels, pinoutTable } from './parts/pinouts.ts';
export type { AdapterChip, GateUnit, Pinout, PinoutRow } from './parts/pinouts.ts';
export { VERIFY_NOTES, discreteModels, discreteTable, lookupDiscrete } from './parts/discretes.ts';
export type { Discrete, DiscreteKind, DiscreteRow, DiscreteType } from './parts/discretes.ts';
export type { NamedChip, NamedChipPin } from './parts/namedChips.ts';
export {
  CONNECTOR_LOOKS, MIN_CONNECTOR_PINS, connectorBox, connectorFacing, connectorNames, connectorPinNames,
  drawConnector, hasPadFeet, lookupConnector, lookupConnectorSymbol,
} from './parts/connectors.ts';
export type { Connector, ConnectorFacing, ConnectorShape } from './parts/connectors.ts';
export {
  boardBox, boardChip, chipAlongX, dipBox, dipChip, segmentFace, sipBox, sipHeader, sipLegends,
} from './parts/chips.ts';
export type {
  BoardChipOptions, ChipBox, ChipInk, ChipPoint, DipOptions, SipLook, SipOptions,
} from './parts/chips.ts';
export type { BoardPart } from './parts/boards.ts';
export { PIN_NAME_GAP, pinNameInner, pinNameRow, pinNameWidth } from './parts/pinNameRow.ts';
export type { PinNameRow, PinNameRowOptions } from './parts/pinNameRow.ts';
export { drawPackage, packageExtent, packageHalfWidth, packageReach } from './parts/packages.ts';
export {
  SMD_PX_PER_MM, adapterFor, directSotSpec, isDirectSmd, isSmdAdapter, smdLook, smdLooksOf, smdMount, smdOffsets,
  smdSpelling, smdSuggestion, smdTable, withSmdLooks,
} from './parts/smd.ts';
export type { SmdLook, SmdMount, SmdSpec } from './parts/smd.ts';
export { drawDipAdapter, drawDirectSot, drawSipAdapter, smdBodySize, sotGlyph, sotMountOf } from './parts/smdDraw.ts';
export type { DipAdapterOptions, DirectSotOptions, SipAdapterOptions, SotMount } from './parts/smdDraw.ts';
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
  Aim, EditChanges, EditResult, FenceEditor, FenceEntry, FenceView, GridStep, NewPart, PartField, PartFields, Trial,
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
  FLOW_ADD_REFUSAL, FLOW_REFUSAL, RENAME_REFUSAL, REWRITE_REFUSAL, SHARED_LINE_REFUSAL, afterLastLine, appendUnderKey, emptiedUnder, applyEdits, applyLineEdits, applyRewrite, dropLines, indentOf,
  insertLines, isFlowKey, isKeyLine, keyLineOf, keysUnder, wireEndToken,
} from './editor/lines.ts';
export { fenceToAppend } from './editor/newFence.ts';
export { commentAt, dressLine, keepSpacing } from './editor/dressLine.ts';
export { lineEdits } from './editor/lineEdit.ts';
export { entryOf, flowItemOn } from './editor/entry.ts';
export { sameShape } from './editor/sameShape.ts';
export type { Entry } from './editor/entry.ts';
export type { NewFence } from './editor/newFence.ts';
export { leadOffsets, leadSpan, needsRoom, orientInserted } from './editor/place.ts';
export type { OrientResult, Rewritten } from './editor/place.ts';
export { slideBy, slideInto } from './editor/slide.ts';
export { checkFenceEditor, paletteTwoEnds, paletteTypes } from './editor/contract.ts';
export type { ContractFixture } from './editor/contract.ts';
export { renderIssues } from './editor/issues.ts';
export type { IssueRow } from './editor/issues.ts';
export { COLOR_LIST_ID, TYPE_LIST_ID, makeNonce, panelHtml, renderFencePicker } from './editor/panelHtml.ts';
export type { MapViewHtml, PanelChrome, PanelHtmlOptions } from './editor/panelHtml.ts';
export {
  PARTS_HEADINGS, bandColors, capacitorMark, partKind, partsMark, valueWithRole,
} from './partsListing.ts';
export type { PartsMark } from './partsListing.ts';

import type { Layout } from '../model/layout.ts';
import type { Board, PartsListMode, PlacedPart, Point } from '../types.ts';
import { renderBoard } from './board.ts';
import type { DevicePlacement } from './devices.ts';
import { renderDevice } from './devices.ts';
import { notesBottom, outsideNotesHeight, renderNotes, renderOutsideNotes } from './notes.ts';
import type { ResolvedNote } from './notes.ts';
import { renderPart } from './parts.ts';
import { partsListHeight, renderPartsList } from './partsList.ts';
import { element, num, svgText } from './svg.ts';
import type { RenderStyle } from './theme.ts';
import { renderTitle, titleHeight } from './title.ts';
import { VERSION, stampText } from '../version.ts';
import { renderWire } from './wires.ts';

export type RenderedWire = { readonly points: readonly Point[]; readonly color: string };

/** 画布を伸ばしたときに、いちばん下の字と縁の間に残す余白。 */
const OUTER_PAD = 14;

export type DocumentInput = {
  readonly title: string | null;
  readonly board: Board;
  readonly layout: Layout;
  readonly style: RenderStyle;
  readonly parts: readonly PlacedPart[];
  readonly devices: ReadonlyMap<string, DevicePlacement>;
  readonly wires: readonly RenderedWire[];
  readonly notes: readonly ResolvedNote[];
  /** `- source` が図に書き出すフェンスの中身 (囲みつき)。 */
  readonly sourceLines: readonly string[];
  readonly partsList: PartsListMode;
};

/**
 * 完結した 1 枚の SVG にまとめる。外部リソースもスクリプトも参照しないので、
 * VS Code のプレビュー・CLI・他アプリのどこに貼っても同じ絵になる。
 */
export function renderDocument(input: DocumentInput): string {
  const { layout, style } = input;
  const { theme } = style;
  const listed = input.partsList === 'none' ? [] : input.parts;
  const list = partsListHeight(listed, theme);
  const head = titleHeight(input.title, theme);
  // 注釈の字は板の下へはみ出すことがある (`- source` はフェンス全体を書き出す)。
  // 切らずに画布のほうを伸ばす。横は板の幅で `…` に切る (render/notes.ts)。
  const figure = Math.max(layout.height, notesBottom(input.notes, theme, input.sourceLines) + OUTER_PAD);
  // 板の外に置いた字は、画布を伸ばすのではなく自分の帯を持つ (部品リストと同じ)。
  const outside = outsideNotesHeight(input.notes, theme, input.sourceLines);
  const height = head + figure + list + outside;

  // 座標系 (viewBox) は動かさず、外側の大きさだけを指定の横幅に合わせる。
  // ピッチを変えるとレイアウトも配線の経路も総取り替えになるので、拡大縮小はここだけで済ませる。
  const scale = style.width === null ? 1 : style.width / layout.width;

  const canvas = theme.palette.canvas === null
    ? ''
    : element('rect', { x: 0, y: 0, width: num(layout.width), height: num(height), fill: theme.palette.canvas });

  // 縁取りは全部先に敷いてから線を重ねる。1 本ずつ「縁取り→線」で描くと、
  // 交差したところで後の配線の縁取りが先の配線を塗り潰してしまう。
  const wires = input.wires.map((wire) => renderWire(wire.points, wire.color, theme));

  // 題の下に図と部品リストが続く。中は座標をずらさず、題のぶんだけ全体を
  // 1 つの g で下げる (図の中の座標計算に題が混ざらない)。
  const body = [
    renderBoard(input.board, layout, theme),
    ...wires.map((wire) => wire.halo),
    ...wires.map((wire) => wire.line),
    ...input.parts.filter((part) => part.kind !== 'device').map((part) => renderPart(part, layout, theme)),
    ...input.parts
      .filter((part) => part.kind === 'device')
      .map((part) => {
        const placement = input.devices.get(part.id);
        return placement ? renderDevice(part, placement, theme) : '';
      }),
    // 注釈は板・部品・配線の上に重ねる。回路の一員ではないので最後に置く。
    renderNotes(input.notes, layout, theme, input.sourceLines),
    renderPartsList(listed, layout.board.x, figure, layout.board.width, theme),
    renderOutsideNotes(input.notes, layout.board.x, figure + list, layout.board.width, theme, input.sourceLines),
  ].filter(Boolean);

  const shifted = head === 0
    ? body
    : [element('g', { transform: `translate(0 ${num(head)})` }, body.join('\n'))];

  // 刻まない図にも版を属性で残す。あとから「どの版が描いた図か」を
  // 図そのものに聞けるようにしておく (見た目は変えない)。
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width * scale)}"`
    + ` height="${num(height * scale)}" viewBox="0 0 ${num(layout.width)} ${num(height)}"`
    + ` data-breadboard-fence="${VERSION}" role="img">`;

  return [
    open,
    ...[canvas].filter(Boolean),
    renderTitle(input.title, layout.board.x, layout.board.width, theme),
    ...shifted,
    style.stamp ? renderStamp(layout, height, theme) : '',
    '</svg>',
  ].filter(Boolean).join('\n');
}

/** 右下に小さく刻む版。字は書けない (処理系が埋めるものなので)。 */
function renderStamp(layout: Layout, height: number, theme: RenderStyle['theme']): string {
  return svgText(layout.board.x + layout.board.width, height - 4, stampText(), {
    'font-size': num(theme.metrics.textSize * 0.7),
    fill: theme.palette.partText,
    'fill-opacity': 0.55,
    anchor: 'end',
  });
}

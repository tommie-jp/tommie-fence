import { connectorBox, connectorFacing, drawConnector } from 'fence-kit';
import type { ConnectorShape } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Rect } from '../types.ts';
import { CAPTION_CLEAR, NAME_CAP, caption, fitToBoard, partLabel, pinPoints } from './partCommon.ts';
import type { RenderTheme } from './theme.ts';

/**
 * USB コネクタ。**姿は fence-kit にある** (`parts/connectors.ts`) — 変換基板ごと描き、
 * 足の名前は基板に刷る。perfboard と同じ絵になる (52 の docs/58)。
 *
 * **差し込み口は溝の反対側**を向く。溝の上の段なら上、下の段なら下 — ケーブルを
 * 板の外へ出す置き方が普通で、上の段は上の縁、下の段は下の縁のほうが近い。
 */
export function connectorShapeOf(part: PlacedPart, layout: Layout): ConnectorShape | null {
  const points = pinPoints(part, layout);
  if (points === null || points.length === 0) return null;
  const { x, width } = layout.board;
  return {
    type: part.type,
    variant: part.variant,
    points,
    pitch: layout.pitch,
    facing: connectorFacing(points, { x: x + width / 2, y: layout.ravineY }),
  };
}

/** 変換基板と金物の外形。**配線をよける領域**と描画で同じ数字を使う。 */
export function connectorBodyRect(part: PlacedPart, layout: Layout): Rect {
  const shape = connectorShapeOf(part, layout);
  return shape === null ? { x: 0, y: 0, width: 0, height: 0 } : connectorBox(shape);
}

/**
 * 名札の基準点。**足の側** (板の内側) に置く — 差し込み口が下を向くとき胴の下に
 * 書くと、板の外へ出た金物のさらに先になる。そのときだけ胴の上に置く。
 * **横は足の列の真ん中** — 胴の真ん中は、横へ張り出したコネクタでは板の外になる。
 * 描く側と配線よけ (`captions.ts`) で同じ式を使う。
 */
export function connectorCaptionAt(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
): { readonly x: number; readonly y: number } | null {
  const shape = connectorShapeOf(part, layout);
  if (shape === null) return null;
  const box = connectorBox(shape);
  const xs = shape.points.map((point) => point.x);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  return shape.facing === 'down'
    ? { x, y: box.y - CAPTION_CLEAR }
    : { x, y: box.y + box.height + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP };
}

export function renderConnector(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const shape = connectorShapeOf(part, layout);
  const at = connectorCaptionAt(part, layout, theme);
  if (shape === null || at === null) return '';

  const text = fitToBoard(caption(part), at.x, theme.metrics.textSize, layout);
  return drawConnector(shape) + partLabel(at.x, at.y + drop, text, theme);
}

export type Overhang = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

/**
 * 張り出しのために足す幅。**図を組む前に測って空ける** — 板の縁の段に置いた
 * コネクタは電源レールを越えて外へ出るので、画布を板の寸法で決めると黙って切れる。
 *
 * 上下は**機器の帯の手前まで**を使える場所として測る。画布の縁と比べると、
 * 帯のある図では縁に届く前に帯へ食い込み、何も言わずに重なる (レビューで踏んだ)。
 * 足の並びが縦なら差し込み口は左右を向くので、左右も測る。
 */
export function connectorOverhang(parts: readonly PlacedPart[], layout: Layout, margin: number): Overhang {
  const { top: topBand, bottom: bottomBand } = layout.deviceBands;
  const ceiling = topBand === null ? 0 : topBand.y + topBand.height;
  const floor = bottomBand === null ? layout.height : bottomBand.y;
  return parts
    .filter((part) => part.kind === 'connector')
    .map((part) => connectorBodyRect(part, layout))
    .filter((box) => box.width > 0)
    .reduce(
      (most, box) => ({
        top: Math.max(most.top, ceiling + margin - box.y),
        bottom: Math.max(most.bottom, box.y + box.height + margin - floor),
        left: Math.max(most.left, margin - box.x),
        right: Math.max(most.right, box.x + box.width + margin - layout.width),
      }),
      { top: 0, bottom: 0, left: 0, right: 0 },
    );
}

import type { TraceFormat, TraceSpec } from '../types.ts';

/**
 * トレースを枠に分ける。**同じ単位のトレースは同じ枠**に重ねる (S21 と S11 の dB は
 * 1 枚)。実機は 4 本を 1 つの格子に尺度違いで重ねるが、紙では読めない (52 の docs/75
 * の決め 3)。Smith・極・TDR は形が違うので、それぞれ 1 枚。
 */
export type PanelKind = 'db' | 'deg' | 'ns' | 'swr' | 'lin' | 'ohm' | 'smith' | 'polar' | 'tdr';

export const PANEL_OF: Readonly<Record<TraceFormat, PanelKind>> = {
  logmag: 'db',
  phase: 'deg',
  delay: 'ns',
  swr: 'swr',
  linear: 'lin',
  r: 'ohm',
  x: 'ohm',
  z: 'ohm',
  smith: 'smith',
  polar: 'polar',
  tdr: 'tdr',
};

/** 丸い枠か (Smith と極)。 */
export const isRound = (kind: PanelKind): boolean => kind === 'smith' || kind === 'polar';

/** トレースと、その**書いた順の番号** (色は番号で決まる。実機の 1〜4 本目と同じ)。 */
export type PanelTrace = { readonly spec: TraceSpec; readonly index: number };

export type PanelGroup = { readonly kind: PanelKind; readonly traces: readonly PanelTrace[] };

/** 書いた順に、初めて出た単位の順で枠を並べる。 */
export function groupPanels(traces: readonly TraceSpec[]): readonly PanelGroup[] {
  const order: PanelKind[] = [];
  const members = new Map<PanelKind, PanelTrace[]>();
  traces.forEach((spec, index) => {
    const kind = PANEL_OF[spec.format];
    if (!members.has(kind)) {
      order.push(kind);
      members.set(kind, []);
    }
    members.get(kind)?.push({ spec, index });
  });
  return order.map((kind) => ({ kind, traces: members.get(kind) ?? [] }));
}

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Panel = PanelGroup & {
  /** 枠の見出しを含む全体。 */
  readonly box: Rect;
  /** 格子を引く所。丸い枠は正方形。 */
  readonly plot: Rect;
};

/** 寸法 (px)。**格子は 10 × 8 目盛で 1 目盛 32 × 30** (実機の比に近い)。 */
export const SIZE = {
  rectWidth: 320,
  rectHeight: 240,
  round: 240,
  /** 縦軸の目盛の字の幅。 */
  axisLabel: 46,
  heading: 18,
  /** 横軸の目盛の字。 */
  footer: 18,
  /** 丸い枠のまわりの字 (x の値)。 */
  roundPad: 26,
  gap: 18,
  /** 1 行に並べる幅。超えたら折り返す。 */
  maxRow: 780,
} as const;

function sizeOf(kind: PanelKind): { readonly width: number; readonly height: number; readonly plot: Rect } {
  if (isRound(kind)) {
    const pad = SIZE.roundPad;
    return {
      width: SIZE.round + pad * 2,
      height: SIZE.heading + SIZE.round + pad * 2,
      plot: { x: pad, y: SIZE.heading + pad, width: SIZE.round, height: SIZE.round },
    };
  }
  return {
    width: SIZE.axisLabel + SIZE.rectWidth + 12,
    height: SIZE.heading + SIZE.rectHeight + SIZE.footer,
    plot: { x: SIZE.axisLabel, y: SIZE.heading, width: SIZE.rectWidth, height: SIZE.rectHeight },
  };
}

/** 枠を左から並べ、`maxRow` を超えたら次の行へ。**置いた後の全体の幅と高さ**も返す。 */
export function placePanels(
  groups: readonly PanelGroup[],
  left: number,
  top: number,
): { readonly panels: readonly Panel[]; readonly width: number; readonly height: number } {
  const panels: Panel[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const group of groups) {
    const size = sizeOf(group.kind);
    if (x > 0 && x + size.width > SIZE.maxRow) {
      x = 0;
      y += rowHeight + SIZE.gap;
      rowHeight = 0;
    }
    const box = { x: left + x, y: top + y, width: size.width, height: size.height };
    panels.push({
      ...group,
      box,
      plot: { x: box.x + size.plot.x, y: box.y + size.plot.y, width: size.plot.width, height: size.plot.height },
    });
    x += size.width + SIZE.gap;
    width = Math.max(width, x - SIZE.gap);
    rowHeight = Math.max(rowHeight, size.height);
  }
  return { panels, width, height: groups.length === 0 ? 0 : y + rowHeight };
}

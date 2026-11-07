/**
 * 描き上がった図の幾何 (52 の docs/148)。**fence-check が見るのはこの形だけ**。
 *
 * 各フェンスは描くときと同じ勘定 (胴の外枠・名札の置き場・配線の折れ線) から
 * これを組む。検査のために測り方を 2 つ持つと、描画を直しても検査が古いまま残る
 * (52 の docs/89 で名札の測り方を 1 か所に寄せたのと同じ理由)。
 *
 * 単位は図の SVG の座標 (px)。circuit だけは TeX が描くので、番地の升目を
 * 96 dpi の px に直した近似になる (`approximate`)。
 */

export type ScenePoint = { readonly x: number; readonly y: number };

/** 中心・大きさ・傾きで表した長方形。angle はラジアンで、x 軸が width の向き。 */
export type SceneRect = {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
};

/** 部品 1 つの胴。`pins` は配線が来てよい点 (自分の足につながる線は横切りに数えない)。 */
export type SceneBody = {
  readonly id: string;
  readonly rect: SceneRect;
  readonly pins: readonly ScenePoint[];
  /**
   * ピンではないが線が来てよい点 (circuit の記号を置いた番地。SMA の中心へ番地で引く線)。
   * 「両端とも自分のピン = 胴の下に隠れた線」の判定には数えない。
   */
  readonly joins?: readonly ScenePoint[];
  /** フェンスの中の行 (1 始まり)。分からなければ null。 */
  readonly line: number | null;
};

/** 線 1 本 (折れ線)。circuit では 2 端子の部品の足もここに入る (`lead` が true)。 */
export type SceneWire = {
  readonly id: string;
  readonly points: readonly ScenePoint[];
  readonly line: number | null;
  readonly lead?: boolean;
};

/** 名札 1 つ。**縁取りを含めない字の帯**。`owner` は持ち主の部品 ID。 */
export type SceneCaption = {
  readonly owner: string;
  readonly rect: SceneRect;
};

export type SceneFence = 'circuit' | 'breadboard' | 'perfboard';

export type Scene = {
  readonly fence: SceneFence;
  /** `sheets:` の枚の名前。1 枚の図は null。 */
  readonly sheet: string | null;
  readonly parts: readonly SceneBody[];
  readonly wires: readonly SceneWire[];
  readonly captions: readonly SceneCaption[];
  /** 座標が近似か (circuit)。近似の図の件は「疑い」として出す。 */
  readonly approximate: boolean;
  /** 幾何に起こせなかったもの (circuit の多端子部品のピンへの線など)。数だけ報告する。 */
  readonly skipped: number;
};

/**
 * 線の名前を書かれた両端で付ける (`wire(c12-f9)`)。両端が同じ線の 2 本めからは `#2` `#3`。
 * fence-check はこの名前を件の鍵に使う (52 の docs/150) — 並び順 (`wire#N`) だと線を 1 本足すと
 * 後ろの全部の名前がずれるが、両端なら動かした線の名前しか変わらない。
 */
export function sceneWireNames(ends: readonly (readonly [string, string])[]): readonly string[] {
  const seen = new Map<string, number>();
  return ends.map(([from, to]) => {
    const base = `wire(${from}-${to})`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

/** 軸に沿った矩形 (左上・幅・高さ) を SceneRect にする。 */
export const sceneRectOf = (box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): SceneRect => ({
  cx: box.x + box.width / 2,
  cy: box.y + box.height / 2,
  width: box.width,
  height: box.height,
  angle: 0,
});

/** 矩形を四方へ `by` だけ縮める (負なら広げる)。縮めすぎたら 0 で止める。 */
export const shrinkRect = (rect: SceneRect, by: number): SceneRect => ({
  ...rect,
  width: Math.max(0, rect.width - by * 2),
  height: Math.max(0, rect.height - by * 2),
});

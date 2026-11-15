import type { BoardPart } from '../boards.ts';
import type { SipLook } from '../chips.ts';
import type { UsbKind } from '../deviceLooks.ts';
import type { DiscreteKind, DiscreteRow, DiscreteType } from '../discretes.ts';
import type { ModuleOutline } from '../moduleOutline.ts';
import type { ModuleRow } from '../modules.ts';
import type { AdapterChip, IcSides, PinoutRow } from '../pinouts.ts';

/**
 * 部品カード (52 の docs/158)。**1 枚に型番 1 つ** (同じ並びの型番は 1 枚にまとめる) のピンの名前と姿。
 * 絵は持たない — 姿はフェンスに既にある物 (`dipN` `sipN` `transistor/to92` `device` `board`) から選ぶ。
 *
 * ここにあるのは**検査を通した後の形**。YAML の字から読むのは `part-card` のパッケージ
 * (fence-kit は依存を持てないので、YAML を読んだ後の値を `readCard` が受ける)。
 */
type CardCommon = {
  /** 書ける型番。**先頭が代表の綴り**。 */
  readonly models: readonly string[];
  /** `package:` に書いた綴りのまま (早見表に出す)。 */
  readonly package: string;
  readonly role: string;
  readonly roleEn?: string;
  readonly note?: string;
  /** 並びを確かめた資料。**必須** — 確かめていない並びを表に入れない。 */
  readonly source: string;
  /** LTspice の模型 (52 の docs/144)。今は形だけ見て、何にも使わない。 */
  readonly spice?: CardSpice;
};

export type CardSpice = {
  readonly model: string;
  readonly lib?: string;
  /** 模型の節点の順を**ピンの名前で**。番号で書くと並びの違う型番で黙って逆につながる。 */
  readonly nodes?: readonly string[];
};

/** DIP と 1 列 (`dipN` `sipN`)。ピンの名前の表 (`pinouts.ts`) の行になる。 */
export type ChipCard = CardCommon & {
  readonly kind: 'chip';
  readonly pins: readonly string[];
  readonly look?: SipLook;
  readonly outline?: ModuleOutline;
  readonly smd?: AdapterChip;
  readonly ic?: IcSides;
};

/** 3 ピン (`transistor/…` `regulator/…`)。ディスクリートの表 (`discretes.ts`) の行になる。 */
export type DiscreteCard = CardCommon & {
  readonly kind: 'discrete';
  readonly type: DiscreteType;
  readonly discreteKind: DiscreteKind;
  /** パッケージの名前 (データシートの名前。`TO-92`)。書かなければ `package:` の姿から。 */
  readonly case: string;
  readonly pins: readonly [string, string, string];
};

/** 基板の外の機器 (`device`)。モジュールの表 (`modules.ts`) の行になる。 */
export type ModuleCard = CardCommon & {
  readonly kind: 'module';
  readonly pins: readonly string[];
  readonly product: string;
  readonly view: string;
};

/** 2 列のマイコンボード (`board`)。ボードの表 (`boards.ts`) の行になる。型番が種類の名前。 */
export type BoardCard = CardCommon & {
  readonly kind: 'board';
  readonly pins: readonly string[];
  readonly name: string;
  readonly chip: string;
  readonly rowSpan: number;
  readonly reach: number;
  readonly usb: UsbKind;
  readonly mark?: string;
  readonly hdmi: boolean;
  readonly wireless: boolean;
};

export type PartCard = ChipCard | DiscreteCard | ModuleCard | BoardCard;

/**
 * 図を描くときに渡す表。**素のデータ** — 束ねた `core.mjs` はフェンスごとに fence-kit の写しを持つので、
 * 写しをまたいで渡っても同じに読める形にする (クラスや Map を持たない)。
 */
export type CardTable = {
  readonly pinouts: readonly PinoutRow[];
  readonly discretes: readonly DiscreteRow[];
  readonly modules: readonly ModuleRow[];
  readonly boards: readonly { readonly type: string; readonly part: BoardPart }[];
};

/**
 * プレビューの plugin がカードを訊く口。markdown-it の `env` (VS Code は `currentDocument` を入れる) から、
 * その文書のカードの表を返す。無ければ undefined。
 */
export type CardReader = (env: unknown) => CardTable | undefined;

export const EMPTY_CARD_TABLE: CardTable = { pinouts: [], discretes: [], modules: [], boards: [] };

/** カードの言うこと。`path` は YAML の中の道筋 (`['pins', 3]`)。行番号に直すのは YAML を読んだ側。 */
export type CardIssue = {
  readonly path: readonly (string | number)[];
  readonly message: string;
  /** `error` のカードは読まない。`notice` は読むが知らせる。 */
  readonly severity: 'error' | 'notice';
};

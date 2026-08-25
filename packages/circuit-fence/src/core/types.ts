// フェンス構文から TeX 生成までで共有する型。DOM にも Node にも依存しない。

import { formatAddress } from './model/address.ts';
import type { Address, WireOperator } from './model/address.ts';

/**
 * 読めなかったところ 1 件。line は元の YAML の行 (1 始まり)。
 * 行を特定できなかったときだけ null にする。
 * これを図の下の帯に出すのがこのプロジェクトの主眼なので、
 * 「どの行を直せばいいか」が分からないエラーを作らないこと。
 */
export type FenceError = {
  readonly message: string;
  readonly line: number | null;
  /**
   * 本文が指しているもう 1 つの行 (重なりの相手など)。
   * 本文に「(2 行目)」と埋め込むと、フェンスの行を Markdown の行へずらすときに
   * そこだけ置き去りになる。数のまま持って、出すときに組み立てる。
   */
  readonly related?: number | null;
};

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: FenceError };

/**
 * どの TeX 向けに組むか。
 *
 * `fence` はプレビューと CLI の SVG を描く WASM の TeX。フォントも
 * パッケージも足せないので、通せる字も使える記号も狭い。
 * `latex` は書き出した `.tex` を手元の xelatex に渡す道。
 *
 * **2 つの違いは、フェンス側の制約が強いる 3 点だけ**にする
 * (日本語のフォント・siunitx・`op amp` の記号。いずれも実測で確認済み)。
 * それ以外を変えると、プレビューで確かめた図と書き出した図が食い違う。
 */
export type TexTarget = 'fence' | 'latex';

/** 抵抗やコンデンサのように 2 つの交点の間に引く部品。斜めに置いてもよい。 */
export type TwoTerminalPart = {
  readonly kind: 'two-terminal';
  readonly id: string;
  readonly type: string;
  readonly from: Address;
  readonly to: Address;
  readonly value: string | null;
  readonly line: number;
};

/** 端子やグラウンドのように 1 つの交点に置く記号。 */
export type OneTerminalPart = {
  readonly kind: 'one-terminal';
  readonly id: string;
  readonly type: string;
  readonly at: Address;
  readonly line: number;
};

/**
 * トランジスタやオペアンプのように、1 つの交点に置いて足を何本も持つ部品。
 * 足の位置は記号ごとに決まっているので、配線からは `U1.out` の形で指す。
 */
export type MultiTerminalPart = {
  readonly kind: 'multi-terminal';
  readonly id: string;
  readonly type: string;
  readonly at: Address;
  /** 型番など。単位は補わない。 */
  readonly value: string | null;
  /**
   * 記号の向き。**書かれた語のまま** (`+up`) 持つ。
   * circuitikz の綴りに直すのは TeX 生成の仕事なので、ここには入れない。
   */
  readonly orientation: string | null;
  readonly line: number;
};

export type PartSpec = TwoTerminalPart | OneTerminalPart | MultiTerminalPart;

/**
 * 配線の端。番地そのものか、多端子部品の足。
 * 足は格子の上に無いので、番地としては扱えない (TikZ のアンカーに任せる)。
 */
export type Endpoint =
  | { readonly kind: 'cell'; readonly address: Address }
  | { readonly kind: 'pin'; readonly part: string; readonly pin: string };

/**
 * 部品なしの線 1 本。`--` はまっすぐ引く (斜めもそのまま)。
 * `-|` は先に横・`|-` は先に縦に折れる (TikZ と同じ)。
 */
export type WireSpec = {
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly operator: WireOperator;
  readonly line: number;
};

/** 番地の端。図の幾何を見るところ (曲がり角・T 字) は番地しか扱えない。 */
export const cellOf = (endpoint: Endpoint): Address | null =>
  endpoint.kind === 'cell' ? endpoint.address : null;

/**
 * 多端子部品を TikZ のノードとして呼ぶときの名前。
 * 番地の座標と同じ名前空間なので、接頭辞を付けて分ける
 * (`a1` という ID の部品が座標 a1 を上書きしてしまわないように)。
 */
export const nodeNameOf = (partId: string): string => `part-${partId}`;

/**
 * 端 1 つの呼び名。ネットリストに出る名前であり、節点を見分ける鍵でもある。
 * 1 か所で決めておかないと、綴りの違いだけでネットが割れる。
 * **書き手が書いたとおりの見た目**にする (`U1.+`)。
 */
export const nameOfEndpoint = (endpoint: Endpoint): string =>
  endpoint.kind === 'cell' ? formatAddress(endpoint.address) : `${endpoint.part}.${endpoint.pin}`;

/**
 * 端 1 つを TikZ の座標として書くときの綴り。
 * ノード名には接頭辞が付いているので、ネットリストの名前とは別に作る
 * (`part-U1.+`)。内部の都合なので図にもネットリストにも出さない。
 */
export const texNameOfEndpoint = (endpoint: Endpoint): string =>
  endpoint.kind === 'cell'
    ? formatAddress(endpoint.address)
    : `${nodeNameOf(endpoint.part)}.${endpoint.pin}`;

/** `style:` に書ける図の見た目。null は「書かれていない」= 既定のまま。 */
export type StyleSpec = {
  readonly theme: string | null;
  readonly inkColor: string | null;
  readonly paperColor: string | null;
  readonly gridColor: string | null;
  /** 部品を置ける位置を見せるか。 */
  readonly grid: boolean | null;
  /** グリッドを描く範囲の右下。省略時は使っている番地の範囲。 */
  readonly gridTo: Address | null;
  readonly pitch: number | null;
  readonly standard: string | null;
  readonly wireWidth: number | null;
  /** 出力の横ドット数。図の中身ではなく貼り先の都合なので、テーマとは分ける。 */
  readonly width: number | null;
};

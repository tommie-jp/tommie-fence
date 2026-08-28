// フェンス構文から TeX 生成までで共有する型。DOM にも Node にも依存しない。

import { formatAddress, texNameOfAddress } from './model/address.ts';
import type { Address, WireOperator } from './model/address.ts';
import type { NoteAlign, NoteLeading, NoteSize } from './notes.ts';

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
 *
 * 注釈 (`notes:`) の字は例外ではなく、**この 3 点の 1 つめの回り道**。
 * フェンスでは字を TeX に渡さず、描き上がった SVG に差し込むので
 * (render/noteText.ts)、組み方は違っても出る字は同じになる。
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
  /**
   * 電流の矢に添える字 (`i=i1` の `i1`)。**矢は from → to の向き**に描く。
   * 回路の一員ではない (ネットにも黒丸にも数えない) が、部品に付いて動くので
   * 注釈 (`notes:`) ではなく部品の一部として持つ。
   */
  readonly current: string | null;
  /** 電圧の符号に添える字 (`v=vC` の `vC`)。**from が +**。向きの規則は極性と同じ。 */
  readonly voltage: string | null;
  /**
   * 図に出るラベル (`l=$\dot{E}$` の `$\dot{E}$`)。書かなければ ID がそのまま出る。
   * **ID を置き換えるのは図の見た目だけ**で、配線から指す名前もネット名も ID のまま。
   */
  readonly label: string | null;
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
    ? texNameOfAddress(endpoint.address)
    : `${nodeNameOf(endpoint.part)}.${endpoint.pin}`;

/** `style:` に書ける図の見た目。null は「書かれていない」= 既定のまま。 */
export type StyleSpec = {
  readonly theme: string | null;
  readonly inkColor: string | null;
  readonly paperColor: string | null;
  readonly gridColor: string | null;
  /** 部品を置ける位置を見せるか。 */
  readonly grid: boolean | null;
  /**
   * グリッドの行英字と列数字の大きさ。null は既定 (点より 1 段小さい字)。
   * 語は注釈と同じ並びを使う (書き手が覚えることを増やさない)。
   */
  readonly gridLabelSize: NoteSize | null;
  /** 同じく色。null は `grid-color` (点と同じ色) のまま。 */
  readonly gridLabelColor: string | null;
  /** グリッドを描く範囲の右下。省略時は使っている番地の範囲。 */
  readonly gridTo: Address | null;
  readonly pitch: number | null;
  readonly standard: string | null;
  readonly wireWidth: number | null;
  /** 出力の横ドット数。図の中身ではなく貼り先の都合なので、テーマとは分ける。 */
  readonly width: number | null;
  /**
   * 図の隅に処理系のバージョンを刻むか。
   * **字は書き手に書かせない** (処理系が埋めるので古びない)。書けるのは出す/出さないだけ。
   */
  readonly stamp: boolean | null;
};

/**
 * 図に重ねる印 1 つ。部品を丸で囲んで目立たせる。
 * **回路の一員ではない**ので、ネットにも分岐の黒丸にも数えない。
 */
export type CircleNote = {
  readonly kind: 'circle';
  /**
   * 書かれた指し先。部品 ID か番地だが、どちらかはここでは決めない
   * (部品の表を持っている model/circuit.ts が決める)。
   */
  readonly target: string;
  /** パレットの色の名前。書かなかったときは既定の色が入る。 */
  readonly color: string;
  readonly line: number;
};

/**
 * 図の一角を囲む枠 1 つ。2 つの番地が枠の対角になる。
 *
 * 丸 (`circle`) と違って**指せるのは番地だけ**。部品を指せるようにすると、
 * 記号がどこまで広がっているかを知らないと枠を決められない
 * (2 端子部品は番地の間隔とは別の長さで描かれる)。
 */
export type BoxNote = {
  readonly kind: 'box';
  readonly from: Address;
  readonly to: Address;
  /** パレットの色の名前。書かなかったときは既定の色が入る。 */
  readonly color: string;
  /**
   * 実線で引くか。既定は破線 — 回路の線と見分けが付くようにするため。
   * 罫線 (表の枠) を引きたいときだけ実線にする。
   */
  readonly solid: boolean;
  readonly line: number;
};

/**
 * 図に重ねる指し棒 1 つ。起点から終点へ矢印を引く。
 * 両端とも、丸と同じく部品 ID か番地 (どちらかは model/circuit.ts が決める)。
 */
export type ArrowNote = {
  readonly kind: 'arrow';
  readonly from: string;
  readonly to: string;
  /** パレットの色の名前。書かなかったときは既定の色が入る。 */
  readonly color: string;
  readonly line: number;
};

/**
 * 図に出る字の見た目。`text` と `source` で**同じ言葉が使える**
 * (どちらも図に字を置く注釈なので、覚えることを 2 通りにしない)。
 *
 * 色だけが null を持つ。書かなかったときの「図のほかの文字と同じ色」は
 * パレットのどの色とも違うため。大きさ・寄せ・太字は書かなかったときの値が
 * そのまま表にあるので、ここまで来たら必ず決まっている。
 */
export type NoteTextStyle = {
  readonly color: string | null;
  readonly size: NoteSize;
  readonly align: NoteAlign;
  readonly bold: boolean;
};

/** 図に重ねる字 1 つ。番地を字のどこにするかは寄せで決まる。 */
export type TextNote = {
  readonly kind: 'text';
  readonly at: Address;
  readonly text: string;
  readonly line: number;
} & NoteTextStyle;

/**
 * 元のフェンスをそのまま図に書き出す注釈。
 *
 * プレビューではフェンスが図に差し替わるので、**書いた YAML が読み手に見えない**。
 * 図の横にそのまま出しておくと、図と書き方を並べて読める。
 * 中身は書き写すのではなく**フェンス自身から作る**ので、直したときにずれない。
 */
export type SourceNote = {
  readonly kind: 'source';
  readonly at: Address;
  /**
   * 行送りの段。**書き出しにしか無い**ので、字の見た目 (NoteTextStyle) には
   * 入れない。null は「書かなかった」— 色と同じで、既定は段の表の外にある。
   */
  readonly leading: NoteLeading | null;
  readonly line: number;
} & NoteTextStyle;

/**
 * 図に重ねる直線 1 本。指し棒 (`arrow`) と同じ書き方で、先端の矢が付かない。
 * 表の罫線や区切りのように、**向きを持たない線**を引くためのもの。
 */
export type LineNote = {
  readonly kind: 'line';
  readonly from: string;
  readonly to: string;
  /** パレットの色の名前。書かなかったときは既定の色が入る。 */
  readonly color: string;
  readonly line: number;
};

export type NoteSpec = CircleNote | TextNote | SourceNote | BoxNote | ArrowNote | LineNote;

/**
 * 描き上がった SVG に差し込む字 1 つ。書いた順に、TeX が置いた目印へ当てる。
 * 色はここまでで実際の値に決まっている (パレットを引くのは TeX 生成の仕事)。
 */
export type NoteOverlay = {
  readonly text: string;
  readonly color: string;
  /** 等幅で組んで字下げを保つか (元のフェンスの書き出しだけが true)。 */
  readonly mono: boolean;
  /**
   * 太字で組むか。TeX は太さを**フォントの名前**で表す (`cmbx8`) が、
   * 差し込むときにフォントごと入れ替えるのでその指定は消える。持ち直す。
   */
  readonly bold: boolean;
  /**
   * 番地を字のどこにするか。目印は 1 文字で本物の字とは幅が違うので、
   * 寄せは TeX では決められない (差し込むときに SVG の側で寄せる)。
   */
  readonly align: NoteAlign;
};

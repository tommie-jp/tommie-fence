import { lookupBoardPart } from 'fence-kit';
import type { BoardPart } from 'fence-kit';
/**
 * 部品の種類の表。パーサ (どう書けるか) と TeX 生成 (どう描くか) の両方がここを見る。
 * 表を 2 つに割ると片方だけ増えて食い違うので、1 か所に集める。
 * 種類を増やすときはここに 1 行足す。
 *
 * **記号は実機でコンパイルを確かめたものだけを載せる** (CLAUDE.md 約束 6)。
 * 通らない記号・図が壊れる記号は、素の記号 + 書き足しに置き換えてから載せる。
 * 実測で引っかかったのは次の 3 種類。
 *
 * 落ちるもの (例外ではなく**プロセスごと落ちる**。フォントが無いため):
 *
 * - `eC` (電解コンデンサ) → 曲板の `cC` で描く (`ecap`)
 * - `ohmmeter` (抵抗計) → Ω が**太字の数式**で、その太字数式フォントが無い。
 *   丸に字を書くだけの `rmeter` に普通の太さの Ω を渡す
 *   (普通の太さの Ω は出る。値のラベルの Ω と同じもの)
 *
 * 落ちないが**字形が壊れる**もの:
 *
 * - `op amp` → 三角形の `plain amp` + 手描きの ± に置き換えてある
 * - `thRn` / `thRp` (NTC / PTC サーミスタ) → 中の θ が tiny の数式フォントで、
 *   その大きさの字形が無く `#` で出る。素の `thR` にして、
 *   NTC / PTC の区別は ID の下の行に書く (mark)
 *
 * 落ちも壊れもしないが、**回路図の慣習と形が違う**もの:
 *
 * - `V` / `sV` / `sqV` / `vsourcetri` (丸い電源) → 中身を 90 度回して描くので
 *   横に引くと寝る。丸だけの `esource` にして中身は自分で描く (inner)
 * - `ammeter` / `voltmeter` (電流計・電圧計) → 丸に指針の矢が入る。
 *   矢の無い `rmeter` に字を渡す (抵抗計と揃う)
 * - `transformer` (トランス) → 空芯。鉄芯の入る `transformer core` にする
 * - `vR` (可変抵抗) → **フェンスの circuitikz 1.0 だけ**矢先が左下を向く。
 *   フェンスでだけ `mirror` を足して右上へ返す (latexOptions)
 */

import type { TexTarget } from './types.ts';

/**
 * 2 端子は `\draw (…) to[symbol] (…)`、1 端子と多端子は `\node[symbol] at (…)`。
 * 足を持つのは多端子と、**一部の 2 端子** (ポテンショメータのワイパー、
 * サイリスタのゲート)。どちらも配線から `U1.out` の形で指せる。
 */
export type PartKind = 'two-terminal' | 'one-terminal' | 'multi-terminal';

/** 丸い電源の中身。直流は + と -、あとは 1 周期ぶんの波形。 */
export type SourceInner = 'dc' | 'sine' | 'square' | 'triangle';

/**
 * 足が乗っている記号の中心線。`h` は横、`v` は縦。**辺から導く**もので、
 * 表が持つのは辺のほう (`PinSide`) — 軸からは辺を復元できない。
 *
 * ここに載っている足だけが、置いた交点と**同じ行 (h) か同じ列 (v)** の番地へ
 * `--` でまっすぐ引ける。載っていない足は記号の縁の途中に出るので、
 * まっすぐ引くと斜めに入る。
 */
export type PinAxis = 'h' | 'v';

/**
 * 足が出ている記号の辺。**向きに合わせて回る。**
 *
 * 軸 (`h` / `v`) ではなく辺を持つ理由は 2 つ — 回した記号の足がどちらを
 * 向くかは辺でしか言えず、マップに描く足の把手にも辺が要る。
 */
export type PinSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * 記号の向き。回転は**時計回り**の角度で、`mirror` は左右反転。
 *
 * **反転してから回す** (2026-09-02 に実機で確かめた)。TeX へは
 * `rotate=..., xscale=-1` の順で書くとこの意味になる
 * (TikZ は後に書いたオプションを先に効かせる)。
 */
export type Turn = { readonly rotate: 0 | 90 | 180 | 270; readonly mirror: boolean };

export const NO_TURN: Turn = { rotate: 0, mirror: false };

/** 何か書かれているか (回っているか、反転しているか)。 */
export const isTurned = (turn: Turn): boolean => turn.rotate !== 0 || turn.mirror;

/**
 * 向きを書ける範囲。**回転と反転は別の欄**で持つ — 実機では、回すのは
 * 大丈夫でも反転すると字が鏡文字になる記号があった (DIP の足番号と型番)。
 * **落ちるからではなく読めなくなるから**外すので、種類ごとに分けて要る。
 */
export type Orient = {
  readonly rotate: boolean;
  readonly mirror: boolean;
  /** オペアンプの `+up` / `+down`。± の入れ替えは回転では書けない別の鍵。 */
  readonly signs: boolean;
};

const NO_ORIENT: Orient = { rotate: false, mirror: false, signs: false };

/** 多端子の既定。回しても反転しても字が壊れない記号。 */
const TURNS: Orient = { rotate: true, mirror: true, signs: false };

/**
 * 回せるが反転できない。DIP は足番号も型番も鏡文字になり、
 * `ground` は左右対称で図が変わらない (書けても効かない語を通さない)。
 */
const TURN_ONLY: Orient = { rotate: true, mirror: false, signs: false };

/** オペアンプだけ ± の入れ替えを持つ。 */
const AMP_ORIENT: Orient = { rotate: true, mirror: true, signs: true };

/**
 * 反転はできるが回せない。トランスは**回すと巻線と鉄心がばらける**
 * (落ちないが図として読めない。実機で確認)。反転は一次と二次が入れ替わるだけで
 * 図は保たれる。
 */
const MIRROR_ONLY: Orient = { rotate: false, mirror: true, signs: false };

/** 時計回りに 90 度。左の足は上へ回る。 */
const CLOCKWISE: Readonly<Record<PinSide, PinSide>> = {
  left: 'top', top: 'right', right: 'bottom', bottom: 'left',
};

/** 左右反転。上下の辺はその辺のまま (反転しても上は上)。 */
const MIRRORED: Readonly<Record<PinSide, PinSide>> = {
  left: 'right', right: 'left', top: 'top', bottom: 'bottom',
};

export type PartType = {
  readonly kind: PartKind;
  /**
   * 1 端子の記号で、ID を図のどこに出すか。出さない種類は省く。
   * `beside` は記号の横に添える (端子の白丸)、`inside` は記号そのものの
   * 文字として出す (電源レールの矢印の先)。
   * **ID を図に出す記号は、乗っているネットに名前も与える** (nets.ts)。
   */
  readonly idLabel?: 'beside' | 'inside';
  /** circuitikz の記号名。フェンスの TeX で描けるものに限る。 */
  readonly symbol: string;
  /**
   * 書き出す `.tex` で使う記号名。フェンスで代替に置き換えている種類だけが持つ。
   * 省くと symbol をそのまま使う (代替が要らない種類はこちら)。
   */
  readonly latexSymbol?: string;
  /**
   * 丸の中に自分で描く中身。丸だけの `esource` に置き換えた電源が持つ
   * (理由は下の「電源」の頭)。描くのは `tex/generate.ts` の sourceInner。
   */
  readonly inner?: SourceInner;
  /**
   * 書ける名前 → circuitikz のアンカー名。
   * 回路図の慣習の短い名前 (`B` `C` `E`) も、アンカー名そのものも通す。
   * **これを持つ部品だけが足を指される** (種類が多端子かどうかではない)。
   */
  readonly pins?: Readonly<Record<string, string>>;
  /**
   * 中心線に乗っている足 (circuitikz のアンカー名 → 出ている辺)。
   * 乗らない足は書かない。`--` でまっすぐ引ける足はここに載っているものだけ
   * なので、載っていない足へまっすぐ引いた配線には「斜めに入る」と伝える
   * (model/circuit.ts)。**向きが付いたら辺は回る** (`pinSideOf`)。
   *
   * **記号と同じく実機の図で 1 つずつ確かめて載せる**。当てずっぽうを載せると、
   * 正しく書いた配線にまで口を出すか、斜めに入る配線を黙って通すかになる。
   * 両端を番地で置く 2 端子部品 (ワイパー・ゲート) は持たない — 中心線が
   * 置いた 1 つの交点では決まらないため。
   */
  readonly pinSide?: Readonly<Record<string, PinSide>>;
  /**
   * **辺から出てはいるが、中心線には乗っていない足** (オペアンプの ±、
   * ゲートの入力、DIP の全部)。掴む升目が足の接続点を置く場所に使う。
   *
   * `pinSide` と分けてあるのは、あちらが「まっすぐ引けるか」を答える表だから。
   * 混ぜると、斜めに入る配線を黙って通すようになる (実際に一度そうした)。
   * 並びは**上から下・左から右**で書く — 升目はその順に置く。
   */
  readonly pinRow?: Readonly<Record<string, PinSide>>;
  /**
   * 足に書く名前 (1 番から順)。**書くのはマイコンボードだけ** — 40 本を番号で
   * 呼ぶと実物のピンアウト図と突き合わせられないため。
   *
   * フェンスでは**字を TeX に渡さない** (約束 7)。足の位置に目印を 1 文字置き、
   * 描き上がった SVG に差し込む — TeX に描かせると字送りが狂う
   * (`AGND` が「A GND」になる。実機で確かめた)。
   */
  readonly pinLabels?: readonly string[];
  /**
   * 向きを書ける範囲。**省くと種類で決まる** (多端子は回転も反転も可、
   * それ以外は不可)。表に書くのは既定から外れるものだけ — 実機で字が壊れる
   * 記号を後から外せるよう、種類ごとに上書きできる形にしてある。
   */
  readonly orient?: Orient;
  /**
   * 記号に必ず付ける circuitikz のオプション (DIP の足の本数、計器の中の字など)。
   * 書き手が触れるものではないので、向き (`+up`) とは別に持つ。
   */
  readonly options?: readonly string[];
  /**
   * 書き出す `.tex` で使うオプション。**circuitikz の版で記号の向きが違う**
   * 種類だけが持つ (フェンスは 1.0 で固定、手元の LaTeX はもっと新しい)。
   * 省くと options をそのまま使う。出る図はどちらも同じ形になる。
   */
  readonly latexOptions?: readonly string[];
  /**
   * 型番を記号の**中**に書く種類。省くと記号の下に出る。
   * 箱で描く IC は中に書ける (そのほうが回路図の慣習に近い)。
   */
  readonly valueInside?: boolean;
  /**
   * ID の下にもう 1 行足す字。記号だけでは見分けが付かない種類だけが持つ。
   * circuitikz の記号がフェンスの TeX で壊れる字 (θ) を使っているとき、
   * 記号を素の形に落として、代わりにここで区別を書く。
   */
  readonly mark?: string;
  /**
   * 値に補う単位 (TeX)。値が型番や状態で単位を持たない種類は null。
   * 数式モードに置くので、単位の綴りは必ず立体にする
   * (`F` のままだと変数の F になって斜体で出る)。
   */
  /**
   * 図に ID を出さないか。記号を描かない種類 (`short`) だけ true —
   * 名前を出す先が無いので、書くとただの浮いた字になる。
   */
  readonly nameless?: boolean;
  readonly unitTex: string | null;
  /**
   * 同じ単位の siunitx での綴り。書き出す `.tex` でだけ使う。
   * フェンスの TeX には siunitx が無い (実測) ので、そちらは unitTex で組む。
   * siunitx なら `u` が µ で出る。
   */
  readonly unitSi: string | null;
};

/** バイポーラトランジスタ。短い名前は回路図の慣習どおり。 */
const BJT_PINS = {
  b: 'base', base: 'base',
  c: 'collector', collector: 'collector',
  e: 'emitter', emitter: 'emitter',
} as const;

/** MOSFET。 */
const FET_PINS = {
  g: 'gate', gate: 'gate',
  d: 'drain', drain: 'drain',
  s: 'source', source: 'source',
} as const;

/**
 * 3 本足の能動素子の中心線。制御端子は横、あとの 2 本は縦に出る。
 * BJT・FET・IGBT で同じ形 (実機の図で確かめた)。
 */
const BJT_SIDE = { base: 'left', collector: 'top', emitter: 'bottom' } as const;
const FET_SIDE = { gate: 'left', drain: 'top', source: 'bottom' } as const;
const IGBT_SIDE = { gate: 'left', collector: 'top', emitter: 'bottom' } as const;

/**
 * p 型 (pnp・p チャネル) は**上下が逆**。circuitikz が記号ごと裏返して描くので、
 * コレクタ / ドレインが下、エミッタ / ソースが上に出る
 * (実機の図で 12 種を 1 つずつ確かめた。実機で「S に配線したのに図では上の
 * 接続点につながっている」と言われて見つけた)。
 */
const BJT_SIDE_P = { base: 'left', collector: 'bottom', emitter: 'top' } as const;
const FET_SIDE_P = { gate: 'left', drain: 'bottom', source: 'top' } as const;
const IGBT_SIDE_P = { gate: 'left', collector: 'bottom', emitter: 'top' } as const;

/** オペアンプ。circuitikz のアンカーがそのまま記号になっている。 */
const AMP_PINS = { '+': '+', '-': '-', out: 'out' } as const;

/** 出口だけが横の中心線に出る。± は三角形の縁の、中心から外れた高さ。 */
const AMP_SIDE = { out: 'right' } as const;

/** その ± の出どころ。左の辺に、図と同じで `-` が上。 */
const AMP_ROW = { '-': 'left', '+': 'left' } as const;

/** IGBT。制御端子はゲートだが、あとの 2 本はバイポーラと同じ呼び名。 */
const IGBT_PINS = {
  g: 'gate', gate: 'gate',
  c: 'collector', collector: 'collector',
  e: 'emitter', emitter: 'emitter',
} as const;

/** 入力 2 本のロジックゲート。番号でも `a` `b` でも呼べる。 */
const GATE2_PINS = {
  '1': 'in 1', in1: 'in 1', a: 'in 1',
  '2': 'in 2', in2: 'in 2', b: 'in 2',
  out: 'out', y: 'out',
} as const;

/** 入力 1 本のロジックゲート (`not` / `buffer`)。 */
const GATE1_PINS = { in: 'in', a: 'in', out: 'out', y: 'out' } as const;

/** 2 入力ゲートは出口だけが中心線。入力 2 本は上下に振り分けられている。 */
const GATE2_SIDE = { out: 'right' } as const;

/** その入力 2 本の出どころ。左の辺に上から 1・2 の順。 */
const GATE2_ROW = { 'in 1': 'left', 'in 2': 'left' } as const;

/** 1 入力ゲートは入口も出口も中心線に乗る。 */
const GATE1_SIDE = { in: 'left', out: 'right' } as const;

/** 切り替えスイッチ。共通が `in`、行き先が 2 つ。 */
const SPDT_PINS = {
  in: 'in', c: 'in', com: 'in',
  '1': 'out 1', out1: 'out 1',
  '2': 'out 2', out2: 'out 2',
} as const;

/** 共通の端だけが中心線。行き先 2 つは上下に振り分けられている。 */
const SPDT_SIDE = { in: 'left' } as const;

/** その行き先 2 つの出どころ。右の辺に上から 1・2 の順。 */
const SPDT_ROW = { 'out 1': 'right', 'out 2': 'right' } as const;

/** ポテンショメータの 3 本目。2 端子の記号にアンカーが 1 つ生えている。 */
const WIPER_PINS = { w: 'wiper', wiper: 'wiper' } as const;

/** サイリスタ・トライアックの引き金。こちらも 2 端子 + アンカー 1 つ。 */
const GATE_PINS = { g: 'gate', gate: 'gate' } as const;

/** トランスは 1 次が A、2 次が B。 */
const TRANSFORMER_PINS = { a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' } as const;

/** 巻線の端の出どころ。1 次が左の辺、2 次が右の辺。どちらも上から 1・2 の順。 */
const TRANSFORMER_ROW = { A1: 'left', A2: 'left', B1: 'right', B2: 'right' } as const;

const OHM = '\\Omega';
const FARAD = '\\mathrm{F}';
const HENRY = '\\mathrm{H}';
const VOLT = '\\mathrm{V}';
const AMPERE = '\\mathrm{A}';
const WATT = '\\mathrm{W}';
const GALVANO = '\\mathrm{G}';
const DETECT = '\\mathrm{D}';
const HERTZ = '\\mathrm{Hz}';

const SI_OHM = '\\ohm';
const SI_FARAD = '\\farad';
const SI_HENRY = '\\henry';
const SI_VOLT = '\\volt';
const SI_AMPERE = '\\ampere';
const SI_HERTZ = '\\hertz';

/** 単位を持たない種類 (値は型番や定格)。 */
const NO_UNIT = { unitTex: null, unitSi: null } as const;

/**
 * DIP の IC。足は本数ぶんの番号で呼ぶ (`U1.1`)。
 * 本数はパッケージごとに決まっているので、種類の名前に入れて表に並べる
 * (文法に本数の欄を足すより、`dip8` と書けるほうが短い)。
 */
const dipchip = (count: number): PartType => ({
  // 反転すると足番号も型番も鏡文字になる (実機で確認)。回転だけ許す。
  orient: TURN_ONLY,
  kind: 'multi-terminal',
  symbol: 'dipchip',
  // 型番は箱の中に書くので、既定の大きさだと足の番号に重なる (実機で確認)。
  options: [`num pins=${count}`, 'font=\\scriptsize'],
  valueInside: true,
  ...NO_UNIT,
  pins: Object.fromEntries(Array.from({ length: count }, (_, index) => [`${index + 1}`, `pin ${index + 1}`])),
  pinRow: dipSides(count),
});

/**
 * DIP の足が出る辺。**実物と同じ番号の回り方** — 1 番から半分までが左の辺を
 * 上から下へ、残りが右の辺を下から上へ。
 *
 * 並びは**上から下**で書く (升目はその順に置く) ので、右の辺は番号の大きい
 * ほうから並べる。
 */
const dipSides = (count: number): Record<string, PinSide> => {
  const half = count / 2;
  const left = Array.from({ length: half }, (_, index) => [`pin ${index + 1}`, 'left'] as const);
  const right = Array.from({ length: half }, (_, index) => [`pin ${count - index}`, 'right'] as const);
  return Object.fromEntries([...left, ...right]);
};

/**
 * マイコンボード。**箱に足の名前を書く IC** として描く。
 *
 * 表は fence-kit と共有 — 実体配線図の 2 つと**同じ綴り・同じピン名**で書ける
 * ようにするため (52 の docs/21)。番号は消して名前を出す
 * (`hide numbers`。実機の TeX で確かめた)。
 */
function boardchip(board: BoardPart): PartType {
  const anchors = board.pins.map((name, index) => [name, `pin ${index + 1}`] as const);
  return {
    // **反転も許す。** DIP は足番号も型番も TeX が描くので鏡文字になるが、
    // ボードの名前は描き上がった SVG に差し込むので裏返らない。型番は
    // 向きが付くと箱の外の別ノードへ移る (`drawMultiTerminal`)。
    kind: 'multi-terminal',
    symbol: 'dipchip',
    // **箱を広げる。** 既定の幅では左右の名前が真ん中でぶつかる
    // (`ADC_VREF` と `GP4`。実機で焼いて確かめた)。`minimum width` は
    // dipchip に効かないので、circuitikz の鍵をこのノードにだけ渡す。
    options: [
      `num pins=${board.pins.length}`,
      'hide numbers',
      'font=\\scriptsize',
      '/tikz/circuitikz/multipoles/dipchip/width=2.4',
    ],
    valueInside: true,
    ...NO_UNIT,
    // **書かれた綴りは小文字で引かれる**ので両方入れる。先に書いたほうが
    // 代表の名前になる (`mainPinName`) ので、実物の印字を先に置く。
    pins: Object.fromEntries(anchors.flatMap(([name, anchor]) =>
      (name === name.toLowerCase() ? [[name, anchor]] : [[name, anchor], [name.toLowerCase(), anchor]]))),
    // 置き場は DIP と同じ回り方 (左を上から、右を下から)。
    // **鍵はアンカー名** (`pin 1`) — 書かれた綴りではない (`pinSideOf` が引く形)。
    pinRow: Object.fromEntries([
      ...anchors.slice(0, anchors.length / 2).map(([, anchor]) => [anchor, 'left' as const]),
      ...anchors.slice(anchors.length / 2).reverse().map(([, anchor]) => [anchor, 'right' as const]),
    ]),
    pinLabels: board.pins,
  };
}

export const PART_TYPES = {
  // 受動部品
  resistor: { kind: 'two-terminal', symbol: 'R', unitTex: OHM, unitSi: SI_OHM },
  /**
   * 2 端子の可変抵抗。3 本目の足が要るなら potentiometer のほう。
   * 矢は回路図の慣習どおり右上を向かせる。**フェンスの circuitikz 1.0 だけが
   * 矢先を左下に描く**ので、上下を返して直す (1.6.6 では直っていると実測)。
   */
  'resistor-var': {
    kind: 'two-terminal', symbol: 'vR', options: ['mirror'], latexOptions: [],
    unitTex: OHM, unitSi: SI_OHM,
  },
  /**
   * ポテンショメータ (3 端子の可変抵抗)。両端は番地で置き、ワイパーは
   * `P1.w` で指す。**ワイパーは記号の上側に出る**ので、線は上へ引く。
   */
  potentiometer: { kind: 'two-terminal', symbol: 'potentiometer', unitTex: OHM, unitSi: SI_OHM, pins: WIPER_PINS },
  capacitor: { kind: 'two-terminal', symbol: 'C', unitTex: FARAD, unitSi: SI_FARAD },
  /**
   * 電解コンデンサ (有極性)。`eC` はフォントが無くてプロセスごと落ちるので、
   * 曲板の `cC` で描く。**先に書いた番地が平板 (+) 側**になる。
   * 記号そのものが向きを表すので、+ の字は書き足さない
   * (斜めに置いたときに字を置く場所を決められず、値のラベルとも近すぎる)。
   */
  ecap: { kind: 'two-terminal', symbol: 'cC', unitTex: FARAD, unitSi: SI_FARAD },
  /** バリキャップ (可変容量ダイオード)。値は容量なので F を足す。 */
  varicap: { kind: 'two-terminal', symbol: 'varcap', unitTex: FARAD, unitSi: SI_FARAD },
  inductor: { kind: 'two-terminal', symbol: 'L', unitTex: HENRY, unitSi: SI_HENRY },

  // 感じるもの。抵抗の仲間なので値には Ω が付く。
  photoresistor: { kind: 'two-terminal', symbol: 'phR', unitTex: OHM, unitSi: SI_OHM },
  /**
   * サーミスタ。NTC / PTC も同じ記号で描き、区別は ID の下の行に書く。
   * circuitikz の `thRn` / `thRp` は**コンパイルは通るが字形が壊れる**
   * (記号の中の θ が tiny の数式フォントで、その大きさの字形が無く `#` で出る)。
   */
  thermistor: { kind: 'two-terminal', symbol: 'thR', unitTex: OHM, unitSi: SI_OHM },
  'thermistor-ntc': { kind: 'two-terminal', symbol: 'thR', mark: 'NTC', unitTex: OHM, unitSi: SI_OHM },
  'thermistor-ptc': { kind: 'two-terminal', symbol: 'thR', mark: 'PTC', unitTex: OHM, unitSi: SI_OHM },
  /** バリスタ。値は型番か動作電圧なので単位を足さない。 */
  varistor: { kind: 'two-terminal', symbol: 'varistor', ...NO_UNIT },

  /** 水晶振動子・セラミック振動子。値は周波数 (`16M` → 16 MHz)。 */
  crystal: { kind: 'two-terminal', symbol: 'piezoelectric', unitTex: HERTZ, unitSi: SI_HERTZ },

  // ダイオード類。値は型番 (1N4148 など) なので単位を足さない。
  diode: { kind: 'two-terminal', symbol: 'D', ...NO_UNIT },
  led: { kind: 'two-terminal', symbol: 'leD', ...NO_UNIT },
  zener: { kind: 'two-terminal', symbol: 'zD', ...NO_UNIT },
  schottky: { kind: 'two-terminal', symbol: 'sD', ...NO_UNIT },
  photodiode: { kind: 'two-terminal', symbol: 'pD', ...NO_UNIT },
  /** ダイアック (双方向ダイオード)。トライアックの引き金に使う。 */
  diac: { kind: 'two-terminal', symbol: 'biD', ...NO_UNIT },
  /**
   * サイリスタ (SCR) とトライアック。ゲートは `T1.g` で指す。
   * 両端は番地で置くので、足として指せるのはゲートだけ。
   */
  thyristor: { kind: 'two-terminal', symbol: 'thyristor', ...NO_UNIT, pins: GATE_PINS },
  triac: { kind: 'two-terminal', symbol: 'triac', ...NO_UNIT, pins: GATE_PINS },

  // 電源
  //
  // circuitikz の丸い電源 (`V` / `sV` / `sqV` / `vsourcetri`) は、**丸の中身を
  // 90 度回して描く**。縦に置いたときに + と - が上下へ正しく並ぶ描き方で、
  // 横に置くと - が縦棒になり、波形も縦に寝る (フェンスの TeX でも手元の
  // LaTeX 1.6.6 でも同じ。どちらも実機で確認した)。番地で置くこの記法では
  // 電源を横に引くほうが多いので、丸だけの `esource` に置き換えて、
  // 中身は自分で描く (下の inner。`op amp` の ± と同じやり方)。
  // **フェンスの都合ではないので書き出す `.tex` も同じ形にする** (約束 7)。
  vsource: { kind: 'two-terminal', symbol: 'esource', inner: 'dc', unitTex: VOLT, unitSi: SI_VOLT },
  sine: { kind: 'two-terminal', symbol: 'esource', inner: 'sine', unitTex: VOLT, unitSi: SI_VOLT },
  square: { kind: 'two-terminal', symbol: 'esource', inner: 'square', unitTex: VOLT, unitSi: SI_VOLT },
  triangle: { kind: 'two-terminal', symbol: 'esource', inner: 'triangle', unitTex: VOLT, unitSi: SI_VOLT },
  isource: { kind: 'two-terminal', symbol: 'I', unitTex: AMPERE, unitSi: SI_AMPERE },
  battery: { kind: 'two-terminal', symbol: 'battery1', unitTex: VOLT, unitSi: SI_VOLT },
  /** 太陽電池。 */
  /**
   * 太陽電池。circuitikz は**電池と逆向き**に描く (先に書いた番地が − 側)。
   * ほかの極性のある部品はどれも先に書いた番地が + なので、`invert` で揃える。
   * フェンスの 1.0 でも手元の 1.6 系でも同じ向きに描かれると実機で確かめた
   * ので、版差ではなく記号の性質。**両方の的に同じ指定を出す** (約束 7)。
   */
  solar: { kind: 'two-terminal', symbol: 'pvsource', options: ['invert'], unitTex: VOLT, unitSi: SI_VOLT },

  // 回路を切るもの・光るもの・鳴るもの
  /** `switch` は a 接点 (押すと閉じる)、`-nc` が付くほうは b 接点。 */
  switch: { kind: 'two-terminal', symbol: 'nos', ...NO_UNIT },
  'switch-nc': { kind: 'two-terminal', symbol: 'ncs', ...NO_UNIT },
  button: { kind: 'two-terminal', symbol: 'nopb', ...NO_UNIT },
  'button-nc': { kind: 'two-terminal', symbol: 'ncpb', ...NO_UNIT },
  reed: { kind: 'two-terminal', symbol: 'reed', ...NO_UNIT },
  fuse: { kind: 'two-terminal', symbol: 'fuse', ...NO_UNIT },
  lamp: { kind: 'two-terminal', symbol: 'lamp', ...NO_UNIT },
  speaker: { kind: 'two-terminal', symbol: 'loudspeaker', ...NO_UNIT },
  mic: { kind: 'two-terminal', symbol: 'mic', ...NO_UNIT },

  // 測るもの。どれも**丸に字だけ**で描く (回路図の慣習)。
  //
  // circuitikz の `ammeter` / `voltmeter` は丸に指針の矢が入り、字も太字になる。
  // `ohmmeter` は Ω が**太字の数式**で、その太字数式フォントがフェンスの TeX に
  // 無いので**プロセスごと落ちる**。矢の無い `rmeter` に字を渡せば 3 つとも
  // 素直な丸 + 字になり、見た目も揃う (普通の太さの Ω は出ると実測で確認。
  // 値のラベルの Ω と同じもの)。
  ammeter: { kind: 'two-terminal', symbol: 'rmeter', options: [`t={$${AMPERE}$}`], ...NO_UNIT },
  voltmeter: { kind: 'two-terminal', symbol: 'rmeter', options: [`t={$${VOLT}$}`], ...NO_UNIT },
  ohmmeter: { kind: 'two-terminal', symbol: 'rmeter', options: [`t={$${OHM}$}`], ...NO_UNIT },
  // 電力計。二電力計法のように 2 つ並べて書くので、ID の添字で見分ける
  // (`W1` `W2`)。W は普通の太さの立体なので、Ω と違って字形は壊れない (実測)。
  wattmeter: { kind: 'two-terminal', symbol: 'rmeter', options: [`t={$${WATT}$}`], ...NO_UNIT },
  // 検流計と検出器。ブリッジ回路の平衡を見る計器で、値は持たない
  // (振れが零かどうかしか読まない)。G は直流のブリッジ、D は交流のブリッジ。
  galvanometer: { kind: 'two-terminal', symbol: 'rmeter', options: [`t={$${GALVANO}$}`], ...NO_UNIT },
  detector: { kind: 'two-terminal', symbol: 'rmeter', options: [`t={$${DETECT}$}`], ...NO_UNIT },

  /**
   * 素の線。記号を描かず、両端をつなぐだけ。電流の矢 (`i=`) を線の途中に
   * 置きたいときに使う (「電源から出る電流」のように、どの素子にも属さない矢)。
   * 値は持たない — 線そのものに測るものが無い。
   */
  short: { kind: 'two-terminal', symbol: 'short', nameless: true, ...NO_UNIT },

  // 記号
  port: { kind: 'one-terminal', symbol: 'ocirc', idLabel: 'beside', ...NO_UNIT },
  ground: { kind: 'one-terminal', symbol: 'ground', ...NO_UNIT, orient: TURN_ONLY },
  /**
   * 電源レール。名前は記号そのものの文字として出る。
   * グラウンドと違って**離して描いても自動ではつながらない**
   * (5V と 3V3 を同じ節点にしてしまうため)。つなぐなら配線を引く。
   */
  vcc: { kind: 'one-terminal', symbol: 'vcc', idLabel: 'inside', ...NO_UNIT },
  vee: { kind: 'one-terminal', symbol: 'vee', idLabel: 'inside', ...NO_UNIT },

  // 多端子。値は型番なので単位を足さない。
  npn: { kind: 'multi-terminal', symbol: 'npn', ...NO_UNIT, pins: BJT_PINS, pinSide: BJT_SIDE },
  pnp: { kind: 'multi-terminal', symbol: 'pnp', ...NO_UNIT, pins: BJT_PINS, pinSide: BJT_SIDE_P },
  nmos: { kind: 'multi-terminal', symbol: 'nmos', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE },
  pmos: { kind: 'multi-terminal', symbol: 'pmos', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE_P },
  /**
   * FET の残り。書くほうは回路図の言葉 (接合型 = `jfet`、エンハンスメント型 =
   * `-e`、デプレッション型 = `-d`)、描くほうは circuitikz の綴り (`igfet`)。
   * 上の `nmos` / `pmos` はチャネルを 1 本で描いた簡易記号で、
   * これはこれで記事でよく使うので残してある。
   *
   * circuitikz 1.0 には**デプレッション型 + ボディ端子の記号が無い** (実測)。
   * ボディ端子つきは載せていない (足がゲートと同じ側に出て図が読みにくい)。
   */
  njfet: { kind: 'multi-terminal', symbol: 'njfet', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE },
  pjfet: { kind: 'multi-terminal', symbol: 'pjfet', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE_P },
  'nmos-e': { kind: 'multi-terminal', symbol: 'nigfete', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE },
  'pmos-e': { kind: 'multi-terminal', symbol: 'pigfete', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE_P },
  'nmos-d': { kind: 'multi-terminal', symbol: 'nigfetd', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE },
  'pmos-d': { kind: 'multi-terminal', symbol: 'pigfetd', ...NO_UNIT, pins: FET_PINS, pinSide: FET_SIDE_P },
  /**
   * circuitikz の `op amp` は記号の中の小さな ± に 5pt の太字数式フォントが要り、
   * フェンス側の TeX には無い。例外ではなく**プロセスごと落ちる** (実測)。
   * 三角形だけの `plain amp` に置き換え、± は普通のノードとして書き足す
   * **アンカー名は op amp と同じ**なので、
   * 書き出す `.tex` では latexSymbol に戻すだけで本物の記号になる。
   */
  opamp: {
    kind: 'multi-terminal', symbol: 'plain amp', latexSymbol: 'op amp', ...NO_UNIT,
    pins: AMP_PINS, pinSide: AMP_SIDE, pinRow: AMP_ROW, orient: AMP_ORIENT,
  },
  /**
   * トランス。circuitikz の `transformer` は**空芯** (巻線 2 つだけ) で、
   * 記事によく出るのは鉄芯の 2 本が入るほう。アンカーは同じなので
   * `transformer core` にしても足の指し方は変わらない。
   */
  transformer: {
    kind: 'multi-terminal', symbol: 'transformer core', ...NO_UNIT,
    pins: TRANSFORMER_PINS, pinRow: TRANSFORMER_ROW, orient: MIRROR_ONLY,
  },
  nigbt: { kind: 'multi-terminal', symbol: 'nigbt', ...NO_UNIT, pins: IGBT_PINS, pinSide: IGBT_SIDE },
  pigbt: { kind: 'multi-terminal', symbol: 'pigbt', ...NO_UNIT, pins: IGBT_PINS, pinSide: IGBT_SIDE_P },
  /** 切り替えスイッチ (c 接点)。 */
  spdt: { kind: 'multi-terminal', symbol: 'spdt', ...NO_UNIT, pins: SPDT_PINS, pinSide: SPDT_SIDE, pinRow: SPDT_ROW },
  /**
   * スライドスイッチ。**回路図では切り替えスイッチと同じ記号**だが、種類は
   * 分けてある — 実体配線図の 2 つが別の部品として持っているので、同じ回路を
   * どちらでも書けるようにするため (52 の docs/21)。
   * 別名にすると「回路図に置いたら名前が変わった」ことになる。
   */
  'slide-switch': {
    kind: 'multi-terminal', symbol: 'spdt', ...NO_UNIT,
    pins: SPDT_PINS, pinSide: SPDT_SIDE, pinRow: SPDT_ROW,
  },

  // ロジックゲート。入力は番号でも `a` / `b` でも呼べる。
  and: { kind: 'multi-terminal', symbol: 'and port', ...NO_UNIT, pins: GATE2_PINS, pinSide: GATE2_SIDE, pinRow: GATE2_ROW },
  or: { kind: 'multi-terminal', symbol: 'or port', ...NO_UNIT, pins: GATE2_PINS, pinSide: GATE2_SIDE, pinRow: GATE2_ROW },
  nand: { kind: 'multi-terminal', symbol: 'nand port', ...NO_UNIT, pins: GATE2_PINS, pinSide: GATE2_SIDE, pinRow: GATE2_ROW },
  nor: { kind: 'multi-terminal', symbol: 'nor port', ...NO_UNIT, pins: GATE2_PINS, pinSide: GATE2_SIDE, pinRow: GATE2_ROW },
  xor: { kind: 'multi-terminal', symbol: 'xor port', ...NO_UNIT, pins: GATE2_PINS, pinSide: GATE2_SIDE, pinRow: GATE2_ROW },
  xnor: { kind: 'multi-terminal', symbol: 'xnor port', ...NO_UNIT, pins: GATE2_PINS, pinSide: GATE2_SIDE, pinRow: GATE2_ROW },
  not: { kind: 'multi-terminal', symbol: 'not port', ...NO_UNIT, pins: GATE1_PINS, pinSide: GATE1_SIDE },
  buffer: { kind: 'multi-terminal', symbol: 'buffer port', ...NO_UNIT, pins: GATE1_PINS, pinSide: GATE1_SIDE },

  // DIP の IC。足の本数だけが違う。**数は板の 2 つと同じ表**にしてある
  // (同じ回路を回路図でも実体配線図でも書けるように)。
  dip4: dipchip(4),
  dip6: dipchip(6),
  dip8: dipchip(8),
  dip14: dipchip(14),
  dip16: dipchip(16),
  dip18: dipchip(18),
  dip20: dipchip(20),
  dip24: dipchip(24),
  dip28: dipchip(28),
  dip40: dipchip(40),

  // マイコンボード。**表は実体配線図の 2 つと共通** (fence-kit)。
  pico: boardchip(lookupBoardPart('pico') as BoardPart),
  'pico-w': boardchip(lookupBoardPart('pico-w') as BoardPart),
  pico2: boardchip(lookupBoardPart('pico2') as BoardPart),
  'pico2-w': boardchip(lookupBoardPart('pico2-w') as BoardPart),
} as const satisfies Record<string, PartType>;

export type PartTypeName = keyof typeof PART_TYPES;

/**
 * 部品の和名。**パレットの検索が引く** (種類名・略記・和名の 3 通りで探せる)。
 * 字は文法リファレンス (docs/01-syntax.md) の表と同じものにする —
 * 見張りは `syntaxDoc.test.ts` (2 か所に書くと片方だけ古くなる)。
 */
export const PART_NAMES: Readonly<Record<PartTypeName, string>> = {
  resistor: '抵抗',
  'resistor-var': '可変抵抗 (2 端子)',
  potentiometer: 'ポテンショメータ (3 端子)',
  capacitor: 'コンデンサ',
  ecap: '電解コンデンサ',
  varicap: 'バリキャップ',
  inductor: 'コイル',
  photoresistor: 'CdS セル',
  thermistor: 'サーミスタ',
  'thermistor-ntc': 'NTC サーミスタ',
  'thermistor-ptc': 'PTC サーミスタ',
  varistor: 'バリスタ',
  crystal: '水晶振動子',
  diode: 'ダイオード',
  led: 'LED',
  zener: 'ツェナー',
  schottky: 'ショットキー',
  photodiode: 'フォトダイオード',
  diac: 'ダイアック',
  thyristor: 'サイリスタ (SCR)',
  triac: 'トライアック',
  vsource: '直流電源',
  sine: '交流電源 (正弦波)',
  square: '方形波電源',
  triangle: '三角波電源',
  isource: '定電流源',
  battery: '電池',
  solar: '太陽電池',
  switch: 'スイッチ (a 接点)',
  'switch-nc': 'スイッチ (b 接点)',
  button: '押しボタン (a 接点)',
  'button-nc': '押しボタン (b 接点)',
  reed: 'リードスイッチ',
  fuse: 'ヒューズ',
  lamp: 'ランプ',
  speaker: 'スピーカー',
  mic: 'マイク',
  ammeter: '電流計',
  voltmeter: '電圧計',
  ohmmeter: '抵抗計',
  wattmeter: '電力計',
  galvanometer: '検流計',
  detector: '検出器 (交流ブリッジ)',
  short: '素の線 (記号なし)',
  port: '端子 (白丸 + 名前)',
  ground: 'グラウンド',
  vcc: '電源レール (上向きの矢印 + 名前)',
  vee: '電源レール (下向きの矢印 + 名前)',
  npn: 'バイポーラトランジスタ (NPN)',
  pnp: 'バイポーラトランジスタ (PNP)',
  nmos: 'MOSFET (N・簡易記号)',
  pmos: 'MOSFET (P・簡易記号)',
  njfet: '接合型 FET (N)',
  pjfet: '接合型 FET (P)',
  'nmos-e': 'MOSFET (N・エンハンスメント型)',
  'pmos-e': 'MOSFET (P・エンハンスメント型)',
  'nmos-d': 'MOSFET (N・デプレッション型)',
  'pmos-d': 'MOSFET (P・デプレッション型)',
  opamp: 'オペアンプ',
  transformer: 'トランス',
  nigbt: 'IGBT (N チャネル)',
  pigbt: 'IGBT (P チャネル)',
  spdt: '切り替えスイッチ',
  'slide-switch': 'スライドスイッチ',
  and: 'AND ゲート',
  or: 'OR ゲート',
  nand: 'NAND ゲート',
  nor: 'NOR ゲート',
  xor: 'XOR ゲート',
  xnor: 'XNOR ゲート',
  not: 'NOT ゲート',
  buffer: 'バッファ',
  dip4: 'DIP の IC (4 ピン)',
  dip6: 'DIP の IC (6 ピン)',
  dip8: 'DIP の IC (8 ピン)',
  dip14: 'DIP の IC (14 ピン)',
  dip16: 'DIP の IC (16 ピン)',
  dip18: 'DIP の IC (18 ピン)',
  dip20: 'DIP の IC (20 ピン)',
  dip24: 'DIP の IC (24 ピン)',
  dip28: 'DIP の IC (28 ピン)',
  dip40: 'DIP の IC (40 ピン)',
  // 製品名は実体配線図の 2 つと同じ字 (fence-kit の表)。
  pico: 'Pico',
  'pico-w': 'Pico W',
  pico2: 'Pico 2',
  'pico2-w': 'Pico 2 W',
};

/**
 * 置いた部品に付ける ID の接頭辞。**docs の例に合わせてある** (`R1` `C1` `Q1`)。
 * 番号は接頭辞ごとに最小の未使用を使う — 種類ごとに数えない
 * (`P1` が lamp なら potentiometer は `P2`。docs の例がそう書いている)。
 *
 * `null` の 3 つ (`port` / `vcc` / `vee`) は **ID がそのままネットの名前**
 * として図に出るので、自動では付けずに名前を訊く。
 */
export const PART_PREFIXES: Readonly<Record<PartTypeName, string | null>> = {
  resistor: 'R',
  'resistor-var': 'R',
  potentiometer: 'P',
  capacitor: 'C',
  ecap: 'C',
  varicap: 'D',
  inductor: 'L',
  photoresistor: 'R',
  thermistor: 'R',
  'thermistor-ntc': 'R',
  'thermistor-ptc': 'R',
  varistor: 'R',
  crystal: 'X',
  diode: 'D',
  led: 'D',
  zener: 'D',
  schottky: 'D',
  photodiode: 'D',
  diac: 'D',
  thyristor: 'T',
  triac: 'T',
  vsource: 'V',
  sine: 'V',
  square: 'V',
  triangle: 'V',
  isource: 'I',
  battery: 'B',
  solar: 'PV',
  switch: 'S',
  'switch-nc': 'S',
  button: 'S',
  'button-nc': 'S',
  reed: 'S',
  fuse: 'F',
  lamp: 'P',
  speaker: 'LS',
  mic: 'MK',
  ammeter: 'A',
  voltmeter: 'V',
  ohmmeter: 'M',
  wattmeter: 'W',
  galvanometer: 'G',
  detector: 'D',
  short: 'SH',
  port: null,
  ground: 'G',
  vcc: null,
  vee: null,
  npn: 'Q',
  pnp: 'Q',
  nmos: 'M',
  pmos: 'M',
  njfet: 'J',
  pjfet: 'J',
  'nmos-e': 'M',
  'pmos-e': 'M',
  'nmos-d': 'M',
  'pmos-d': 'M',
  opamp: 'U',
  transformer: 'T',
  nigbt: 'Q',
  pigbt: 'Q',
  spdt: 'S',
  'slide-switch': 'SW',
  and: 'U',
  or: 'U',
  nand: 'U',
  nor: 'U',
  xor: 'U',
  xnor: 'U',
  not: 'U',
  buffer: 'U',
  dip4: 'U',
  dip6: 'U',
  dip8: 'U',
  dip14: 'U',
  dip16: 'U',
  dip18: 'U',
  dip20: 'U',
  dip24: 'U',
  dip28: 'U',
  dip40: 'U',
  pico: 'U',
  'pico-w': 'U',
  pico2: 'U',
  'pico2-w': 'U',
};

/**
 * 略記 → 正式名。**書く手数を減らすためだけの表**で、読んだ直後に正式名へ畳む
 * (中間モデルから先には正式名だけが流れる。略記のまま流すと、`ground` や
 * `opamp` を名前で見分けている先が壊れる)。
 *
 * 全部の種類には付けない。SPICE の素子文字と、現場で定着した略語だけに絞る
 * (70 種類ぶんの略記を覚えるくらいなら、正式名を書いたほうが早い)。
 * 載せていないもの: `q` (BJT) と `m` (MOSFET) は npn / pnp のどちらか決まらない。
 * `tr` はトランスともトランジスタとも読める。ロジックゲートや `dip8` は既に短い。
 */
export const PART_ALIASES = {
  // SPICE の素子文字。
  r: 'resistor',
  c: 'capacitor',
  l: 'inductor',
  d: 'diode',
  i: 'isource',
  v: 'vsource',

  // 回路図で通っている略語。
  ec: 'ecap',
  pot: 'potentiometer',
  ldr: 'photoresistor',
  ntc: 'thermistor-ntc',
  ptc: 'thermistor-ptc',
  xtal: 'crystal',
  scr: 'thyristor',
  bat: 'battery',
  sw: 'switch',
  btn: 'button',
  gnd: 'ground',
  op: 'opamp',

  // 電源は綴りではなく、直流 / 交流という回路図の言葉で略す。
  dc: 'vsource',
  ac: 'sine',
} as const satisfies Record<string, PartTypeName>;

type PartAlias = keyof typeof PART_ALIASES;

/**
 * 書かれた名前を正式名にする。略記も正式名も通し、読めなければ null。
 * 正式名の一覧 (`partTypeNames`) と書き間違いの候補 (`closestPartType`) は
 * 略記を含めない。羅列が 2 倍になるうえ、1 文字の略記は何にでも近いので
 * 「`x` は `r` のことですか?」のような的外れが出る。
 */
export function resolvePartTypeName(name: string): PartTypeName | null {
  if (Object.hasOwn(PART_TYPES, name)) return name as PartTypeName;
  return Object.hasOwn(PART_ALIASES, name) ? PART_ALIASES[name as PartAlias] : null;
}

export const partTypeNames = (): readonly string[] => Object.keys(PART_TYPES);

export const lookupPartType = (name: string): PartType | null =>
  Object.hasOwn(PART_TYPES, name) ? PART_TYPES[name as PartTypeName] : null;

/**
 * その TeX で使う circuitikz の記号名。
 * 知らない種類は書かれた名前をそのまま返す (検証を通っていれば起きない)。
 */
export function symbolFor(typeName: string, target: TexTarget): string {
  const type = lookupPartType(typeName);
  if (type === null) return typeName;
  return target === 'latex' ? (type.latexSymbol ?? type.symbol) : type.symbol;
}

/**
 * その記号に必ず付ける circuitikz のオプション。
 * **circuitikz の版で向きが違う記号があるので、書き出す `.tex` では別を使う**
 * ことがある (持っていない種類はどちらでも同じ)。
 */
export function optionsFor(typeName: string, target: TexTarget): readonly string[] {
  const type = lookupPartType(typeName);
  if (type === null) return [];
  return (target === 'latex' ? type.latexOptions : undefined) ?? type.options ?? [];
}

/**
 * 書かれたピン名を circuitikz のアンカー名にする。読めなければ null。
 * `Q1.B` も `Q1.base` も同じ足を指す。
 */
export function lookupPin(type: PartType, pin: string): string | null {
  const pins = type.pins;
  if (pins === undefined) return null;

  const wanted = pin.toLowerCase();
  return Object.hasOwn(pins, wanted) ? (pins[wanted] ?? null) : null;
}

/**
 * その種類に向きを書ける範囲。**表に無ければ種類で決まる** —
 * 多端子は回転も反転もでき、2 端子 (番地の順が向き) と残りの 1 端子は書けない。
 */
/**
 * **ID がそのまま図に出て、乗っているネットの名前にもなる**種類か
 * (`port` / `vcc` / `vee`)。ほかの部品の ID は配線から指すための番号で、
 * 図に出ても名前ではない。
 *
 * この 3 つだけは**同じ名前を何度でも書ける** — 電源やグラウンドを同じ名前で
 * 何か所にも描くのは回路図の書き方そのもので、名前が同じなら同じ節点として
 * 数える (`model/nets.ts`)。判定はここ 1 か所 — 別々に持つと、書けるものと
 * つながるものが食い違う。
 */
export const namesNet = (type: string): boolean => lookupPartType(type)?.idLabel !== undefined;

export const orientOf = (type: PartType): Orient =>
  type.orient ?? (type.kind === 'multi-terminal' ? TURNS : NO_ORIENT);

/** その種類に書けるピン名 (短い名前と正式名の両方)。 */
export const pinNames = (type: PartType): readonly string[] => Object.keys(type.pins ?? {});

/**
 * その足が出ている辺。中心線に乗っていなければ null。
 * 引くのは**アンカー名** (`base`) であって書かれた名前 (`B`) ではない
 * — 呼び名が何通りあっても足は 1 つなので、表も 1 つで足りる。
 *
 * 向きを渡すと**回した辺**を返す。順は「反転してから回す」(`Turn` の頭書き)。
 */
export function pinSideOf(type: PartType, anchor: string, turn: Turn = NO_TURN): PinSide | null {
  return turnedSide(type.pinSide, anchor, turn);
}

/** 表を 1 つ引いて、向きのぶんだけ辺を回す。**順は「反転してから回す」**。 */
function turnedSide(
  sides: Readonly<Record<string, PinSide>> | undefined,
  anchor: string,
  turn: Turn,
): PinSide | null {
  if (sides === undefined) return null;
  const side = Object.hasOwn(sides, anchor) ? (sides[anchor] ?? null) : null;
  if (side === null) return null;

  const mirrored = turn.mirror ? MIRRORED[side] : side;
  let turned = mirrored;
  for (let done = 0; done < turn.rotate; done += 90) turned = CLOCKWISE[turned];
  return turned;
}

/**
 * 足の置き場 (アンカー名 → 出ている辺)。**中心線に乗る足も乗らない足も**
 * 出てくる — 掴む升目は「どこから出ているか」だけが要る。
 * 並びは表に書いた順 (辺の中の上から下・左から右)。
 */
export function pinPlaces(type: PartType, turn: Turn = NO_TURN): readonly {
  readonly anchor: string; readonly side: PinSide;
}[] {
  const anchors = [...Object.keys(type.pinSide ?? {}), ...Object.keys(type.pinRow ?? {})];
  return anchors.flatMap((anchor) => {
    const side = turnedSide(type.pinSide, anchor, turn) ?? turnedSide(type.pinRow, anchor, turn);
    return side === null ? [] : [{ anchor, side }];
  });
}

/**
 * その足が乗っている中心線。乗っていなければ null。**辺から導く** —
 * 左右の辺に出る足は横の中心線、上下の辺に出る足は縦の中心線に乗る。
 */
/**
 * その足を指すときの**代表の綴り** (`base` なら `B`、`out` なら `out`)。
 * マップの箱に添える字で、**書くときに使う名前と同じもの**にする。
 *
 * **表に先に書いてあるものを採る。** 短いほうを選ぶと `not` の入口が `a`、
 * 出口が `y` になり、文法リファレンスが `in` / `out` と書いているのと食い違う
 * (どちらも書けるが、代表の名前は表の並びが持っている)。
 * 1 文字のものは大文字にする — リファレンスの表と同じ見た目 (`B` `C` `E`)。
 */
export function mainPinName(type: PartType, anchor: string): string {
  const first = Object.entries(type.pins ?? {}).find(([, target]) => target === anchor)?.[0] ?? anchor;
  return first.length === 1 ? first.toUpperCase() : first;
}

export function pinAxis(type: PartType, anchor: string, turn: Turn = NO_TURN): PinAxis | null {
  const side = pinSideOf(type, anchor, turn);
  return side === null ? null : side === 'left' || side === 'right' ? 'h' : 'v';
}

/** 数字だけの足を範囲でまとめるかどうかの境目。これを超えると並べても読めない。 */
const LISTED_PINS = 4;

/**
 * 「書ける足はこれです」と伝えるときの並べ方。
 * DIP のように数字だけの足は範囲にまとめる (40 本を並べても読めない)。
 */
export function pinHint(type: PartType): string {
  const names = pinNames(type);
  const numbered = names.length > LISTED_PINS && names.every((name) => /^\d+$/.test(name));

  return numbered ? `1〜${names.length}` : names.join(' / ');
}

/**
 * 書き間違いとみなす編集距離。短い名前ほど厳しくする。
 * 一律に 2 まで許すと、`opamp` に `lamp` を勧めるような的外れが出る
 * (短い語どうしは 2 文字違えば別物)。
 */
const allowedDistance = (name: string): number => (name.length >= 6 ? 2 : 1);

/** 1 文字ずつの編集距離。種類の名前は短いので、素直に数えて足りる。 */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitute = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      row.push(Math.min(substitute, (previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1));
    }
    previous = row;
  }

  return previous[b.length] ?? 0;
}

/**
 * 書き間違えた種類に一番近い名前。無ければ null。
 * 種類が増えるほど「使えるのは…」の羅列は読みにくくなるので、
 * 近いものが 1 つあるならそれだけを添える (LLM に直させるときにも効く)。
 */
export function closestPartType(name: string): string | null {
  if (name.length === 0) return null;

  const wanted = name.toLowerCase();
  const limit = allowedDistance(wanted);
  let best: { name: string; score: number } | null = null;

  for (const candidate of partTypeNames()) {
    // 途中まで書いた名前も拾う (`induct` → `inductor`)。
    const score = candidate.startsWith(wanted) ? 0 : distance(wanted, candidate);
    if (score > limit) continue;
    if (best === null || score < best.score) best = { name: candidate, score };
  }

  return best?.name ?? null;
}

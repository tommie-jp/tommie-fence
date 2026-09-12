import { changedSpan, fenceAt, fencesIn, lineAfterChange, lineOfOffset } from './document.ts';
import type { DocFence, LineSpan } from './document.ts';

/**
 * **頁が持つ文書 1 つの状態** (52 の docs/43 / 49)。
 *
 * 字そのものは持たない — **欄が正**なので、出し入れは外から渡された
 * `text` / `setText` を通す。ここが数えるのは「どれがいまのフェンスか」
 * 「開いてから直したか」「殻が直前に書き換えた所」の 3 つ。DOM は知らない。
 */

/** いま開いている文書。**フェンスではなく Markdown の全文**を指す。 */
export type Doc = {
  /** ファイル名 (`01-led.md`)。 */
  readonly name: string;
  /** 見出し。画面に出す名前。 */
  readonly title: string;
  /** リポジトリの中の置き場。例のときだけ (出どころのリンクに使う)。 */
  readonly from: string | null;
  /**
   * **その文書がどこにあるか。** 例と `?doc=` にはあり、手元のファイルには
   * 無い (ディスクの上にしか無く、相手の端末には存在しない)。
   * アドレス欄と QR がこれを指す。
   */
  readonly url: string | null;
  /** 配ってあるリンクから開いたか。 */
  readonly fromLink: boolean;
  /** 開いたときが CRLF だったか。**書き戻すときに揃える。** */
  readonly crlf: boolean;
};

/** 何も開いていない状態。 */
export const EMPTY_DOC: Doc = { name: '', title: '', from: null, url: null, fromLink: false, crlf: false };

export type TextBox = {
  readonly text: () => string;
  readonly setText: (next: string) => void;
};

export type Workspace = {
  /** いまの全文 (欄から読む)。**ここを通して読む** — 欄を差し替えるときに 1 か所で済む。 */
  readonly text: () => string;
  readonly doc: Doc;
  /** 開いたときの全文。「元に戻す」の行き先で、書き戻すと進む。 */
  readonly pristine: string;
  /** いまの文書のフェンス。字が変わるたびに数え直す。 */
  readonly fences: readonly DocFence[];
  /** いま図に出しているフェンスの番号。 */
  readonly at: number;
  /**
   * 殻が最後に書き換えた行。**Markdown の窓を開いたときに選んでおく**
   * (52 の docs/48)。欄で打った・別の文書を開いたら捨てる。
   */
  readonly touched: LineSpan | null;
  /** いま図に出しているフェンス。無ければ null (フェンスの無い文書)。 */
  readonly current: () => DocFence | null;
  /** 開いてから直したか。何も開いていなければ false。 */
  readonly dirty: () => boolean;
  /** 文書を開く。**ここが唯一の入口** — 例もリンクも手元のファイルも通る。 */
  readonly open: (doc: Doc, text: string) => void;
  /** 欄の字を数え直す (打鍵のあと)。いまのフェンスは題で追う。 */
  readonly reread: () => void;
  /** 字を入れ替える (「試す」・元に戻す)。数え直しまで。 */
  readonly setText: (next: string) => void;
  /** 殻からの書き換え。変わった所を控えてから入れ替える。 */
  readonly replace: (next: string) => void;
  /** 控えを捨てる (欄で打ったとき — もう「直前」ではない)。 */
  readonly forget: () => void;
  /** 書き戻せたとき。その字が新しい pristine になる。 */
  readonly kept: (typed: string) => void;
  /** 番号でフェンスを選ぶ。変わったら true。 */
  readonly select: (index: number) => boolean;
  /** 本文の 1 行目 (殻の fenceLine) でフェンスを選ぶ。変わったら true。 */
  readonly bind: (line: number) => boolean;
  /** 欄のカーソル (字の番号) のあるフェンスへ移る。外なら動かない。 */
  readonly follow: (offset: number) => boolean;
};

/**
 * 字が変わったあとも**同じフェンスを見続ける**番号。
 *
 * **まず行で探す** (`moved` = 元のフェンスの本文の 1 行目が、いまどこに居るか)。
 * 題で探すと、**題を書いていない図が 2 つある文書**ではどちらも `null` で
 * 見分けが付かず、2 本目を直すたびに 1 本目へ飛んでいた。1 本目が読めない
 * フェンスなら図が白くなり、置いた部品が消えたように見える (52 の docs/53)。
 *
 * 行で当たらないとき (変わった所がフェンスの頭に掛かった) は題で探し、
 * それも無ければ残りの中で番号を詰める (見ているものを失わない)。
 */
function keepFence(
  was: DocFence | null,
  moved: number | null,
  fences: readonly DocFence[],
  at: number,
): number {
  const last = Math.max(0, fences.length - 1);
  if (was === null) return Math.min(at, last);
  const there = moved === null
    ? -1
    : fences.findIndex((one) => one.kind === was.kind && one.line === moved);
  if (there >= 0) return there;
  // **題が無いなら題では探さない。** 題の無い図はどれも `null` で見分けが
  // 付かないので、探すと 1 本目に当たる (行で追えなかったときの落ち先が、
  // 直そうとしている不具合そのものになる)。番号をそのまま使う。
  const same = was.title === null
    ? -1
    : fences.findIndex((one) => one.kind === was.kind && one.title === was.title);
  return same >= 0 ? same : Math.min(at, last);
}

/** 状態の入れ物。この下の関数と `createWorkspace` の中でだけ書き換える。 */
type State = {
  doc: Doc;
  pristine: string;
  /** 前に数えたときの全文。**行で追う**のに要る (どこが何行ずれたか)。 */
  seen: string;
  fences: readonly DocFence[];
  at: number;
  touched: LineSpan | null;
};

/** 字が変わったら数え直す。いまのフェンスは行で追う (外れたら題)。 */
function recount(s: State, box: TextBox): void {
  const was = s.fences[s.at] ?? null;
  const now = box.text();
  const moved = was === null ? null : lineAfterChange(s.seen, now, was.line);
  s.fences = fencesIn(now);
  s.at = keepFence(was, moved, s.fences, s.at);
  s.seen = now;
}

/** 番号でフェンスを選ぶ。範囲の外と、いまと同じ番号は false。 */
function selectAt(s: State, index: number): boolean {
  if (index < 0 || index >= s.fences.length || index === s.at) return false;
  s.at = index;
  return true;
}

/**
 * 文書を開く。**前の文書のフェンスを先に捨てる** — 残したまま数え直すと、
 * 前の文書の 1 本目と同じ題のフェンスを新しい文書の中で探し、1 本目以外から
 * 始まる (3 つの例は題が同じ「図01 LED と抵抗」)。
 */
function openInto(s: State, box: TextBox, doc: Doc, text: string): void {
  s.doc = doc;
  s.pristine = text;
  s.touched = null;
  s.fences = [];
  s.at = 0;
  s.seen = text;
  box.setText(text);
  recount(s, box);
}

export function createWorkspace(box: TextBox): Workspace {
  const s: State = { doc: EMPTY_DOC, pristine: '', seen: box.text(), fences: [], at: 0, touched: null };
  const setText = (next: string): void => {
    box.setText(next);
    recount(s, box);
  };
  const select = (index: number): boolean => selectAt(s, index);

  return {
    text: box.text,
    get doc() { return s.doc; },
    get pristine() { return s.pristine; },
    get fences() { return s.fences; },
    get at() { return s.at; },
    get touched() { return s.touched; },
    current: () => s.fences[s.at] ?? null,
    dirty: () => s.doc.name !== '' && box.text() !== s.pristine,
    open: (doc, text) => openInto(s, box, doc, text),
    reread: () => recount(s, box),
    setText,
    replace: (next) => {
      s.touched = changedSpan(box.text(), next) ?? s.touched;
      setText(next);
    },
    forget: () => { s.touched = null; },
    kept: (typed) => { s.pristine = typed; },
    select,
    bind: (line) => select(s.fences.findIndex((one) => one.line === line)),
    follow: (offset) => select(fenceAt(s.fences, lineOfOffset(box.text(), offset))),
  };
}

/**
 * **窓を開いたとき、欄のどこを見せるか** (52 の docs/48)。
 *
 * - 殻が直前に書き換えた所が**いまのフェンスの中に**あれば、そこ。別の
 *   フェンスの所は使わない — マップで A を直してから一覧で B へ移ると、図は B
 *   なのに A の行が選ばれ、次に欄を触った瞬間に図が A へ戻る (`follow`)
 * - 無ければ、カーソルがいまのフェンスの中にある限りそのまま (null) —
 *   前に窓で直していた所を失わせない
 * - 外にあれば、いまのフェンスの本文の 1 行目 — マップの一覧で別のフェンスへ
 *   移ったあとは、欄のカーソルは前のフェンスに残っている
 */
export function spanToReveal(state: {
  readonly fences: readonly DocFence[];
  readonly at: number;
  readonly touched: LineSpan | null;
  readonly caretLine: number;
}): LineSpan | null {
  const { fences, at, touched, caretLine } = state;
  const fence = fences[at];
  if (fence === undefined) return null;
  if (touched !== null && fenceAt(fences, touched.from) === at) return touched;
  if (fenceAt(fences, caretLine) === at) return null;
  return { from: fence.line, to: fence.line };
}

import { chipOf } from './chip.ts';
import type { Edit, LineEdit, NetDiff, Span } from './edits.ts';
import { bodyAfter, bodyFrom, fenceBody } from './docEdits.ts';
import { indentOn } from './documentLike.ts';
import type { DocLike, EditorLike } from './documentLike.ts';
import { createHistory, sameBody } from './history.ts';
import { describeDiff } from './edits.ts';
import { applyRewrite, dropLines, lineNow, orphanedHeadings } from './lines.ts';
import type { EditResult, FenceEditor, FenceEntry, GridStep, PartFields } from './fenceEditor.ts';
import { COLOR_LIST_ID, TYPE_LIST_ID, renderFencePicker, renderSwatches } from './panelHtml.ts';
import type { PanelChrome } from './panelHtml.ts';
import type { MapViewHtml } from './panelHtml.ts';
import type { FenceBlock } from '../fences.ts';
import { normalizeNewlines } from '../newlines.ts';

/**
 * マップの**セッション** — webview 1 つと文書 1 つの間の段取り。
 *
 * **vscode を知らない。** 外の世界 (webview への送り口・エディタ・文書への
 * 書き換え・光らせる印) は `SessionHost` から渡してもらうので、そのまま
 * テストに掛かる (`movePart.ts` の `EditorPort` と同じ流儀)。
 *
 * **フェンスの文法も知らない。** 番地の綴りも部品行の形も `FenceEditor` の
 * 向こう側にあり、やり取りは文字列だけ。だから circuit / breadboard /
 * perfboard で同じ殻が使える (52 の docs/13)。
 *
 * 入口は 2 つ — コマンドで横に開くパネルと、`.md` のタブそのものを
 * マップにするカスタムエディタ。**中身は同じ** (直しを 2 か所にしない)。
 * 違いは host に現れる: カスタムエディタは文書を 1 つに固定し (`pinned`)、
 * 戻す・やり直すを VS Code に頼める (`nativeUndo`)。
 *
 * 図そのものではなくマップを掴ませる理由は `core/edit/map.ts` の頭書き。
 * ドラッグ中は選択の見た目だけが動き、**放したとき 1 回だけ**書き換えて
 * コンパイルする (TeX → SVG は 1 図 1 秒前後かかるので追従させない)。
 *
 * **セッションは開いたフェンスの文書を覚える。** 「いまアクティブな Markdown」を
 * 毎回探すと、パネルを Markdown と同じタブグループに入れた配置で詰む —
 * パネルを前に出した時点で Markdown が隠れてアクティブでなくなり、
 * 掴むたびに「エディタが前に出ていません」で止まる (実際に踏まれた)。
 * カーソルが別のフェンスに入ったら覚え直す。
 */

/** 光らせる 1 か所。行も桁も 0 始まり (vscode に合わせる)。 */
export type LitRange = { readonly line: number; readonly start: number; readonly end: number };

/** webview へ送るもの。 */
export type Outgoing =
  | ({ readonly kind: 'map' } & MapView)
  | { readonly kind: 'history'; readonly canUndo: boolean; readonly canRedo: boolean }
  | { readonly kind: 'status'; readonly text: string }
  /**
   * 宿主からのお知らせ。**帯に足す** (読めなかった行と同じ場所)。
   * 殻は使わない — 頁のように、殻の外で起きたこと (ファイルを開けなかった等)
   * を言う先が要る宿主のためのもの (52 の docs/46)。
   */
  | { readonly kind: 'notice'; readonly text: string; readonly bad?: boolean }
  | {
    readonly kind: 'aim'; readonly what?: 'part' | 'node' | 'wire'; readonly id?: string;
    /** まとめて選ばせるとき (複製の写し)。1 つなら書かない。 */
    readonly also?: readonly string[];
  }
  /** 選んだ部品の欄の中身。null は「欄を閉じる」 (部品を選んでいない)。 */
  | { readonly kind: 'fields'; readonly part: PartFields | null }
  /**
   * ゴースト — 置く・動かす前に、どの穴を使うか。`key` は webview が送った
   * 問い合わせの札で、**古い答えを捨てる**ため (カーソルが先へ行っている)。
   */
  | {
    readonly kind: 'ghost';
    readonly key: string;
    readonly cells: readonly string[];
    readonly ok: boolean;
    readonly why: string;
    /**
     * ゴーストの絵が「いま」占めている穴。**殻はこれを行き先へずらす**。
     * 動かすときは元の穴、置くときは下の `chip` を描いたときの穴。
     */
    readonly from?: readonly string[];
    /**
     * 置く部品の絵 (`cf-chip` の markup)。**動かすときは付かない** —
     * 図にある絵を webview が写せばよい。置く前の部品は図に無いので、
     * 試し当てで作った写しの図から切り出して渡す。
     */
    readonly chip?: string;
    /**
     * 絵をずらす量 (`from[0]` → `cells[0]`)。**端数の升は DOM に無い**ので、殻は要素を
     * 引けず、差を数で受け取る (52 の docs/23)。`from` があるときだけ。
     */
    readonly shift?: GridStep;
  };

/** webview から来るもの。中身は信用せず、使う前に形を確かめる。 */
export type Incoming = {
  readonly kind: string;
  readonly part?: unknown;
  /** まとめて選んだものの名札 (領域選択)。1 つだけのときは `part` と同じ。 */
  readonly parts?: unknown;
  /** まとめて消すときの名札。 */
  readonly ids?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly what?: unknown;
  readonly id?: unknown;
  /** まとめて消す配線 (行番号の並び)。部品は `ids` のほう。 */
  readonly wires?: unknown;
  /** 引く配線の色 (色見本で選んだもの)。 */
  readonly color?: unknown;
  readonly line?: unknown;
  /** 配線のどちらの端か (`from` / `to`)。 */
  readonly end?: unknown;
  readonly quarters?: unknown;
  readonly operator?: unknown;
  readonly type?: unknown;
  readonly at?: unknown;
  readonly field?: unknown;
  readonly text?: unknown;
  readonly turn?: unknown;
  readonly flip?: unknown;
  readonly key?: unknown;
  readonly rows?: unknown;
  readonly cols?: unknown;
  /**
   * 升の中の端数 (1/`fine` 升。circuit は 1/10。52 の docs/23)。`to` に対して `{ rows, cols }`、
   * `addPart` の `at` と `addWire` の `[from, to]` には並行した並び。**入口で綴りにする** (`resolveFine`)。
   */
  readonly fine?: unknown;
  /** 置く試し当てで間隔を選んでいる最中の、1 本目 (`from`) の端数。 */
  readonly fromFine?: unknown;
};

export type SessionHost<D extends DocLike> = {
  /** webview へ送る。 */
  readonly post: (message: Outgoing) => void;
  /** アクティブな Markdown のエディタ。無ければ null (webview にフォーカスがあるときも無い)。 */
  readonly activeEditor: () => EditorLike<D> | null;
  /** 開いている文書を URI で引く。閉じられていれば null。 */
  readonly openDocument: (uri: string) => D | null;
  /** フェンスの中の編集を Markdown の行へずらして当てる。 */
  readonly applyEdits: (document: D, fenceLine: number, edits: readonly Edit[]) => Promise<boolean>;
  /**
   * フェンスの本文を丸ごと書き戻す (戻す・やり直す)。`count` 行を `body` にする。
   * **照合は呼ぶ側で済ませてある** (`sameBody`)。
   */
  readonly replaceBody: (document: D, fenceLine: number, count: number, body: readonly string[]) => Promise<boolean>;
  /**
   * **フェンスが 1 本も無い文書に 1 本作る。** 開き記号の行 (1 始まり) を返し、
   * 作れなければ null (52 の docs/54 の決め 7)。
   *
   * 持たない殻もある — カーソルを追うパネルは、フェンスの外にあるカーソルから
   * 「どの行に作るか」を決められない。持たなければ今までどおり案内を出す。
   */
  readonly createFence?: (document: D, language: string) => Promise<number | null>;
  /** その文書を見せているエディタで光らせる。空なら消す。 */
  readonly highlight: (uri: string, ranges: readonly LitRange[]) => void;
  /**
   * その文書をテキストエディタで見せる (もう見えていれば何もしない)。
   * **タブそのものがマップのときは、その文書のテキストエディタが 1 つも
   * 開いていないことがある** — 光らせるだけでは見える所に何も起きない。
   */
  readonly showDocument?: (uri: string, line: number) => Promise<void>;
  /** VS Code の undo に頼めるとき (カスタムエディタ)。無ければ自前の履歴を持つ。 */
  readonly nativeUndo?: (kind: 'undo' | 'redo') => Promise<void>;
  /** クリップボードへ写す。持たない宿主 (playground) では無い。 */
  readonly copyText?: (text: string) => Promise<void>;
  /**
   * 掴むフェンスが変わったとき。**一覧で選び直したときにも鳴る。**
   *
   * VS Code は要らない (カーソルが正で、こちらが追う側)。頁のように
   * **同じ文書を殻の外にも映している宿主**が、どのフェンスを見せるかを
   * 揃えるために使う。`line` は本文の 1 行目 (0 始まり)。
   */
  readonly onBind?: (uri: string, line: number) => void;
};

/**
 * マップの頭と中身。**殻が受け取る形そのもの** (`panelHtml.ts` の `MapViewHtml`)。
 * 3 か所で同じ形を書くと、片方にだけ足した欄が黙って落ちる。
 */
export type MapView = MapViewHtml;

export type Session = {
  /** いまのマップ (最初の HTML に入れる分)。 */
  readonly view: () => MapView;
  /** webview へ送り直す。 */
  readonly refresh: () => void;
  /** webview から来た知らせを捌く。 */
  readonly handle: (message: Incoming) => Promise<void>;
  /** その文書の書き換えを追うか。 */
  readonly isBoundTo: (uri: string) => boolean;
  /** その文書のカーソルに従うか (固定していれば自分の文書だけ)。 */
  readonly follows: (uri: string) => boolean;
  readonly dispose: () => void;
};

export type SessionOptions<D extends DocLike> = {
  /** 文書を 1 つに固定する (カスタムエディタ)。カーソルは同じ文書の中でだけ従う。 */
  readonly pinned?: D;
};

const lostNote = (language: string): string =>
  '<p class="cf-note">フェンスを見失いました (元の Markdown を閉じたか、'
  + `フェンスの行がずれました)。${language} フェンスの中にカーソルを置くとマップが出ます。</p>`;

const noneNote = (language: string): string =>
  `<p class="cf-note">この文書に ${language} フェンスがありません。`
  + `<code>\`\`\`${language}</code> のフェンスを書くとマップが出ます。</p>`;

/** フェンスが無いが、置けば作れるとき。**升目の下に出す。** */
const willCreateNote = (language: string): string =>
  `<p class="cf-issue cf-notice">この文書に ${language} フェンスがありません。`
  + '置くと、文書の終わりに 1 本作ります。</p>';

type FenceNow<D> = { readonly document: D; readonly source: string; readonly line: number };

/** 書き換えの中身。行の出し入れを持たない `Move` も、ここでは同じ形で扱う。 */
type Changes = {
  readonly edits: readonly Edit[];
  readonly lines: readonly LineEdit[];
  readonly diff: NetDiff;
  /** 部品と一緒に消えた配線の本数 (消すときだけ)。 */
  readonly wires?: number;
  /** 一緒に消えた見出しのコメントの行数 (消すときだけ)。 */
  readonly comments?: number;
};

/** 1 つの操作を書き換えに落とす前の 1 件。何をするかの違いは `plan` の中だけ。 */
type Request = {
  /** 「R1 を b3 へ」。履歴の札に使う。 */
  readonly label: string;
  /** 済んだときの一言 (接続の変化はこのあとに足す)。 */
  readonly done: (changes: Changes) => string;
  /** 何も変わらなかったときの一言。 */
  readonly already: string;
  readonly plan: (source: string) => EditResult;
  /**
   * フェンスが 1 本も無いとき、**作ってから当てるか**。置く操作だけが真。
   * 動かす・消すで作ると、掴むものが無いのに空のフェンスだけが増える。
   */
  readonly creates?: boolean;
};

/**
 * いくつかの書き換えを**続けて当てて 1 つにまとめる**。まとめて選んだものへ
 * 同じ操作を掛けるときに要る。
 *
 * **1 回の書き換えにする** — 1 つずつ当てると、戻すのに選んだ数だけ押すことに
 * なる (選んだのは 1 回なので、戻すのも 1 回であるべき)。
 *
 * 途中で断られたものは**飛ばして続ける**。1 つ置けないだけで残り全部が
 * 動かないほうが困るので、断りは数えて最後に言う。
 */
const foldPlans = (
  source: string,
  plans: readonly ((now: string) => EditResult)[],
): { readonly body: string; readonly refusals: readonly string[] } => {
  const refusals: string[] = [];
  let body = source;
  for (const plan of plans) {
    const result = plan(body);
    if (result.ok) body = applyRewrite(body, result.value);
    else refusals.push(result.error.message);
  }
  return { body, refusals };
};

/**
 * 消す書き換えに、**宙に残る見出しのコメント**を足す (52 の docs/47)。
 * `parts:` を全部消すと `# 増幅段` だけが残っていた。
 *
 * どれを見出しと読むかは `orphanedHeadings` が決める。3 つのフェンスとも
 * YAML で「1 部品 = 1 行」なので、フェンスごとに持たずにここで 1 度だけ掛ける。
 * 行を足す書き換えには掛けない (消すときの話なので)。
 */
const withHeadings = (source: string, result: EditResult): EditResult => {
  if (!result.ok) return result;
  const lines = result.value.lines ?? [];
  if (lines.length === 0 || lines.some((one) => one.kind !== 'delete')) return result;
  const drop = new Set(lines.map((one) => one.line));
  const headings = orphanedHeadings(normalizeNewlines(source).split('\n'), drop);
  if (headings.length === 0) return result;
  return { ok: true, value: { ...result.value, lines: dropLines([...drop, ...headings]), comments: headings.length } };
};

/**
 * 一緒に消えたもの (「 (配線 2 本、コメント 1 行も一緒に)」)。無ければ空。
 * **黙って消すと気づけない**ので、数えて言う。
 */
const alongWith = (wires: number, comments: number): string => {
  const also = [...(wires > 0 ? [`配線 ${wires} 本`] : []), ...(comments > 0 ? [`コメント ${comments} 行`] : [])];
  return also.length === 0 ? '' : ` (${also.join('、')}も一緒に)`;
};

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * まとめて選んだものの名札。**1 つだけのときも同じ道を通す** —
 * 1 つと複数で別の道にすると、片方だけ直す取りこぼしが出る。
 */
const handles = (value: unknown): readonly string[] =>
  (Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []);

/** ゴーストの仮の名前。置く前の試し当てにだけ使う (本文には書かない)。 */
const GHOST_ID = 'GHOST';

/**
 * 配線 1 本を指す名札。**名前が無いものは書かれた行で指す。**
 * 殻とフェンスの取り決めなので、綴りは 1 か所に置く。
 */
export const wireHandle = (line: string | null): string | null => (line === null ? null : `wire:${line}`);

/**
 * 節点 1 つを指す名札。**節点にも名前が無い** (交点そのもの) ので、書かれた
 * 番地の綴りで指す。付ける名前 (`points:`) はその中身の話で、名札とは別。
 */
export const nodeHandle = (spelling: string | null): string | null =>
  (spelling === null ? null : `node:${spelling}`);

/**
 * 注釈 1 つを指す名札の行番号。注釈にも名前が無いので**書かれた行で指す**
 * (綴りは 3 つのフェンスの `note.ts` と同じ取り決め)。名札でなければ null。
 */
const noteLineOf = (handle: string): number | null => {
  if (!handle.startsWith('note:')) return null;
  const line = Number(handle.slice('note:'.length));
  return Number.isInteger(line) && line > 0 ? line : null;
};

/**
 * 掴んだものの名札。**名前の無いものは殻が組む** — どう指すかは殻とフェンスの
 * 取り決めで、綴りを 1 か所に置くため (フェンスごとに散らさない)。
 */
const handleOf = (what: string | null, id: string | null): string | null => {
  if (id === null) return null;
  if (what === 'wire') return wireHandle(id);
  return what === 'node' ? nodeHandle(id) : id;
};

export function createSession<D extends DocLike>(
  host: SessionHost<D>,
  fences: FenceEditor | readonly FenceEditor[],
  options: SessionOptions<D> = {},
): Session {
  /**
   * この殻が扱えるフェンス。**1 つ渡せば今までと同じ動き**で、いくつか渡すと
   * 1 つの文書の中で言語をまたいで掴める (52 の docs/19)。
   *
   * **いまのフェンスの言語で引く。** どのフェンスの中にいるかが決まってから
   * でないと、どの実装に訊けばよいか分からない。
   */
  const editors: readonly FenceEditor[] = Array.isArray(fences) ? fences : [fences as FenceEditor];
  let editor: FenceEditor = editors[0] as FenceEditor;

  /** その行を含むフェンス。**言語を横断して探し、当たった実装に乗り換える**。 */
  function lookUp(markdown: string, line: number): FenceBlock | null {
    for (const one of editors) {
      const found = one.fenceAt(markdown, line);
      if (found !== null) {
        editor = one;
        return found;
      }
    }
    return null;
  }

  /** 文書の最初のフェンス。**どの言語でもよい**ので、行の早いものを採る。 */
  function firstOf(markdown: string): FenceBlock | null {
    let best: { readonly fence: FenceBlock; readonly editor: FenceEditor } | null = null;
    for (const one of editors) {
      const found = one.firstFence(markdown);
      if (found !== null && (best === null || found.line < best.fence.line)) best = { fence: found, editor: one };
    }
    if (best === null) return null;
    editor = best.editor;
    return best.fence;
  }

  /**
   * 文書の中のフェンスの一覧。**言語をまたいで行順に並べ、題に言語を添える** —
   * 同じ `.md` に 2 つの言語があると、題だけでは見分けが付かない。
   */
  function allFences(markdown: string): readonly FenceEntry[] {
    const found = editors.map((one) => ({ one, rows: one.fences(markdown) }))
      .filter((each) => each.rows.length > 0);
    // **言語を添えるのは、その文書に 2 つ以上あるときだけ。** 殻に 3 つの
    // 言語を渡してあっても (頁がそうする)、文書が 1 つの言語で書かれていれば
    // 添え字は毎行に付く無駄な字になる — 狭い帯では札の幅がそのぶん減る。
    const mixed = found.length > 1;
    // 題があればそのまま、無ければ言語だけを出す (行番号は一覧が添える)。
    const rows = found.flatMap(({ one, rows: entries }) => entries.map((entry) => ({
      ...entry,
      title: !mixed
        ? entry.title
        : entry.title === null ? one.language : `${entry.title} (${one.language})`,
    })));
    return [...rows].sort((a, b) => a.line - b.line);
  }

  /** 扱える言語の名前 (お知らせの文面に出す)。 */
  const languages = (): string => editors.map((one) => one.language).join(' / ');

  const pinned = options.pinned ?? null;
  const ownHistory = host.nativeUndo === undefined;
  const history = createHistory();

  /** 覚えているフェンス。文書は URI で、フェンスは開き記号の行で引き直す。 */
  let bound: { readonly uri: string; readonly line: number } | null = null;
  /** いま光らせている文書。別の文書へ移るときに消す先。 */
  let lit: string | null = null;
  /**
   * 最後に見たカーソルのフェンス。**別のフェンスへ入ったときだけ乗り換える**
   * ため。同じフェンスの中で動いただけで乗り換えると、一覧で選んだフェンスが
   * 次の打鍵で捨てられ、カーソルの居ないフェンスを選べなくなる。
   * カーソルが見えないとき (webview にフォーカスがある) は**書き換えない** —
   * 空に戻すと、エディタへ戻った瞬間に「入った」と数えてしまう。
   */
  let seen: { readonly uri: string; readonly line: number } | null = null;

  const uriOf = (document: D): string => document.uri.toString();
  const say = (message: string): void => host.post({ kind: 'status', text: message });

  const documentOf = (uri: string): D | null =>
    (pinned !== null && uriOf(pinned) === uri ? pinned : host.openDocument(uri));

  /**
   * 光らせる。**前に光らせた文書が別なら、そちらを先に消す** — 見ないと、
   * 別の文書へ乗り換えたときに前の文書の光が永久に取り残される。
   */
  function light(ranges: readonly LitRange[]): void {
    const target = ranges.length === 0 || bound === null ? null : bound.uri;
    if (lit !== null && lit !== target) host.highlight(lit, []);
    if (target !== null) host.highlight(target, ranges);
    lit = target;
  }

  function rebind(document: D, line: number): void {
    const uri = uriOf(document);
    // 別の文書へ移ったら履歴は捨てる (覚えている桁が別の文書を指す)。光も消す。
    if (bound !== null && bound.uri !== uri) {
      history.clear();
      light([]);
    }
    const moved = bound === null || bound.uri !== uri || bound.line !== line;
    bound = { uri, line };
    if (moved) host.onBind?.(uri, line);
  }

  /** カーソルのあるフェンス。文書を固定していれば、その文書の中に限る。 */
  function fenceUnderCursor(): FenceNow<D> | null {
    const active = host.activeEditor();
    if (active === null) return null;
    if (pinned !== null && uriOf(active.document) !== uriOf(pinned)) return null;
    const fence = lookUp(active.document.getText(), active.selection.active.line + 1);
    return fence === null ? null : { document: active.document, source: fence.source, line: fence.line };
  }

  /**
   * いま掴めるフェンス。カーソルにフェンスがあればそちらへ乗り換え、無ければ
   * 覚えている文書のフェンスを引き直す。固定した文書は、どちらも無ければ
   * 最初のフェンスに落ちる (タブそのものがマップなので、空にしない)。
   */
  function currentFence(followCursor: boolean): FenceNow<D> | null {
    if (followCursor) {
      const under = fenceUnderCursor();
      if (under !== null) {
        const at = { uri: uriOf(under.document), line: under.line };
        const entered = seen === null || seen.uri !== at.uri || seen.line !== at.line;
        seen = at;
        if (entered) {
          rebind(under.document, under.line);
          return under;
        }
      }
    }

    if (bound !== null) {
      const document = documentOf(bound.uri);
      // 開き記号の行で引き直す。フェンスの中の書き換えでは動かない行だが、
      // 上に行が足されてずれたら見失う (そのときは掴み直してもらう)。
      const fence = document === null ? null : lookUp(document.getText(), bound.line);
      if (document !== null && fence !== null) {
        bound = { uri: bound.uri, line: fence.line };
        return { document, source: fence.source, line: fence.line };
      }
    }

    if (pinned !== null) {
      const first = firstOf(pinned.getText());
      if (first !== null) {
        rebind(pinned, first.line);
        return { document: pinned, source: first.source, line: first.line };
      }
    }
    return null;
  }

  /**
   * 直前に組んだ姿。**同じ本文なら組み直さない。**
   *
   * 1 回の書き換えで組み直しが 2 度来る — 文書が変わった知らせと、操作を捌いた
   * あとの 1 回。どちらも同じ本文を見るので、2 度目は同じ図を組み直して同じ
   * HTML を送り直すだけになる (図 1 枚 6ms + webview の入れ替え)。
   */
  let lastView: { readonly key: string; readonly view: MapView } | null = null;

  /** そのフェンスの語彙。**名札の綴りは殻が決める** (組む側と引く側で同じ 1 か所)。 */
  const chromeOf = (fence: FenceEditor): PanelChrome => ({
    palette: fence.palette(),
    typeNames: fence.typeNames(TYPE_LIST_ID),
    colorNames: fence.colorNames(COLOR_LIST_ID),
    swatches: renderSwatches(fence.wireColors?.() ?? []),
    // 能力表も語彙と一緒に (webview は同じ箱から読む)。
    foldsWire: fence.foldsWire,
    fine: fence.fine,
    fineFor: fence.fineFor ?? 'all',
  });

  function viewNow(followCursor: boolean): MapView {
    const fence = currentFence(followCursor);
    if (fence === null) {
      // **置けば作れるなら、空の升目を出す** (52 の docs/54 の決め 7)。
      // 案内だけだと、パレットから種類を選んでも押す場所が無い。
      if (canCreate()) {
        const empty = editor.view('', 1);
        return { html: empty.map, picker: '', issues: willCreateNote(editor.language), chrome: chromeOf(editor) };
      }
      const note = pinned === null ? lostNote(languages()) : noneNote(languages());
      // どのフェンスにも居ないときは、いま選ばれている言語の語彙のまま残す
      // (パレットが空になると、置きに戻る道が消える)。
      return { html: note, picker: '', issues: '', chrome: chromeOf(editor) };
    }

    // 一覧は文書全体から組むので、本文だけでなく文書も鍵に入れる。
    const markdown = fence.document.getText();
    // **開閉も鍵に入れる。** 本文が同じでも、広げた姿と畳んだ姿は別物。
    const key = `${uriOf(fence.document)}\u0000${fence.line}\u0000${ercOpen ? '1' : '0'}\u0000${markdown}`;
    if (lastView !== null && lastView.key === key) return lastView.view;

    const view = editor.view(fence.source, fence.line);
    const now: MapView = {
      html: view.map,
      picker: renderFencePicker(allFences(markdown), fence.line),
      issues: view.issues,
      // **件数は常に、中身は広げているときだけ。** 畳んだまま運んでも出さない。
      ...(view.erc === undefined
        ? {}
        : { erc: { count: view.erc.count, open: ercOpen, html: ercOpen ? view.erc.html : '' } }),
      // **語彙はいまのフェンスのもの。** 言語が変わるとパレットも候補も
      // 入れ替わるので、升目と一緒に送り直す (52 の docs/19)。
      chrome: chromeOf(editor),
    };
    lastView = { key, view: now };
    return now;
  }

  /**
   * 帯の 1 行を押されたら、その行をエディタで見せて光らせる。
   * **書き換えはしない** — 直すのは書き手の仕事で、こちらは場所を指すだけ。
   * 光を消さないので `refresh` は呼ばない (呼ぶと自分で消してしまう)。
   *
   * **先にテキストエディタを見せてもらう。** タブそのものがマップのときは、
   * その文書のテキストエディタが 1 つも開いていないことがあり、光らせるだけでは
   * 見える所に何も起きない (押しても動かない行になる)。押すのは「そこへ行く」と
   * いう申し出なので、開いて前に出してよい (掴んでいる最中の光とは別の話)。
   *
   * **行は文書の中に収める。** 閉じていないフェンスの YAML エラーは本文の
   * 1 行先に出るので、打ちかけのフェンスが文末にあると帯は最後の行より先を
   * 指す。そのまま `lineAt` を呼ぶと vscode が投げる。最後の行へ寄せるのは、
   * 行が無いからと黙って何もしないと**押しても動かない行**ができるため
   * (そのエラーは文末の話なので、最後の行が指す先として正しい)。
   */
  async function goTo(message: Incoming): Promise<void> {
    const line = typeof message.line === 'number' ? message.line : null;
    // 帯は組んだマップから来るので、そのときに覚えたフェンスがある。
    const document = bound === null ? null : documentOf(bound.uri);
    if (line === null || bound === null || document === null) return;

    // 帯の行は Markdown の 1 始まり、光らせる先は vscode の 0 始まり。
    const at = Math.min(Math.max(line - 1, 0), document.lineCount - 1);
    await host.showDocument?.(bound.uri, at);
    light([{ line: at, start: 0, end: document.lineAt(at).text.length }]);
  }

  /**
   * エディタのカーソルが指しているものをマップで光らせる (掴んだものを
   * エディタで光らせるのと逆向き)。マップを組み直すたびに送る —
   * 中身を入れ替えると印も消えるため。**見ているのと同じフェンスに限る**
   * (一覧で選んだ直後は、カーソルは別のフェンスにいることがある)。
   */
  function sendAim(): void {
    const active = host.activeEditor();
    const fence = active === null || bound === null || uriOf(active.document) !== bound.uri
      ? null
      : lookUp(active.document.getText(), active.selection.active.line + 1);
    if (active === null || fence === null || bound === null || fence.line !== bound.line) {
      host.post({ kind: 'aim' });
      return;
    }

    // Markdown の行 → フェンスの中の行。字下げのぶん桁を戻す (行ごとに数える)。
    const at = active.selection.active.line;
    const indent = indentOn(active.document, fence.line, at);
    const line = at + 1 - fence.line;
    const aim = editor.aimAt(fence.source, line, Math.max(0, active.selection.active.character - indent));
    if (aim === null) {
      host.post({ kind: 'aim' });
      return;
    }
    host.post({ kind: 'aim', what: aim.kind, id: aim.id });
    // **指したものの欄も送る。** カーソルは「いまどれを見ているか」なので、
    // 光らせるだけでなく直せるところまで出す (実機で頼まれた)。
    // 何も指していないときは送らない — マップで選んだ欄を閉じてしまうため。
    if (aim.kind === 'part') sendFields(editor.fieldsOf(fence.source, aim.id));
    if (aim.kind === 'wire') sendFields(editor.fieldsOf(fence.source, wireHandle(aim.id) ?? ''));
    // **節点にも欄がある** (名前)。カーソルが番地の上に来たら、そのまま付けられる。
    if (aim.kind === 'node') sendFields(editor.fieldsOf(fence.source, nodeHandle(aim.id) ?? ''));
  }

  /** webview へ最後に送った姿。**同じものを送り直さない** (下の `refreshWith`)。 */
  let posted: MapView | null = null;

  function refreshWith(followCursor: boolean): void {
    // **地図を組んでから履歴の状態を送る。** 別の文書へ移ったときに履歴を
    // 捨てるのはこの中なので、先に送るとボタンが有効なまま取り残される。
    const now = viewNow(followCursor);
    if (ownHistory) host.post({ kind: 'history', ...history.state() });
    // **同じ図なら送らない。** 送ると webview が中身を入れ替え、掴んでいたものと
    // カーソルの下が捨てられる (見た目は同じなのに手つきだけが途切れる)。
    if (posted !== now) {
      posted = now;
      host.post({ kind: 'map', ...now });
    }
    // **マップを入れ替えると webview は掴みを捨てる。** こちらの光も消さないと、
    // 掴んでいないのにエディタが光ったままになる。
    light([]);
    // 印も消えるので、カーソルが指しているものを送り直す。
    sendAim();
  }

  /**
   * 置いたときにフェンスを作れるか。**文書を固定している殻だけ** — カーソルを
   * 追うパネルでは、フェンスの外にあるカーソルから作る行を決められない。
   */
  const canCreate = (): boolean => pinned !== null && host.createFence !== undefined;

  /**
   * 検査 (ERC) の帯を広げているか。**セッションが持ち、文書には書かない**
   * (52 の docs/52 の決め 2) — 開き直すと畳んだ状態に戻る。作業のあいだ
   * ずっと出しておくものではなく、**確かめたいときに開くもの**だから。
   */
  let ercOpen = false;

  /**
   * 置く先のフェンス。**無ければ作る** (52 の docs/54 の決め 7)。
   * 作れない殻では今までどおり理由を言う。
   */
  async function fenceOrCreate(): Promise<FenceNow<D> | null> {
    const found = currentFence(true);
    if (found !== null) return found;
    if (!canCreate()) return fenceNow();

    const document = pinned as D;
    const line = await (host.createFence as NonNullable<typeof host.createFence>)(document, editor.language);
    if (line === null) {
      say(`${editor.language} フェンスを作れませんでした`);
      return null;
    }
    // **作ったフェンスを引き直す。** 返ってきた行をそのまま信じると、
    // 殻が書いた姿とフェンスの読み手の見方が食い違ったときに気づけない。
    const made = editor.fenceAt(document.getText(), line);
    if (made === null) {
      say(`${editor.language} フェンスを作れませんでした`);
      return null;
    }
    rebind(document, made.line);
    return { document, source: made.source, line: made.line };
  }

  /** いま掴めるフェンス。見失っていたら理由を言う (**黙って戻らない** — webview は「…」のまま待ってしまう)。 */
  function fenceNow(): FenceNow<D> | null {
    const fence = currentFence(true);
    if (fence === null) {
      say(pinned === null
        ? `フェンスを見失いました。${languages()} フェンスの中にカーソルを置いて掴み直します`
        : `この文書に ${languages()} フェンスがありません`);
    }
    return fence;
  }

  /**
   * 書き換えを作って当て、お知らせする。部品も節点も同じ段取り。
   *
   * **確認では止めない** (2026-09-02 の決め)。掴んで放すたびにモーダルが出ると、
   * 動かすという本来の用途で邪魔になる。接続の変化は黙らせず、帯に出す。
   * 戻したければ元に戻す (自前の履歴か、カスタムエディタなら VS Code の undo)。
   */
  /**
   * まとめて選んだものへ同じ操作を掛ける。**書き換えは 1 回**にまとめるので、
   * 戻すのも 1 回で済む。
   */
  async function runAll(
    labelled: string | (() => string),
    plans: readonly ((source: string) => EditResult)[],
  ): Promise<void> {
    const fence = fenceNow();
    if (fence === null || plans.length === 0) return;

    const before = fenceBody(fence.document, fence.line, fence.source);
    const { body, refusals } = foldPlans(fence.source, plans);
    // 札は当て終わってから組める (一緒に消えた数は、当てるあいだに数える)。
    const label = typeof labelled === 'string' ? labelled : labelled();
    if (body === fence.source) {
      say(refusals[0] ?? '変わりません');
      return;
    }

    // **文書の行に戻してから当てる** — 剥がした本文のままだと、閉じ記号の前に
    // 空行が増え、箇条書きの中では字下げが消える (`bodyFrom`)。
    const written = bodyFrom(fence.document, fence.line, fence.source, body);
    const applied = await host.replaceBody(fence.document, fence.line, before.length, written);
    if (!applied) {
      say('書き換えられませんでした');
      return;
    }
    if (ownHistory) {
      const now = lookUp(fence.document.getText(), fence.line);
      if (now !== null) {
        history.push({ label, before, after: fenceBody(fence.document, fence.line, now.source) });
      }
    }
    // **できなかったものは数えて言う。** 黙って飛ばすと、選んだのに動かなかった
    // ものがあることに気づけない。
    say(refusals.length === 0 ? label : `${label} (${refusals.length} 件できませんでした: ${refusals[0]})`);
  }

  async function run(request: Request): Promise<void> {
    const fence = request.creates === true ? await fenceOrCreate() : fenceNow();
    if (fence === null) return;

    const result = request.plan(fence.source);
    if (!result.ok) {
      say(result.error.message);
      return;
    }
    const changes: Changes = { edits: [], lines: [], ...result.value };
    if (changes.edits.length === 0 && changes.lines.length === 0) {
      say(request.already);
      return;
    }

    // **当てる前の本文を控える。** 履歴は桁ではなく本文で覚える (行の増減に耐える)。
    const before = fenceBody(fence.document, fence.line, fence.source);
    // 行の出し入れがあるときは本文を丸ごと書き戻す (桁の書き換えでは行を出し入れ
    // できない)。行の中だけの差し替えは今までどおり最小の差分で当てる。
    const applied = changes.lines.length === 0
      ? await host.applyEdits(fence.document, fence.line, changes.edits)
      : await host.replaceBody(
        fence.document,
        fence.line,
        before.length,
        bodyAfter(fence.document, fence.line, fence.source, changes),
      );
    if (!applied) {
      say('書き換えられませんでした');
      return;
    }
    if (ownHistory) {
      // 当てたあとの姿も控える。**見失ったら積まない** — 嘘の控えを積むと、
      // 次の「戻す」が関わりのない字を書き換える。
      const now = lookUp(fence.document.getText(), fence.line);
      if (now !== null) {
        history.push({ label: request.label, before, after: fenceBody(fence.document, fence.line, now.source) });
      }
    }
    const changed = describeDiff(changes.diff);
    say(`${request.done(changes)}${changed === null ? '' : `。${changed}`}`);
  }

  /**
   * その穴を、`start` から `to` への差だけずらした穴。**フェンスに数えさせる** —
   * 番地の綴りは板ごとに違うので、殻は引き算を知らない。
   */
  function shiftCell(cell: string, start: string, to: string): string | null {
    const step = editor.stepsTo(start, to);
    return step === null ? null : editor.step(cell, step.rows, step.cols);
  }

  /**
   * 掴んだ升とアンカーの差を引いた行き先。**掴んだ升が無い (鍵で持ち上げた)
   * ときや、差を数えられない綴りのときは、落とした升そのまま。**
   */
  function shiftedTarget(source: string, handle: string, grabbed: string | null, dropped: string): string {
    if (grabbed === null || grabbed === dropped) return dropped;
    const anchor = editor.cellsOf(source, handle)[0];
    if (anchor === undefined) return dropped;
    return shiftCell(anchor, grabbed, dropped) ?? dropped;
  }

  /**
   * 絵をずらす量 (`from[0]` → `cells[0]`)。**端数の升は DOM に無い**ので殻は要素を引けず、
   * 差を数で受け取る (52 の docs/23)。数えられない綴り (レール) なら添えない。
   */
  const shiftOf = (from: readonly string[] | undefined, cells: readonly string[]): { readonly shift?: GridStep } => {
    const start = from?.[0];
    const end = cells[0];
    if (start === undefined || end === undefined) return {};
    const shift = editor.stepsTo(start, end);
    return shift === null ? {} : { shift };
  };

  /**
   * ゴーストの答え。**組み立てるのは 1 か所** — 試し当ての答えも、端数を綴れなかった
   * 断りも同じ封筒で返る (欄が増えたときに片方だけ古くならない)。
   */
  const sendGhost = (
    key: string,
    cells: readonly string[],
    ok: boolean,
    why = '',
    from?: readonly string[],
    chip?: string,
  ): void => host.post({
    kind: 'ghost', key, cells, ok, why,
    ...(from === undefined ? {} : { from }),
    ...(chip === undefined ? {} : { chip }),
    ...shiftOf(from, cells),
  });

  /** 端数を綴りにできなかった理由。`resolveFine` の答えそのものになる。 */
  type Refused = { readonly ok: false; readonly why: string };
  const refuse = (why: string): Refused => ({ ok: false, why });

  /**
   * webview から来た端数 (`{ rows, cols }`)。無ければ null、形が違えば断り。
   * 大きさは升の半分まで (それより外は隣の升)。交点ちょうど (0, 0) は「端数無し」。
   */
  const UNREADABLE = 'マップからの知らせを読めませんでした (端数が読めません)';

  function fractionOf(value: unknown): GridStep | null | Refused {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return refuse(UNREADABLE);
    const { rows, cols } = value as { readonly rows?: unknown; readonly cols?: unknown };
    if (typeof rows !== 'number' || typeof cols !== 'number' || Math.abs(rows) > 0.5 || Math.abs(cols) > 0.5) {
      return refuse(UNREADABLE);
    }
    return rows === 0 && cols === 0 ? null : { rows, cols };
  }

  /**
   * (升, 端数) → 綴り。端数が無ければそのまま。**綴りを組むのはフェンス** (`step`) —
   * 殻は `_` も `.25` も知らない。刻みに合わない端数は断る (circuit の `round()` は
   * `.125` を `.13` に黙って丸める)。穴の間が無い板では断る (webview は送らないが、境界で見る)。
   */
  function spellOf(cell: string, fine: GridStep | null): string | Refused {
    if (fine === null) return cell;
    if (editor.fine === null) return refuse('この盤では穴の間に置けません');
    if (!Number.isInteger(fine.rows * editor.fine) || !Number.isInteger(fine.cols * editor.fine)) {
      return refuse(`端数を読めませんでした (1/${editor.fine} 升の倍数ではありません)`);
    }
    return editor.step(cell, fine.rows, fine.cols) ?? refuse(`${cell} の間には置けません`);
  }

  /**
   * **入口で 1 回**、端数の付いた「どこへ」を綴りにする。そこから先は文字列のまま —
   * 置く・動かす・引きずる・配線の全部が同じ場所を通るので、片方だけ端数を忘れない。
   * 端数が無ければ知らせはそのまま返る (1 バイトも変わらない)。
   */
  function resolveFine(message: Incoming): { readonly ok: true; readonly message: Incoming } | Refused {
    if (message.fine === undefined && message.fromFine === undefined) return { ok: true, message };
    // **端数そのものと見分ける。** どちらもオブジェクトなので、断りの印 (`ok`) で判じる。
    const isRefused = (value: unknown): value is Refused =>
      typeof value === 'object' && value !== null && 'ok' in value;
    const spell = (cell: unknown, fine: unknown): string | Refused => {
      const written = text(cell);
      const fraction = fractionOf(fine);
      if (written === null) return refuse('マップからの知らせを読めませんでした (置き先がありません)');
      return isRefused(fraction) ? fraction : spellOf(written, fraction);
    };
    // 置くときだけ穴が何個も並ぶ (`at`)。ほかは `to` 1 つなので、下の道を通る。
    if (message.kind === 'addPart') {
      const fines: readonly unknown[] = Array.isArray(message.fine) ? message.fine : [];
      const at: readonly unknown[] = Array.isArray(message.at) ? message.at : [];
      const spelled = at.map((cell, index) => spell(cell, fines[index] ?? null));
      return spelled.find(isRefused) ?? { ok: true, message: { ...message, at: spelled } };
    }
    // preview / move / moveNode / addWire: `to` に `fine`、1 本目の端は `from` に `fromFine`。
    const to = spell(message.to, message.fine);
    if (isRefused(to)) return to;
    if (message.fromFine === undefined) return { ok: true, message: { ...message, to } };
    const from = spell(message.from, message.fromFine);
    return isRefused(from) ? from : { ok: true, message: { ...message, to, from } };
  }

  /** マップから来た「何を・どこへ」。部品は 1 つだけ動き、節点は交点ごと動く。 */
  async function move(message: Incoming): Promise<void> {
    // **黙って戻らない。** webview は「R1 を b1 へ…」を出したまま待っている。
    const written = text(message.to);
    if (written === null) {
      say('マップからの知らせを読めませんでした (置き先がありません)');
      return;
    }

    // **まとめて選んでいるときは、押した部品の動き方をほかにも掛ける。**
    // 行き先は 1 つしか来ないので、その差だけ全部をずらす。
    const together = handles(message.parts);
    if (message.kind === 'move' && together.length > 1) {
      const anchor = text(message.part);
      const fence = fenceNow();
      const from = anchor === null || fence === null ? [] : editor.cellsOf(fence.source, anchor);
      const start = from[0];
      if (anchor === null || start === undefined) {
        say('マップからの知らせを読めませんでした (どこから動かすかがありません)');
        return;
      }
      await runAll(
        `${together.length} 個を動かしました`,
        together.map((one) => (source: string) => {
          const at = editor.cellsOf(source, one)[0];
          const to = at === undefined ? null : shiftCell(at, start, written);
          return to === null
            ? { ok: false as const, error: { message: `${editor.nameOf(one)} の動かし先を数えられません`, line: null } }
            : editor.movePart(source, one, to);
        }),
      );
      return;
    }

    if (message.kind === 'move') {
      const handle = text(message.part);
      // **掴むのは名札、言うのは名前** (`core/edit/handles.ts`)。同じ名前の記号が
      // 2 つ以上あることがあるので、指すときだけ名札を使う。
      const part = handle === null ? null : editor.nameOf(handle);
      if (handle === null || part === null) {
        say('マップからの知らせを読めませんでした (部品がありません)');
        return;
      }
      // **掴んだ場所とアンカーの差を保つ。** 部品は書かれた 1 つ目の穴を基準に
      // 動くので、胴の途中を掴んだときに差を引かないと、その分だけ跳ぶ
      // (実機で「部品をドラッグして移動すると、部品シャドウがズレる」)。
      const grabbed = text(message.from);
      const target = (source: string): string => shiftedTarget(source, handle, grabbed, written);
      await run({
        label: `${part} を ${written} へ`,
        done: () => `${part} を ${written} へ動かしました`,
        already: `${part} はすでに ${written} にあります`,
        plan: (source) => editor.movePart(source, handle, target(source)),
      });
      return;
    }

    const from = text(message.from);
    if (from === null) {
      say('マップからの知らせを読めませんでした (どの節点かがありません)');
      return;
    }
    await run({
      label: `${from} の節点を ${written} へ`,
      done: () => `${from} の節点を ${written} へ動かしました`,
      already: `節点はすでに ${from} にあります`,
      plan: (source) => editor.movePoint(source, from, written),
    });
  }

  /** 欄の名前 (お知らせに出す)。 */
  const FIELD_NAMES: Readonly<Record<string, string>> = { type: '種類', value: '値', label: 'ラベル', color: '色' };

  /**
   * 欄の書き換え。**1 部品 = 1 行の文法なので、行の中のトークン差し替えに落ちる。**
   * 名前だけは 3 か所 (鍵・配線の足・注釈) に散るので別の道を通る。
   */
  async function editField(message: Incoming): Promise<void> {
    // **名前の無いものは行で指す。** 配線には名前が無いので、名札を殻が組む
    // (綴りは 3 つのフェンスで同じ。注釈も同じ考え方)。
    const handle = handleOf(text(message.what), text(message.part));
    const part = handle === null ? null : editor.nameOf(handle);
    const field = text(message.field);
    const written = text(message.text) ?? '';
    const name = field === null ? undefined : FIELD_NAMES[field];
    if (handle === null || part === null || field === null || name === undefined) {
      say('マップからの知らせを読めませんでした (どの欄かがありません)');
      return;
    }
    await run({
      label: `${part} の${name}を`,
      done: () => (written === '' ? `${part} の${name}を消しました` : `${part} の${name}を ${written} にしました`),
      already: `${part} の${name}は変わりません`,
      plan: (source) => editor.setField(source, handle, field, written),
    });
  }

  /** 名前を変える。鍵・配線の足・注釈の指し先を一緒に書き換える。 */
  async function rename(message: Incoming): Promise<void> {
    // **節点の名前も同じ道**。書く先は `points:` の 1 行だが、押した所は同じ欄。
    const handle = handleOf(text(message.what), text(message.part));
    const from = handle === null ? null : editor.nameOf(handle);
    const to = text(message.text);
    if (handle === null || from === null || to === null || to === '') {
      say('マップからの知らせを読めませんでした (新しい名前がありません)');
      return;
    }

    await run({
      label: `${from} を ${to} に`,
      done: () => `${from} を ${to} に改名しました`,
      already: `${from} の名前は変わりません`,
      plan: (source) => editor.rename(source, handle, to),
    });
  }

  /** webview から来た向き (90 度を何回・反転するか)。無ければ回さない。 */
  const orientationOf = (message: Incoming): { readonly turn: number; readonly flip: boolean } => ({
    turn: typeof message.turn === 'number' && Number.isInteger(message.turn) ? message.turn : 0,
    flip: message.flip === true,
  });

  /**
   * マップから来た「この部品をここへ」。**名前は訊かない** — ID は接頭辞から付け、
   * ID が図に出る種類も既定の名前で置く (置く流れを窓で止めない。名前は欄で直す)。
   */
  async function addPart(message: Incoming): Promise<void> {
    const type = text(message.type);
    const written = Array.isArray(message.at) ? message.at.map(text) : null;
    if (type === null || written === null || written.some((one) => one === null)) {
      say('マップからの知らせを読めませんでした (置く先がありません)');
      return;
    }

    // **名前はフェンスを作る前に決める。** 作ってから種類を断ると、空のフェンスだけが
    // 残る。フェンスが無いなら、空の本文に対して名前を付ける (`run` が作る)。
    const fence = currentFence(true);
    if (fence === null && !canCreate()) {
      fenceNow();
      return;
    }

    const id = editor.nextId(fence?.source ?? '', type);
    if (id === null) {
      say(`${type} には名前を付けられません (知らない種類です)`);
      return;
    }

    const at = written as readonly string[];
    const orientation = orientationOf(message);
    await run({
      label: `${id} を`,
      done: () => `${id} (${type}) を ${at.join(' ')} へ置きました`,
      already: '置くものがありません',
      plan: (source) => editor.addPart(source, { id, type, at, ...orientation }),
      // **置くならフェンスを作ってよい** (52 の docs/54 の決め 7)。
      creates: true,
    });
  }

  /**
   * ゴースト — 置く・動かす前に「どの穴を使うか、置けるか」を答える。
   * **押したときと同じ関数を本文の写しに試し当てて**、そのあとの穴を読むので、
   * 見せた物と書かれる物が食い違わない。文書は触らない (何度でも呼べる)。
   */
  function preview(message: Incoming): void {
    const key = text(message.key) ?? '';
    const answer = (
      cells: readonly string[],
      ok: boolean,
      why = '',
      from?: readonly string[],
      chip?: string,
    ): void => sendGhost(key, cells, ok, why, from, chip);

    const fence = currentFence(true);
    const plan = fence === null ? null : plannedFor(message, fence.source);
    if (fence === null || plan === null) {
      answer([], false);
      return;
    }

    // **押したときと同じ書き換えを本文の写しに当てて**、そのあとの穴を読む。
    // 見せた物と書かれる物が食い違わない (文書は触らないので何度でも呼べる)。
    if (!plan.result.ok) {
      // **置けなくても姿は見せる (赤い影)。** 動かすときは図にある絵をそのまま
      // 写せるので前から赤く出ていたが、置くときは図にまだ無いぶん影ごと消えて
      // いた — 回して置けない向きにすると、何を持っているのかが画面から消える
      // (実機で「回転して置けない場合でもシャドウを赤で表示して」)。
      const shown = refusedChip(fence.source, fence.line, plan);
      answer(shown?.cells ?? [plan.at], false, plan.result.error.message, shown?.from ?? plan.from, shown?.chip);
      return;
    }
    const after = applyRewrite(fence.source, plan.result.value);
    const cells = plan.cells(after);
    // **置く前の部品は図に無いので、写しの図から切り出して渡す。**
    // 姿は種類と向きと足の数で決まり、場所では変わらないので**1 度描いて使い回す**
    // (穴をまたぐたびに図を組み直すと、ゴーストの速さが元に戻ってしまう)。
    const drawn = plan.shape === undefined || plan.ghostId === undefined
      ? null
      : ghostChip(plan.shape, plan.ghostId, after, fence.line, cells);
    answer(cells, true, '', drawn?.from ?? plan.from, drawn?.chip);
  }

  /** ゴーストの問い合わせ 1 件を、書き換えと「そのあとどの穴を読むか」に直す。 */
  function plannedFor(
    message: Incoming,
    source: string,
  ): {
    readonly result: EditResult;
    readonly at: string;
    readonly cells: (after: string) => readonly string[];
    /** 動かす前の穴 (動かすときだけ)。 */
    readonly from?: readonly string[];
    /** 姿を決めるもの (置くときだけ)。これが変わらなければ絵を描き直さない。 */
    readonly shape?: string;
    /** 写しの図の中でのゴーストの名前 (置くときだけ)。 */
    readonly ghostId?: string;
    /**
     * 同じものを**別の穴に**当ててみる (置くときだけ)。置けない所を指している
     * ときに、姿を描くための足場を探すのに使う。
     */
    readonly trial?: (at: string) => EditResult;
  } | null {
    const to = text(message.to);
    if (to === null) return null;

    if (message.what === 'place') {
      const type = text(message.type);
      if (type === null) return null;
      // ドラッグで間隔を選んでいる最中は 1 本目の足も来る。**押したときと同じ穴を渡す**
      // ので、ゴーストが見せる穴と書かれる穴が食い違わない。
      const from = text(message.from);
      const at = from === null ? [to] : [from, to];
      // 名前は仮。**置く前なので何でもよい**が、既にある名前と重ならないように。
      // **名前は置いたときに付くものを使う。** ゴーストにも名札が出るので、
      // `GHOST` と書いてあると「そういう名前で置かれる」と読めてしまう。
      // 空いている名前が無いときだけ仮の名前にする (図が出ないよりはよい)。
      const id = editor.nextId(source, type) ?? GHOST_ID;
      const part = { id, type, at, ...orientationOf(message), preview: true };
      return {
        result: editor.addPart(source, part),
        at: to,
        // **足場を探せるのは 1 穴で置くときだけ。** 間隔をドラッグで選んでいる
        // 最中は穴が 2 つ来て、ずらすと間隔そのものが変わる (姿が別物になる)。
        ...(at.length === 1 ? { trial: (spot: string) => editor.addPart(source, { ...part, at: [spot] }) } : {}),
        cells: (after) => editor.cellsOf(after, id),
        // 足の数まで鍵に入れる (2 端子はドラッグで間隔が変わり、姿も変わる)。
        // 名前も入れる — 本文が変われば次の名前が変わり、名札も変わる。
        shape: [id, type, part.turn ?? 0, part.flip === true ? 1 : 0, at.length].join('\u0000'),
        ghostId: id,
      };
    }

    if (message.what === 'move') {
      const handle = text(message.part);
      if (handle === null) return null;
      // **影も掴んだ差を保つ** (落とすときと同じ勘定。実機で「部品シャドウが
      // ズレる」と言われたのは、ここで差を引いていなかったため)。
      const target = shiftedTarget(source, handle, text(message.from), to);
      return {
        result: editor.movePart(source, handle, target, { preview: true }),
        at: target,
        cells: (after) => editor.cellsOf(after, handle),
        from: editor.cellsOf(source, handle),
      };
    }

    if (message.what === 'node') {
      const from = text(message.from);
      // 節点は交点そのものなので、光るのは行き先の 1 つ (来ているものは動かない)。
      return from === null
        ? null
        : { result: editor.movePoint(source, from, to, { preview: true }), at: to, cells: () => [to] };
    }
    return null;
  }

  /**
   * 置くゴーストの絵。**姿が変わったときだけ図を組み直す** —
   * 場所を変えただけなら、前に描いた絵とそのときの穴を返して殻にずらさせる。
   */
  let lastGhost: { readonly shape: string; readonly chip: string; readonly from: readonly string[] } | null = null;

  /**
   * 置けない所を指しているときの姿。**赤い影を出すための足場**を探して描く。
   *
   * 姿は種類と向きと足の数で決まり、場所では変わらない。だから**どこか置ける穴**に
   * 試し当てて絵を切り出し、そこから指した穴までの差を添えれば、置けない場所にも
   * 同じ姿を出せる。置ける穴が見つからなければ諦める (影は出ない)。
   */
  const ROOM_REACH = 3;

  /** 近い順に見る差 (0 から `reach` 升まで)。**同じ距離なら行が先**。 */
  function* nearby(reach: number): Generator<{ readonly rows: number; readonly cols: number }> {
    yield { rows: 0, cols: 0 };
    for (let far = 1; far <= reach; far += 1) {
      for (let rows = -far; rows <= far; rows += 1) {
        for (const cols of new Set([far - Math.abs(rows), -(far - Math.abs(rows))])) {
          yield { rows, cols };
        }
      }
    }
  }

  function refusedChip(
    source: string,
    line: number,
    plan: { readonly at: string; readonly shape?: string; readonly ghostId?: string; readonly trial?: (at: string) => EditResult },
  ): { readonly chip: string; readonly cells: readonly string[]; readonly from: readonly string[] } | null {
    const { shape, ghostId, trial } = plan;
    if (shape === undefined || ghostId === undefined || trial === undefined) return null;

    // **同じ姿を描いてあれば探さない。** 置ける穴を掃いたあとで縁へ寄せる、が
    // ふつうの触り方なので、たいていはここで当たる。
    const drawn = lastGhost !== null && lastGhost.shape === shape
      ? lastGhost
      : searchRoom(source, line, shape, ghostId, plan.at, trial);
    if (drawn === null) return null;

    const anchor = drawn.from[0];
    const shift = anchor === undefined ? null : editor.stepsTo(anchor, plan.at);
    if (shift === null) return null;
    const cells = drawn.from
      .map((cell) => editor.step(cell, shift.rows, shift.cols))
      .filter((cell): cell is string => cell !== null);
    return cells.length === 0 ? null : { chip: drawn.chip, cells, from: drawn.from };
  }

  function searchRoom(
    source: string,
    line: number,
    shape: string,
    ghostId: string,
    at: string,
    trial: (at: string) => EditResult,
  ): { readonly chip: string; readonly from: readonly string[] } | null {
    for (const step of nearby(ROOM_REACH)) {
      const cell = editor.step(at, step.rows, step.cols);
      if (cell === null) continue;
      const fits = trial(cell);
      if (!fits.ok) continue;
      const after = applyRewrite(source, fits.value);
      const cells = editor.cellsOf(after, ghostId);
      if (cells.length === 0) continue;
      const drawn = ghostChip(shape, ghostId, after, line, cells);
      if (drawn !== null) return drawn;
    }
    return null;
  }

  function ghostChip(
    shape: string,
    id: string,
    after: string,
    line: number,
    cells: readonly string[],
  ): { readonly chip: string; readonly from: readonly string[] } | null {
    if (lastGhost !== null && lastGhost.shape === shape) return lastGhost;

    const chip = chipOf(editor.view(after, line).map, id);
    if (chip === null) return null;
    lastGhost = { shape, chip, from: cells };
    return lastGhost;
  }

  /**
   * webview から来た「いくつ動かすか」。升 1 つぶんの整数と、**1/`fine` 升の倍数**
   * (矢印) を通す。刻みに乗らない数は 0 — 綴りに直せない場所を作らせない。
   */
  const count = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    if (Number.isInteger(value)) return value;
    if (editor.fine === null) return 0;
    // 掛けた答えは 2 進小数に収まらない (`0.7 * 10`) ので、丸めの残りを許す。
    const steps = value * editor.fine;
    return Math.abs(steps - Math.round(steps)) < 1e-9 ? value : 0;
  };

  /**
   * マップから来た「矢印で 1 穴」。**動かすのと同じ道**を通る (接続の変化も
   * 同じように出る) が、行き先は殻ではなくフェンスが数える。
   */
  async function nudge(message: Incoming): Promise<void> {
    const handle = text(message.part);
    const part = handle === null ? null : editor.nameOf(handle);
    const fence = handle === null ? null : fenceNow();
    if (handle === null || part === null || fence === null) {
      if (handle === null) say('マップからの知らせを読めませんでした (どの部品かがありません)');
      return;
    }

    const anchor = editor.cellsOf(fence.source, handle)[0];
    const to = anchor === undefined ? null : editor.step(anchor, count(message.rows), count(message.cols));
    if (to === null) {
      say(`${part} はこれ以上その向きへ動かせません`);
      return;
    }
    await run({
      label: `${part} を ${to} へ`,
      done: () => `${part} を ${to} へ動かしました`,
      already: `${part} はすでに ${to} にあります`,
      plan: (source) => editor.movePart(source, handle, to),
    });
  }

  /**
   * マップから来た「これをもう 1 つ」。**種類と向きは元のまま、名前は次の番号**で、
   * 1 穴ずらして置く。重ねて置くと図の上で見分けが付かない。
   */
  /**
   * 複製する。**作った名前を返す** — 呼ぶ側が組み直しのあとで選び直すため
   * (組み直しは選択を捨てるので、先に選ぶと消える)。
   */
  /**
   * 配線の端だけを引き直す。**線そのものは動かない** — 掴んだ端の綴りだけを
   * 差し替えるので、もう片方の端も色も残る (実機で「配線全体を移動しない」)。
   */
  async function moveWireEnd(message: Incoming): Promise<void> {
    const line = text(message.line);
    const end = text(message.end);
    const to = text(message.to);
    if (line === null || to === null || (end !== 'from' && end !== 'to')) {
      say('マップからの知らせを読めませんでした (配線の端がありません)');
      return;
    }
    if (editor.moveWireEnd === undefined) {
      say('このフェンスでは配線の端を引き直せません');
      return;
    }
    const move = editor.moveWireEnd;
    // 端数は入口で綴りになっている (`resolveFine`)。
    const written = to;
    await run({
      label: `${line} 行目の配線の端を ${written} へ`,
      done: () => `${line} 行目の配線の端を ${written} へ引き直しました`,
      already: `配線の端はすでに ${written} にあります`,
      plan: (source) => move(source, `wire:${line}`, end, written),
    });
  }

  /**
   * 注釈の言葉をクリップボードへ (実機で「テキストコピー」を頼まれた)。
   *
   * **写せるものかどうかはフェンスが決める** (`textOf`) — 言葉を持つのは
   * `text` の注釈だけで、部品や配線には写す字が無い。殻が写せないとき
   * (クリップボードを持たない宿主) も、そう言って終わる。
   */
  async function copyText(message: Incoming): Promise<void> {
    const handle = text(message.part);
    const fence = fenceNow();
    if (handle === null || fence === null) {
      say('マップからの知らせを読めませんでした (写すものがありません)');
      return;
    }
    const written = editor.textOf?.(fence.source, handle) ?? null;
    if (written === null) {
      say(`${editor.nameOf(handle)} に写せる字がありません (text の注釈だけ写せます)`);
      return;
    }
    if (host.copyText === undefined) {
      say('この画面ではクリップボードへ写せません');
      return;
    }
    await host.copyText(written);
    say(`「${written}」を写しました`);
  }

  async function duplicate(message: Incoming): Promise<readonly string[]> {
    const picked = handles(message.parts);
    if (picked.length > 1) {
      const made: string[] = [];
      // **名前は 1 つずつ、その時点の本文から取る** — 先に決め打つと、
      // 2 つ目以降が 1 つ目と同じ名前になる。
      await runAll(
        `${picked.length} 個を複製しました`,
        picked.map((one) => (source: string) => {
          const fields = editor.fieldsOf(source, one);
          const id = fields === null ? null : editor.nextId(source, fields.type);
          if (id === null) {
            return { ok: false as const, error: { message: `${editor.nameOf(one)} は複製できません`, line: null } };
          }
          made.push(id);
          return editor.duplicate(source, one, id);
        }),
      );
      return made;
    }
    const handle = text(message.part);
    const fence = handle === null ? null : fenceNow();
    if (handle === null || fence === null) {
      if (handle === null) say('マップからの知らせを読めませんでした (どの部品かがありません)');
      return [];
    }

    const fields = editor.fieldsOf(fence.source, handle);
    const id = fields === null ? null : editor.nextId(fence.source, fields.type);
    if (id === null) {
      say(`${editor.nameOf(handle)} は複製できません (名前を付けられません)`);
      return [];
    }
    await run({
      label: `${id} を`,
      done: () => `${editor.nameOf(handle)} を ${id} として複製しました`,
      already: '置くものがありません',
      plan: (source) => editor.duplicate(source, handle, id),
    });
    return [id];
  }

  /**
   * 「いまはこれを選んでいる」と webview へ伝える。**選ぶのは webview の
   * 持ち物**なので知らせで渡す (カーソルが指したときと同じ道)。
   */
  function pick(what: 'part' | 'wire' | 'node', ids: readonly string[]): void {
    const first = ids[0];
    if (first === undefined) return;
    host.post({ kind: 'aim', what, id: first, ...(ids.length > 1 ? { also: [...ids] } : {}) });
    const fence = fenceNow();
    if (fence === null) return;
    sendFields(editor.fieldsOf(fence.source, handleOf(what, first) ?? ''));
  }

  /** マップから来た「ここからここへ 1 本」。配線は**交点から交点へ**引く。 */
  async function addWire(message: Incoming): Promise<void> {
    const from = text(message.from);
    const to = text(message.to);
    if (from === null || to === null) {
      say('マップからの知らせを読めませんでした (引く先がありません)');
      return;
    }
    // 折れ方は放したときの Shift で決まる (`|-` は欄から。まだ無い)。
    const operator = message.operator === '-|' || message.operator === '|-' ? message.operator : '--';
    // **見本で選んだ色で引く** (実機で「色パレットから色を選択した後、配線すると
    // その色で配線できるようにする」)。無ければ書かない (フェンスの既定色)。
    const color = text(message.color) ?? undefined;
    const written = `${from} ${operator} ${to}${color === undefined ? '' : ` ${color}`}`;

    await run({
      label: `${written} を`,
      done: () => `${written} を引きました`,
      already: '引くものがありません',
      plan: (source) => editor.addWire(source, from, to, operator, color),
      creates: true,
    });
  }

  /**
   * まとめて消す手順。**名札は書かれた場所で決まる**ので、1 つ消すたびに
   * 残りの名札がずれる (実機で「範囲削除した部品がフェンスに残っている」)。
   *
   * | 消すもの | 名札 | 何でずれるか |
   * | --- | --- | --- |
   * | 注釈 | `note:11` (行番号) | 上の行が消えると別の行を指す |
   * | 配線 | 行番号 | 同上 |
   * | 同じ名前の記号 | `VCC#2` (書いた順) | 前の `VCC` が消えると番号が繰り上がる |
   *
   * 手当ては 2 つ。
   *
   * 1. **下の行から消す。** 「書いた順」の数え方は前を数えるので、下から
   *    消せば動かない (`VCC#2` は最後まで 2 つ目のまま)。
   * 2. **行で指すものは、当てる直前に数え直す。** 部品を消すと足を指す配線や
   *    指している注釈まで一緒に落ちるので、順だけでは足りない
   *    (`wires:` を `parts:` より前に書いた図で、選んでいない配線が消えた)。
   *
   * 空になった `parts:` / `wires:` の鍵を落とすのは各フェンスの `delete…` が
   * やるので、**続けて当てる**ところ (`runAll`) は今までどおり。
   *
   * 見出しのコメントも 1 つずつ連れていく (`withHeadings`)。組の最後の 1 行を
   * 消した回に落ちる。消すのは行ごとなので、下の数え直しはそのまま効く。
   * `counted` には一緒に消えたコメントの行数を足していく。
   */
  function deletions(
    parts: readonly string[],
    wires: readonly string[],
    counted: (comments: number) => void,
  ): readonly ((source: string) => EditResult)[] {
    const source = normalizeNewlines(fenceNow()?.source ?? '');
    const was = source.split('\n');
    const targets = [
      ...wires.map((id) => ({ id, line: Number(id), wire: true })),
      // 書かれている場所はフェンスに訊く (エディタで光らせる先と同じ道)。
      // **注釈は名札そのものが行**なので、そちらを先に読む — 指し先を持たない
      // 注釈 (`source`) は光らせる先が無く、`spansOf` が空で返る。
      ...parts.map((id) => ({
        id,
        line: noteLineOf(id) ?? editor.spansOf(source, 'part', id)[0]?.line ?? 0,
        wire: false,
      })),
    ].sort((a, b) => b.line - a.line);

    const plan = (one: (typeof targets)[number], body: string): EditResult => {
      // 名前で引くものは、行がずれても正しく当たる。
      if (!one.wire && noteLineOf(one.id) === null) return editor.deletePart(body, one.id);
      const at = lineNow(was, normalizeNewlines(body).split('\n'), one.line);
      // **もう消えているものは断りにしない。** 一緒に連れていかれただけで、用は済んでいる。
      if (at === null) return { ok: true, value: { edits: [], diff: { lost: [], gained: [] } } };
      return one.wire ? editor.deleteWire(body, at) : editor.deletePart(body, `note:${at}`);
    };
    return targets.map((one) => (body: string) => {
      const result = withHeadings(body, plan(one, body));
      if (result.ok) counted(result.value.comments ?? 0);
      return result;
    });
  }

  /** マップから来た「これを消す」。部品は足を指す配線も連れていく。 */
  async function remove(message: Incoming): Promise<void> {
    const what = text(message.what);
    const picked = handles(message.ids);
    const wires = handles(message.wires);
    if (picked.length + wires.length > 1) {
      let comments = 0;
      const plans = deletions(picked, wires, (more) => { comments += more; });
      await runAll(() => `${picked.length + wires.length} 個を消しました${alongWith(0, comments)}`, plans);
      return;
    }
    const id = text(message.id);
    if (id === null || (what !== 'part' && what !== 'wire')) {
      say('マップからの知らせを読めませんでした (何を消すかがありません)');
      return;
    }

    if (what === 'wire') {
      const line = Number(id);
      await run({
        label: `${line} 行目の配線を`,
        done: (changes) => `${line} 行目の配線を消しました${alongWith(0, changes.comments ?? 0)}`,
        already: '消すものがありません',
        plan: (source) => withHeadings(source, editor.deleteWire(source, line)),
      });
      return;
    }

    const name = editor.nameOf(id);
    await run({
      label: `${name} を`,
      // **一緒に消えた配線の本数を言う。** 黙って消すと気づけない。
      done: (changes) => `${name} を消しました${alongWith(changes.wires ?? 0, changes.comments ?? 0)}`,
      already: '消すものがありません',
      plan: (source) => withHeadings(source, editor.deletePart(source, id)),
    });
  }

  /** マップから来た「これを回す / 反転する」。2 端子は番地の順が向きそのもの。 */
  async function turn(message: Incoming): Promise<void> {
    const picked = handles(message.parts);
    const handle = text(message.part);
    const part = handle === null ? null : editor.nameOf(handle);
    if (handle === null || part === null) {
      say('マップからの知らせを読めませんでした (どの部品かがありません)');
      return;
    }
    const quarters = typeof message.quarters === 'number' ? message.quarters : 0;

    // **まとめて選んでいるときは 1 回の書き換えにする** (戻すのも 1 回で済む)。
    if (picked.length > 1) {
      const what = message.kind === 'flip' ? '反転' : '回転';
      await runAll(
        `${picked.length} 個を${what}しました`,
        picked.map((one) => (source: string) => (
          message.kind === 'flip' ? editor.flip(source, one) : editor.turn(source, one, quarters)
        )),
      );
      return;
    }

    await run(message.kind === 'flip'
      ? {
        label: `${part} を反転`,
        done: () => `${part} を反転しました`,
        already: `${part} は反転できません`,
        plan: (source) => editor.flip(source, handle),
      }
      : {
        label: `${part} を回転`,
        done: () => `${part} を${quarters < 0 ? '反時計回り' : '時計回り'}に回しました`,
        already: `${part} は回せません`,
        plan: (source) => editor.turn(source, handle, quarters),
      });
  }

  /**
   * 1 歩戻す / やり直す。VS Code に頼めるならそちら (文書の undo がそのまま効く)。
   *
   * 自前なら**当ててから履歴を動かす** — 先に動かすと、当てられなかったときに
   * 履歴が嘘になる。当てられないのは、覚えたあとに手で書き換えられたとき。
   * **黙って当てない** — 本文を丸ごと書き戻すので、当てると手で書いた分まで
   * 消える。フェンスのどこか 1 行でも違えば断り、エディタの `Ctrl+Z` へ回す。
   */
  async function stepBack(kind: 'undo' | 'redo'): Promise<void> {
    if (host.nativeUndo !== undefined) {
      await host.nativeUndo(kind);
      return;
    }

    // **フェンスを先に確かめる。** 履歴を捨てるのは `currentFence` の中なので、
    // 先に取り出すと、別の文書へ切り替わった瞬間の 1 歩を当ててしまう。
    const fence = fenceNow();
    if (fence === null) return;

    const undoing = kind === 'undo';
    const step = undoing ? history.takeUndo() : history.takeRedo();
    if (step === null) {
      say(undoing ? '戻せる移動がありません' : 'やり直せる移動がありません');
      return;
    }

    // 戻すなら「後」から「前」へ、やり直すなら「前」から「後」へ。
    const expected = undoing ? step.after : step.before;
    const wanted = undoing ? step.before : step.after;
    const now = fenceBody(fence.document, fence.line, fence.source);
    const applied = sameBody(now, expected)
      && await host.replaceBody(fence.document, fence.line, expected.length, wanted);
    if (!applied) {
      if (undoing) history.dropUndo();
      else history.dropRedo();
      say(`${step.label} は戻せません (そのあと手で書き換えられています)。エディタの Ctrl+Z を使います`);
      return;
    }

    if (undoing) history.commitUndo();
    else history.commitRedo();
    say(undoing ? `${step.label} を戻しました` : `${step.label} をやり直しました`);
  }

  const rangesOf = (fence: FenceNow<D>, spans: readonly Span[]): readonly LitRange[] =>
    spans.map((span) => {
      // フェンスの中の行 → Markdown の行 (書き換えと同じ手口。字下げも行ごと)。
      const line = fence.line + span.line - 1;
      const start = span.column + indentOn(fence.document, fence.line, line);
      return { line, start, end: start + span.length };
    });

  /** 欄に出す中身。部品を選んでいないあいだは閉じておく。 */
  const sendFields = (part: PartFields | null): void => host.post({ kind: 'fields', part });

  /** マップから来た「これを掴んだ」。`what` が無ければ光を消す。 */
  function showSelection(message: Incoming): void {
    const what = text(message.what);
    const id = text(message.id);
    const fence = what === null || id === null ? null : currentFence(true);
    if (fence === null || what === null || id === null) {
      light([]);
      sendFields(null);
      return;
    }
    // **欄を持つものは自分で送る。** ここで空にしてから送り直すと 1 度ちらつく。
    if (what !== 'part' && what !== 'wire' && what !== 'node') sendFields(null);
    if (what === 'node') {
      light(rangesOf(fence, editor.spansOf(fence.source, 'node', id)));
      // **節点にも欄がある** (名前)。選んだらそのまま `points:` に付けられる。
      sendFields(editor.fieldsOf(fence.source, nodeHandle(id) ?? ''));
      return;
    }
    if (what === 'wire') {
      // 配線はフェンスの中の行で指す (1 行 = 1 本の経路)。行ごと光らせる。
      const at = fence.line + Number(id) - 1;
      const inside = Number.isInteger(Number(id)) && at >= 0 && at < fence.document.lineCount;
      light(inside ? [{ line: at, start: 0, end: fence.document.lineAt(at).text.length }] : []);
      // **配線にも欄がある** (色)。部品と同じ道で送る。
      sendFields(editor.fieldsOf(fence.source, wireHandle(id) ?? ''));
      return;
    }
    light(rangesOf(fence, editor.spansOf(fence.source, 'part', id)));
    sendFields(editor.fieldsOf(fence.source, id));
  }

  /** 一覧で選んだフェンスへ。**選んだ直後はカーソルを見ない** (別のフェンスにいることがある)。 */
  function pickFence(message: Incoming): void {
    const line = typeof message.line === 'number' ? message.line : null;
    const document = bound === null ? pinned : documentOf(bound.uri);
    if (line === null || document === null) return;

    // **言語をまたいで探す。** 一覧 (`allFences`) は 3 つの言語を混ぜて
    // 並べるので、いまの言語だけで引くと、別の言語の行を選んだ人に
    // 「フェンスがありません」と言うことになる。
    const fence = lookUp(document.getText(), line);
    if (fence === null) {
      say(`${line} 行目に ${languages()} フェンスがありません`);
      return;
    }
    rebind(document, fence.line);
    refreshWith(false);
  }

  return {
    view: () => viewNow(true),
    refresh: () => refreshWith(true),

    handle: async (received) => {
      // **端数は入口で綴りにする** (1/4 升。52 の docs/23)。
      const resolved = resolveFine(received);
      if (!resolved.ok) {
        // 試し当てはゴーストで断る (押す前に見える)。ほかは帯で言う。
        if (received.kind === 'preview') sendGhost(text(received.key) ?? '', [], false, resolved.why);
        else say(resolved.why);
        return;
      }
      const message = resolved.message;
      switch (message.kind) {
        case 'move':
        case 'moveNode':
          await move(message);
          refreshWith(true);
          return;
        case 'setField':
          await editField(message);
          refreshWith(true);
          return;
        case 'rename':
          await rename(message);
          refreshWith(true);
          return;
        case 'addPart':
          await addPart(message);
          refreshWith(true);
          return;
        case 'addWire':
          await addWire(message);
          refreshWith(true);
          return;
        case 'delete':
          await remove(message);
          refreshWith(true);
          return;
        case 'nudge':
          await nudge(message);
          refreshWith(true);
          return;
        case 'duplicate': {
          const made = await duplicate(message);
          refreshWith(true);
          // **複製したほうを選んだことにする** (実機で頼まれた)。続けて動かす・
          // 回すが写しに効く — 元のままだと、複製したのに元を動かしてしまう。
          // **組み直しのあと**に選ぶ (組み直しは選択を捨てる)。
          if (made.length > 0) pick('part', made);
          return;
        }
        case 'moveWireEnd':
          await moveWireEnd(message);
          refreshWith(true);
          return;
        case 'copyText':
          await copyText(message);
          return;
        case 'turn':
        case 'flip':
          await turn(message);
          refreshWith(true);
          return;
        case 'undo':
        case 'redo':
          await stepBack(message.kind);
          refreshWith(true);
          return;
        case 'preview':
          preview(message);
          return;
        case 'select':
          showSelection(message);
          return;
        case 'fence':
          pickFence(message);
          return;
        case 'erc':
          // **押すたびに反転する。** 釦は 1 つで、開くのと畳むのを兼ねる。
          ercOpen = !ercOpen;
          refreshWith(false);
          return;
      case 'goto':
          await goTo(message);
          return;
        default:
          return;
      }
    },

    isBoundTo: (uri) => (bound !== null && bound.uri === uri) || (pinned !== null && uriOf(pinned) === uri),
    follows: (uri) => pinned === null || uriOf(pinned) === uri,

    dispose: () => {
      light([]);
      history.clear();
      bound = null;
    },
  };
}

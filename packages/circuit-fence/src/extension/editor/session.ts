import { listFences } from '../../core/edit/fenceList.ts';
import { issuesOf, renderIssues, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt, gridMap } from '../../core/edit/map.ts';
import { renderMapHtml } from '../../core/edit/mapSvg.ts';
import { movePart, partSpans } from '../../core/edit/move.ts';
import type { Edit } from '../../core/edit/move.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import type { Span } from '../../core/edit/shared.ts';
import { extractCircuitFences } from '../../core/fences.ts';
import { formatAddress, parseAddress } from '../../core/model/address.ts';
import { indentOn } from './documentLike.ts';
import type { DocLike, EditorLike } from './documentLike.ts';
import { createHistory, invert } from './history.ts';
import type { Change } from './history.ts';
import { describeDiff } from './movePart.ts';
import { renderFencePicker } from './panelHtml.ts';
import type { MapViewHtml } from './panelHtml.ts';

/**
 * マップの**セッション** — webview 1 つと文書 1 つの間の段取り。
 *
 * **vscode を知らない。** 外の世界 (webview への送り口・エディタ・文書への
 * 書き換え・光らせる印) は `SessionHost` から渡してもらうので、そのまま
 * テストに掛かる (`movePart.ts` の `EditorPort` と同じ流儀)。
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
  | { readonly kind: 'aim'; readonly what?: 'part' | 'node' | 'wire'; readonly id?: string };

/** webview から来るもの。中身は信用せず、使う前に形を確かめる。 */
export type Incoming = {
  readonly kind: string;
  readonly part?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly what?: unknown;
  readonly id?: unknown;
  readonly line?: unknown;
};

export type SessionHost<D extends DocLike> = {
  /** webview へ送る。 */
  readonly post: (message: Outgoing) => void;
  /** アクティブな Markdown のエディタ。無ければ null (webview にフォーカスがあるときも無い)。 */
  readonly activeEditor: () => EditorLike<D> | null;
  /** 開いている文書を URI で引く。閉じられていれば null。 */
  readonly openDocument: (uri: string) => D | null;
  /** フェンスの中の編集を Markdown の行へずらして当てる。当てた中身を返す (履歴が逆を当てる)。 */
  readonly applyEdits: (document: D, fenceLine: number, edits: readonly Edit[]) => Promise<readonly Change[] | null>;
  /** 覚えておいた書き換えを当て直す。字が控えと合わなければ当てずに false。 */
  readonly applyChanges: (document: D, changes: readonly Change[]) => Promise<boolean>;
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

const LOST = '<p class="cf-note">フェンスを見失いました (元の Markdown を閉じたか、'
  + 'フェンスの行がずれました)。circuit フェンスの中にカーソルを置くとマップが出ます。</p>';
const NONE = '<p class="cf-note">この文書に circuit フェンスがありません。'
  + '<code>```circuit</code> のフェンスを書くとマップが出ます。</p>';

type FenceNow<D> = { readonly document: D; readonly source: string; readonly line: number };

type Planned = ReturnType<typeof movePart> | ReturnType<typeof movePoint>;

/** 「何を・どこへ」を書き換えに落とす前の 1 件。部品と節点の違いは `plan` の中だけ。 */
type Request = {
  /** 「R1 を b3 へ」。お知らせと履歴の札に使う。 */
  readonly label: string;
  /** 動かす先がいまの場所だったときの一言。 */
  readonly already: string;
  readonly plan: (source: string) => Planned;
};

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function createSession<D extends DocLike>(host: SessionHost<D>, options: SessionOptions<D> = {}): Session {
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
    bound = { uri, line };
  }

  /** カーソルのあるフェンス。文書を固定していれば、その文書の中に限る。 */
  function fenceUnderCursor(): FenceNow<D> | null {
    const editor = host.activeEditor();
    if (editor === null) return null;
    if (pinned !== null && uriOf(editor.document) !== uriOf(pinned)) return null;
    const fence = fenceAt(editor.document.getText(), editor.selection.active.line + 1);
    return fence === null ? null : { document: editor.document, source: fence.source, line: fence.line };
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
      const fence = document === null ? null : fenceAt(document.getText(), bound.line);
      if (document !== null && fence !== null) {
        bound = { uri: bound.uri, line: fence.line };
        return { document, source: fence.source, line: fence.line };
      }
    }

    if (pinned !== null) {
      const first = extractCircuitFences(pinned.getText())[0];
      if (first !== undefined) {
        rebind(pinned, first.line);
        return { document: pinned, source: first.source, line: first.line };
      }
    }
    return null;
  }

  function viewNow(followCursor: boolean): MapView {
    const fence = currentFence(followCursor);
    if (fence === null) return { html: pinned === null ? LOST : NONE, picker: '', issues: '' };

    const issues = issuesOf(fence.source);
    // **絵に印を付けるのは読めなかった行だけ。** お知らせは読めているので、
    // 同じ赤で囲むと「間違い」に見えてしまう (帯には別の色で並ぶ)。
    const bad = new Set(
      issues
        .filter((issue) => issue.kind === 'error')
        .map((issue) => issue.error.line)
        .filter((line): line is number => line !== null),
    );
    return {
      html: renderMapHtml(gridMap(fence.source), bad),
      picker: renderFencePicker(listFences(fence.document.getText()), fence.line),
      // 帯は Markdown の行で出す。押すとそこへ飛べる (フェンスの中の行では飛べない)。
      issues: renderIssues(shiftIssues(issues, fence.line)),
    };
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
    const editor = host.activeEditor();
    const fence = editor === null || bound === null || uriOf(editor.document) !== bound.uri
      ? null
      : fenceAt(editor.document.getText(), editor.selection.active.line + 1);
    if (editor === null || fence === null || bound === null || fence.line !== bound.line) {
      host.post({ kind: 'aim' });
      return;
    }

    // Markdown の行 → フェンスの中の行。字下げのぶん桁を戻す (行ごとに数える)。
    const at = editor.selection.active.line;
    const indent = indentOn(editor.document, fence.line, at);
    const line = at + 1 - fence.line;
    const aim = aimAt(fence.source, line, Math.max(0, editor.selection.active.character - indent));
    if (aim === null) {
      host.post({ kind: 'aim' });
      return;
    }
    host.post({
      kind: 'aim',
      what: aim.kind,
      id: aim.kind === 'part' ? aim.id : aim.kind === 'node' ? formatAddress(aim.address) : String(aim.line),
    });
  }

  function refreshWith(followCursor: boolean): void {
    // **地図を組んでから履歴の状態を送る。** 別の文書へ移ったときに履歴を
    // 捨てるのはこの中なので、先に送るとボタンが有効なまま取り残される。
    const now = viewNow(followCursor);
    if (ownHistory) host.post({ kind: 'history', ...history.state() });
    host.post({ kind: 'map', ...now });
    // **マップを入れ替えると webview は掴みを捨てる。** こちらの光も消さないと、
    // 掴んでいないのにエディタが光ったままになる。
    light([]);
    // 印も消えるので、カーソルが指しているものを送り直す。
    sendAim();
  }

  /** いま掴めるフェンス。見失っていたら理由を言う (**黙って戻らない** — webview は「…」のまま待ってしまう)。 */
  function fenceNow(): FenceNow<D> | null {
    const fence = currentFence(true);
    if (fence === null) {
      say(pinned === null
        ? 'フェンスを見失いました。circuit フェンスの中にカーソルを置いて掴み直します'
        : 'この文書に circuit フェンスがありません');
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
  async function run(request: Request): Promise<void> {
    const fence = fenceNow();
    if (fence === null) return;

    const result = request.plan(fence.source);
    if (!result.ok) {
      say(result.error.message);
      return;
    }
    if (result.value.edits.length === 0) {
      say(request.already);
      return;
    }

    const applied = await host.applyEdits(fence.document, fence.line, result.value.edits);
    if (applied === null) {
      say('書き換えられませんでした');
      return;
    }
    if (ownHistory) history.push({ label: request.label, changes: applied });
    const changed = describeDiff(result.value.diff);
    say(`${request.label}動かしました${changed === null ? '' : `。${changed}`}`);
  }

  /** マップから来た「何を・どこへ」。部品は 1 つだけ動き、節点は交点ごと動く。 */
  async function move(message: Incoming): Promise<void> {
    // **黙って戻らない。** webview は「R1 を b1 へ…」を出したまま待っている。
    const written = text(message.to);
    if (written === null) {
      say('マップからの知らせを読めませんでした (置き先がありません)');
      return;
    }

    if (message.kind === 'move') {
      const part = text(message.part);
      if (part === null) {
        say('マップからの知らせを読めませんでした (部品がありません)');
        return;
      }
      const to = parseAddress(written);
      if (to === null) {
        say(`番地として読めません: ${written}`);
        return;
      }
      await run({
        label: `${part} を ${written} へ`,
        already: `${part} はすでに ${written} にあります`,
        plan: (source) => movePart(source, part, to),
      });
      return;
    }

    const from = text(message.from);
    if (from === null) {
      say('マップからの知らせを読めませんでした (どの節点かがありません)');
      return;
    }
    const at = parseAddress(from);
    const to = parseAddress(written);
    if (at === null || to === null) {
      say(`番地として読めません: ${at === null ? from : written}`);
      return;
    }
    await run({
      label: `${from} の節点を ${written} へ`,
      already: `節点はすでに ${from} にあります`,
      plan: (source) => movePoint(source, at, to),
    });
  }

  /**
   * 1 歩戻す / やり直す。VS Code に頼めるならそちら (文書の undo がそのまま効く)。
   *
   * 自前なら**当ててから履歴を動かす** — 先に動かすと、当てられなかったときに
   * 履歴が嘘になる。当てられないのは、覚えたあとに手で書き換えられたとき。
   * **黙って当てない** (覚えている桁はもう別の場所を指している)。
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

    const changes = undoing ? invert(step).changes : step.changes;
    if (!(await host.applyChanges(fence.document, changes))) {
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

  /** マップから来た「これを掴んだ」。`what` が無ければ光を消す。 */
  function showSelection(message: Incoming): void {
    const what = text(message.what);
    const id = text(message.id);
    const fence = what === null || id === null ? null : currentFence(true);
    if (fence === null || what === null || id === null) {
      light([]);
      return;
    }
    if (what === 'node') {
      const address = parseAddress(id);
      light(address === null ? [] : rangesOf(fence, nodeSpans(fence.source, address)));
      return;
    }
    light(rangesOf(fence, partSpans(fence.source, id)));
  }

  /** 一覧で選んだフェンスへ。**選んだ直後はカーソルを見ない** (別のフェンスにいることがある)。 */
  function pickFence(message: Incoming): void {
    const line = typeof message.line === 'number' ? message.line : null;
    const document = bound === null ? pinned : documentOf(bound.uri);
    if (line === null || document === null) return;

    const fence = fenceAt(document.getText(), line);
    if (fence === null) {
      say(`${line} 行目に circuit フェンスがありません`);
      return;
    }
    rebind(document, fence.line);
    refreshWith(false);
  }

  return {
    view: () => viewNow(true),
    refresh: () => refreshWith(true),

    handle: async (message) => {
      switch (message.kind) {
        case 'move':
        case 'moveNode':
          await move(message);
          refreshWith(true);
          return;
        case 'undo':
        case 'redo':
          await stepBack(message.kind);
          refreshWith(true);
          return;
        case 'select':
          showSelection(message);
          return;
        case 'fence':
          pickFence(message);
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

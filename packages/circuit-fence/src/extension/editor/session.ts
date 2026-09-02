import { listFences } from '../../core/edit/fenceList.ts';
import { issuesOf, renderIssues, shiftIssues } from '../../core/edit/issues.ts';
import { aimAt, fenceAt, gridMap } from '../../core/edit/map.ts';
import { renderMapHtml } from '../../core/edit/mapSvg.ts';
import { movePart, partSpans } from '../../core/edit/move.ts';
import type { Edit } from '../../core/edit/move.ts';
import { insertPart, insertWire, nextPartId } from '../../core/edit/insert.ts';
import { movePoint, nodeSpans } from '../../core/edit/point.ts';
import { deletePart, deleteWire } from '../../core/edit/remove.ts';
import type { LineEdit, NetDiff, Span } from '../../core/edit/shared.ts';
import { partFields, setField } from '../../core/edit/field.ts';
import type { PartFields, PartField } from '../../core/edit/field.ts';
import { renamePart } from '../../core/edit/rename.ts';
import { flipPart, turnPart } from '../../core/edit/turn.ts';
import { extractCircuitFences } from '../../core/fences.ts';
import { formatAddress, parseAddress } from '../../core/model/address.ts';
import type { Address } from '../../core/model/address.ts';
import { bodyAfter, fenceBody } from './docEdits.ts';
import { indentOn } from './documentLike.ts';
import type { DocLike, EditorLike } from './documentLike.ts';
import { createHistory, sameBody } from './history.ts';
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
  | { readonly kind: 'aim'; readonly what?: 'part' | 'node' | 'wire'; readonly id?: string }
  /** 選んだ部品の欄の中身。null は「欄を閉じる」 (部品を選んでいない)。 */
  | { readonly kind: 'fields'; readonly part: PartFields | null };

/** webview から来るもの。中身は信用せず、使う前に形を確かめる。 */
export type Incoming = {
  readonly kind: string;
  readonly part?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly what?: unknown;
  readonly id?: unknown;
  readonly line?: unknown;
  readonly quarters?: unknown;
  readonly operator?: unknown;
  readonly type?: unknown;
  readonly at?: unknown;
  readonly field?: unknown;
  readonly text?: unknown;
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
  /**
   * 名前を訊く。**ID がそのまま図に出る種類** (`port` / `vcc` / `vee`) を
   * 置くときだけ使う。断られたら null。
   */
  readonly ask?: (prompt: string, value: string) => Promise<string | null>;
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

type Planned = ReturnType<typeof movePart> | ReturnType<typeof movePoint>
  | ReturnType<typeof deletePart> | ReturnType<typeof turnPart> | ReturnType<typeof insertWire>
  | ReturnType<typeof insertPart> | ReturnType<typeof setField> | ReturnType<typeof renamePart>;

/** 書き換えの中身。行の出し入れを持たない `Move` も、ここでは同じ形で扱う。 */
type Changes = {
  readonly edits: readonly Edit[];
  readonly lines: readonly LineEdit[];
  readonly diff: NetDiff;
  /** 部品と一緒に消えた配線の本数 (消すときだけ)。 */
  readonly wires?: number;
};

/** 1 つの操作を書き換えに落とす前の 1 件。何をするかの違いは `plan` の中だけ。 */
type Request = {
  /** 「R1 を b3 へ」。履歴の札に使う。 */
  readonly label: string;
  /** 済んだときの一言 (接続の変化はこのあとに足す)。 */
  readonly done: (changes: Changes) => string;
  /** 何も変わらなかったときの一言。 */
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
    const changes: Changes = { lines: [], ...result.value };
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
      const now = fenceAt(fence.document.getText(), fence.line);
      if (now !== null) {
        history.push({ label: request.label, before, after: fenceBody(fence.document, fence.line, now.source) });
      }
    }
    const changed = describeDiff(changes.diff);
    say(`${request.done(changes)}${changed === null ? '' : `。${changed}`}`);
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
        done: () => `${part} を ${written} へ動かしました`,
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
      done: () => `${from} の節点を ${written} へ動かしました`,
      already: `節点はすでに ${from} にあります`,
      plan: (source) => movePoint(source, at, to),
    });
  }

  /** ID がそのまま図に出る種類の名前を訊く。既定の候補を入れておく。 */
  const NAME_HINTS: Readonly<Record<string, string>> = { port: 'IN', vcc: 'VCC', vee: 'VEE' };

  /** 欄の名前 (お知らせに出す)。 */
  const FIELD_NAMES: Readonly<Record<PartField, string>> = { type: '種類', value: '値', label: 'ラベル' };

  /**
   * 欄の書き換え。**1 部品 = 1 行の文法なので、行の中のトークン差し替えに落ちる。**
   * 名前だけは 3 か所 (鍵・配線の足・注釈) に散るので別の道を通る。
   */
  async function editField(message: Incoming): Promise<void> {
    const part = text(message.part);
    const field = text(message.field);
    const written = text(message.text) ?? '';
    if (part === null || (field !== 'type' && field !== 'value' && field !== 'label')) {
      say('マップからの知らせを読めませんでした (どの欄かがありません)');
      return;
    }

    const name = FIELD_NAMES[field];
    await run({
      label: `${part} の${name}を`,
      done: () => (written === '' ? `${part} の${name}を消しました` : `${part} の${name}を ${written} にしました`),
      already: `${part} の${name}は変わりません`,
      plan: (source) => setField(source, part, field, written),
    });
  }

  /** 名前を変える。鍵・配線の足・注釈の指し先を一緒に書き換える。 */
  async function rename(message: Incoming): Promise<void> {
    const from = text(message.part);
    const to = text(message.text);
    if (from === null || to === null || to === '') {
      say('マップからの知らせを読めませんでした (新しい名前がありません)');
      return;
    }

    await run({
      label: `${from} を ${to} に`,
      done: () => `${from} を ${to} に改名しました`,
      already: `${from} の名前は変わりません`,
      plan: (source) => renamePart(source, from, to),
    });
  }

  /** マップから来た「この部品をここへ」。ID は接頭辞から付け、要るときだけ訊く。 */
  async function addPart(message: Incoming): Promise<void> {
    const type = text(message.type);
    const written = Array.isArray(message.at) ? message.at.map(text) : null;
    if (type === null || written === null || written.some((one) => one === null)) {
      say('マップからの知らせを読めませんでした (置く先がありません)');
      return;
    }

    const at = written.map((one) => parseAddress(one as string));
    const bad = at.indexOf(null);
    if (bad >= 0) {
      say(`番地として読めません: ${written[bad] as string}`);
      return;
    }

    const fence = fenceNow();
    if (fence === null) return;

    // **ID がそのまま図に出る種類は訊く** (勝手に名前を決めない)。
    const numbered = nextPartId(fence.source, type);
    const id = numbered ?? (host.ask === undefined
      ? null
      : await host.ask(`${type} の名前`, NAME_HINTS[type] ?? ''));
    if (id === null) {
      // 取り消し (Esc) は断りなので黙って戻る。訊く手立てが無いときだけ言う。
      if (numbered === null && host.ask === undefined) say(`${type} の名前を訊けませんでした`);
      return;
    }
    if (id === '') {
      // **空で確定したのは断りではない。** 黙って戻ると、置かれなかった理由が
      // 分からないまま webview が待ちの表示のまま残る。
      say(`${type} の名前を空にはできません`);
      return;
    }

    const where = written.join(' ');
    await run({
      label: `${id} を`,
      done: () => `${id} (${type}) を ${where} へ置きました`,
      already: '置くものがありません',
      plan: (source) => insertPart(source, { id, type, at: at as readonly Address[] }),
    });
  }

  /** マップから来た「ここからここへ 1 本」。配線は**交点から交点へ**引く。 */
  async function addWire(message: Incoming): Promise<void> {
    const from = text(message.from);
    const to = text(message.to);
    const at = from === null ? null : parseAddress(from);
    const target = to === null ? null : parseAddress(to);
    if (at === null || target === null) {
      say(`番地として読めません: ${at === null ? from : to}`);
      return;
    }
    // 折れ方は放したときの Shift で決まる (`|-` は欄から。まだ無い)。
    const operator = message.operator === '-|' || message.operator === '|-' ? message.operator : '--';
    const written = `${from} ${operator} ${to}`;

    await run({
      label: `${written} を`,
      done: () => `${written} を引きました`,
      already: '引くものがありません',
      plan: (source) => insertWire(source, { kind: 'cell', address: at }, { kind: 'cell', address: target }, operator),
    });
  }

  /** マップから来た「これを消す」。部品は足を指す配線も連れていく。 */
  async function remove(message: Incoming): Promise<void> {
    const what = text(message.what);
    const id = text(message.id);
    if (id === null || (what !== 'part' && what !== 'wire')) {
      say('マップからの知らせを読めませんでした (何を消すかがありません)');
      return;
    }

    if (what === 'wire') {
      const line = Number(id);
      await run({
        label: `${line} 行目の配線を`,
        done: () => `${line} 行目の配線を消しました`,
        already: '消すものがありません',
        plan: (source) => deleteWire(source, line),
      });
      return;
    }

    await run({
      label: `${id} を`,
      // **一緒に消えた配線の本数を言う。** 黙って消すと気づけない。
      done: (changes) => `${id} を消しました${changes.wires ? ` (配線 ${changes.wires} 本も一緒に)` : ''}`,
      already: '消すものがありません',
      plan: (source) => deletePart(source, id),
    });
  }

  /** マップから来た「これを回す / 反転する」。2 端子は番地の順が向きそのもの。 */
  async function turn(message: Incoming): Promise<void> {
    const part = text(message.part);
    if (part === null) {
      say('マップからの知らせを読めませんでした (どの部品かがありません)');
      return;
    }
    const quarters = typeof message.quarters === 'number' ? message.quarters : 0;

    await run(message.kind === 'flip'
      ? {
        label: `${part} を反転`,
        done: () => `${part} を反転しました`,
        already: `${part} は反転できません`,
        plan: (source) => flipPart(source, part),
      }
      : {
        label: `${part} を回転`,
        done: () => `${part} を${quarters < 0 ? '反時計回り' : '時計回り'}に回しました`,
        already: `${part} は回せません`,
        plan: (source) => turnPart(source, part, quarters),
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
    if (what !== 'part') sendFields(null);
    if (what === 'node') {
      const address = parseAddress(id);
      light(address === null ? [] : rangesOf(fence, nodeSpans(fence.source, address)));
      return;
    }
    if (what === 'wire') {
      // 配線はフェンスの中の行で指す (1 行 = 1 本の経路)。行ごと光らせる。
      const at = fence.line + Number(id) - 1;
      const inside = Number.isInteger(Number(id)) && at >= 0 && at < fence.document.lineCount;
      light(inside ? [{ line: at, start: 0, end: fence.document.lineAt(at).text.length }] : []);
      return;
    }
    light(rangesOf(fence, partSpans(fence.source, id)));
    sendFields(partFields(fence.source, id));
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

import { wireColor } from '../colors.ts';
import { escapeMarkup } from '../markup.ts';
import type { FenceEntry } from './fenceEditor.ts';

/**
 * マップのパネルの外側 (HTML の殻と見た目)。**純関数**なのでそのまま
 * テストに掛かる。
 *
 * **中で動くものはここに書かない。** 掴む・置く・消すの決め事は
 * `webview/mapState.ts` (DOM も vscode も知らない純関数。node のテストに
 * 掛かる)、DOM を触る側は `webview/map.ts` にあり、esbuild が `dist/map.js`
 * へ束ねる。文字列に書いたスクリプトはテストが「その字が入っているか」しか
 * 見られず、道具・パレット・インスペクタで膨らむ一方だった。
 *
 * webview は拡張が渡した HTML をサニタイズしないので、フェンスから来た字は
 * すべて `renderMapHtml` 側でエスケープ済みのものだけを受け取る。
 * ここが足すのは殻だけで、外から来た字を素で入れる場所は無い。
 */

const STYLE = `
  /* KiCad の配置を借りる (52 の docs/17): 上に道具の帯、右に道具の列、左に属性、
     下に状態行。色は VS Code のテーマに従う (KiCad 自身もテーマで色を変える)。 */
  html, body { height: 100%; margin: 0; }
  /* **ブラウザのピンチ拡大を止める。** 図の拡大は 2 本指でこちらがやるので
     (52 の docs/32)、ブラウザにも拡大されると道具の列も帯も一緒に大きくなる
     (実機で「メニューアイコンは拡大対象にしないで、固定表示して」)。
     スクロールは残す (pan-x pan-y)。iOS は gesture* でも送ってくるので、
     map.ts の側でも断っている。 */
  html, body { touch-action: pan-x pan-y; }
  body {
    font-family: var(--vscode-font-family); font-size: 12px;
    display: flex; flex-direction: column; overflow: hidden;
    /* **iOS の割り込みを止める。** 長押しで「コピー / 調べる」の吹き出しを
       出し、図を字として選ぼうとする。掴む・引く操作と取り合いになる
       (実機で報告)。欄だけは下で選べるように戻す。 */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    color: var(--vscode-foreground, CanvasText); background: var(--vscode-editor-background, Canvas);
    /* 記号の地。線の上に載る字の縁取りにも使う (図側から色名で引ける)。 */
    --cf-paper: var(--vscode-editor-background, Canvas);
    --cf-ink: var(--vscode-foreground, CanvasText);
    --cf-node: #1f6feb;
    /** 選んだものの色。**選択は一等分かりやすくする**ので、テーマが無い所でも
        必ず色が出るように、システムの強調色まで落とす。 */
    --cf-held: var(--vscode-focusBorder, Highlight);
    /* 道具の絵の色。**意味の同じ道具は同じ色**にする — 9 つに 9 色を配ると、
       色そのものが覚える手がかりにならない。増える / つなぐ / 動く / 向きが
       変わる / 減る、の 5 つだけに分ける。

       **テーマのグラフ色 (vscode-charts) は使わない。** あれは系列を見分ける
       ための色で、明るいテーマだと淡く出る (実機で「黄色は見にくい」と
       言われた。橙が黄色に寄っていた)。白地でも黒地でも読める濃さに決め打つ。
       **この CSS はテンプレートリテラルの中**なので、コメントにバックティックを
       書かない (書くと文字列がそこで切れて、ビルドが謎の構文エラーで落ちる)。 */
    --cf-adds: #1f8b4c;
    --cf-joins: #1f6feb;
    --cf-moves: #b3541e;
    --cf-turns: #7c3aed;
    --cf-drops: #c62828;
    /* カーソルの下のもの。**選んだもの (青) と別の色**にする — 触れているだけの
       ものと選んだものが同じ色だと、どちらの状態か分からない。 */
    --cf-aim: #b3541e;
    --cf-bad: var(--vscode-editorError-foreground, #f14c4c);
    --cf-iffy: var(--vscode-editorWarning-foreground, #cca700);
    --cf-ghost: #1f8b4c;
    --kc-line: var(--vscode-panel-border, #444);
    /* **最後はシステム色で受ける。** 変数の無い所 (VS Code の外) で
       透けると、浮かぶものが図の上で読めなくなる。 */
    --kc-chrome: var(--vscode-sideBar-background, var(--vscode-editor-background, Canvas));
  }
  button { font: inherit; color: inherit; }
  kbd {
    font: inherit; font-size: 10px; padding: 0 3px; opacity: 0.75;
    border: 1px solid var(--kc-line); border-radius: 3px;
  }

  /* 上の帯: 戻す・やり直す、ズーム、フェンスの一覧。 */
  .kc-top {
    display: flex; align-items: center; gap: 6px; padding: 4px 8px;
    border-bottom: 1px solid var(--kc-line); background: var(--kc-chrome);
  }
  .kc-top .kc-group { display: flex; gap: 2px; padding-right: 6px; border-right: 1px solid var(--kc-line); }
  .kc-top button {
    min-width: 26px; height: 24px; padding: 0 6px; border: 1px solid transparent; border-radius: 3px;
    background: none; cursor: pointer;
  }
  .kc-top button:hover { border-color: var(--vscode-focusBorder); }
  /* 引き出しのボタン。**広いときは属性が出ている**ので要らない。 */
  .kc-props-toggle { display: none; }
  .kc-top button:disabled { opacity: 0.35; cursor: default; }
  .kc-title { margin-left: auto; opacity: 0.7; }
  /* 指の案内。狭いときだけ、マウスの案内と入れ替える。 */
  .kc-title-touch { display: none; }
  .cf-fences { margin: 0; }
  /* **押しやすい大きさに取る。** 三角 1 つと「棒 + 三角」で幅が変わるので、
     どれも同じ幅に揃えて並べる (実機で「押しやすいように」と頼まれた)。 */
  .cf-fence-step {
    margin-left: 3px; padding: 0 6px; min-width: 26px; line-height: 22px; cursor: pointer;
    border: 1px solid var(--kc-line); border-radius: 3px;
    background: var(--kc-chrome); color: var(--vscode-editor-foreground, CanvasText);
  }
  .cf-fence-step:hover { background: var(--vscode-list-hoverBackground, var(--kc-chrome)); }
  .cf-fences select {
    font: inherit; padding: 1px 4px;
    background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
  }

  /* 真ん中: 左に属性、図、右に道具の列。**引き出しの基準**でもある
     (狭いときは属性がここへ重なる)。 */
  .kc-main { flex: 1; min-height: 0; display: flex; position: relative; }
  /* 部品の一覧も抱えるので、欄だけのころ (170px) より広い。**浮かぶ窓と同じ幅**
     (260px) にする — 狭めると種類の名前が 1 字ずつ折り返して読めなくなる。 */
  .kc-props {
    width: 260px; flex: none; padding: 8px; overflow-y: auto;
    border-right: 1px solid var(--kc-line); background: var(--kc-chrome);
  }
  .kc-props h2 { margin: 0 0 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; opacity: 0.7; }
  .kc-props-hint { margin: 0; opacity: 0.7; line-height: 1.5; }
  .cf-inspector { display: flex; flex-direction: column; gap: 6px; margin: 0; }
  /* display: flex は hidden 属性の既定に勝つので、明示して隠す。 */
  .cf-inspector[hidden] { display: none; }
  .cf-inspector label { display: flex; flex-direction: column; gap: 2px; color: var(--vscode-descriptionForeground); }
  /* **欄は選べる。** 打つ・直すために要るので、body で切った選択を戻す。 */
  .cf-field, .cf-search {
    -webkit-user-select: text;
    user-select: text;
  }
  .cf-field {
    padding: 2px 4px; font: inherit;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  /* その部品には書けない欄 (1 端子の値、多端子の l=)。消さずに触れなくする。 */
  .cf-field:disabled { opacity: 0.4; }

  /* 図の場。**浮かぶもの (右クリックの一覧・部品の窓・囲みの帯) はここに置く。**
     図の箱のほうは中身ごとスクロールするので、その中に絶対配置すると図と
     一緒に流れ、スクロールしたぶんだけ押した所からずれる
     (実機で「右メニューが出ない」「範囲選択のシャドウが出ない」)。 */
  .kc-stage { flex: 1; min-width: 0; position: relative; display: flex; }
  /* **スクロールバーは常に出す。** 図が箱に収まっていても場所を空けておくと、
     拡大したときに幅が動かない (実機で頼まれた)。 */
  /* **1 本指では流さない。** 絵の上は既に止めてあるが、絵の外側が流れると
     同じ 1 本指が場所によって別の意味になる。移動は 2 本指が受け持つ。 */
  .kc-canvas { flex: 1; min-width: 0; overflow: scroll; touch-action: none; cursor: crosshair; }
  .cf-body { width: 100%; }
  /* 図の根 (どのフェンスの SVG も)。ズーム 1 で箱の幅に収める。 */
  .cf-body > svg { display: block; width: 100%; height: auto; user-select: none; touch-action: none; }
  .cf-note { margin: 8px; color: var(--vscode-descriptionForeground); }

  /* 配線の色見本。**開かずに色が見える**ように、四角と名前を並べて出す。 */
  .cf-colors { margin-top: 10px; }
  .cf-colors[hidden] { display: none; }
  .cf-colors h3 { margin: 0 0 4px; font-size: 11px; font-weight: normal; color: var(--vscode-descriptionForeground); }
  /* **升目に並べる。** 折り返しに任せると段ごとに色の四角の位置がずれて、
     どこに何色があるか覚えられない (実機で「グリッド表示に」)。
     幅は欄に合わせて 2 列・3 列と変わるが、列は必ず揃う。 */
  .cf-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 2px; }
  .cf-swatch {
    display: flex; align-items: center; gap: 4px; min-width: 0;
    padding: 2px 5px 2px 3px; border: 1px solid transparent; border-radius: 3px;
    background: none; cursor: pointer; font-size: 11px;
  }
  /* 名前が長い色 (orange) でも列の幅を押し広げない。 */
  .cf-swatch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cf-swatch:hover { border-color: var(--vscode-focusBorder); }
  /* いま引く色。**枠で示す** (色そのものは四角が言っている)。 */
  .cf-swatch.cf-inked {
    border-color: var(--cf-held);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .cf-swatch-chip {
    width: 11px; height: 11px; border-radius: 2px;
    border: 1px solid var(--vscode-descriptionForeground);
  }

  /* 右の道具の列 (KiCad の右ツールバー)。鍵を知らなくても押せる。 */
  .kc-tools {
    width: 64px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 6px 4px;
    border-left: 1px solid var(--kc-line); background: var(--kc-chrome); overflow-y: auto;
  }
  .kc-tool {
    display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 5px 2px;
    border: 1px solid transparent; border-radius: 4px; background: none; cursor: pointer;
  }
  .kc-tool .kc-glyph { font-size: 16px; line-height: 1; }
  /* 絵に色を付ける。**道具の列と右クリックの一覧の両方**に効かせる
     (同じ道具が 2 か所で違って見えると、色が手がかりにならない)。 */
  .kc-tool[data-key="a"] .kc-glyph,
  .kc-tool[data-key="d"] .kc-glyph { color: var(--cf-adds); }
  .kc-tool[data-key="w"] .kc-glyph { color: var(--cf-joins); }
  .kc-tool[data-key="m"] .kc-glyph,
  .kc-tool[data-key="g"] .kc-glyph { color: var(--cf-moves); }
  .kc-tool[data-key="r"] .kc-glyph,
  .kc-tool[data-key="x"] .kc-glyph { color: var(--cf-turns); }
  .kc-tool[data-key="Delete"] .kc-glyph { color: var(--cf-drops); }
  /* 選んでいる道具は地が反転するので、絵の色は地に負けないよう地の色に戻す。 */
  body[data-tool="select"] .kc-tool[data-tool="select"] .kc-glyph,
  body[data-tool="wire"] .kc-tool[data-tool="wire"] .kc-glyph,
  body[data-tool="place"] .kc-tool[data-tool="place"] .kc-glyph { color: inherit; }
  .kc-tool kbd { font-size: 9px; }
  .kc-tool:hover { border-color: var(--vscode-focusBorder); }
  body[data-tool="select"] .kc-tool[data-tool="select"],
  body[data-tool="wire"] .kc-tool[data-tool="wire"],
  body[data-tool="place"] .kc-tool[data-tool="place"] {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  /* 右クリックの一覧。図の上に浮かぶ (webview には既定のメニューが無い)。 */
  .kc-menu {
    position: absolute; z-index: 2; margin: 0; padding: 3px; list-style: none; min-width: 150px;
    background: var(--vscode-menu-background, var(--vscode-editorWidget-background, var(--kc-chrome)));
    color: var(--vscode-menu-foreground, CanvasText);
    border: 1px solid var(--vscode-menu-border, var(--kc-line)); border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .kc-menu[hidden] { display: none; }
  .kc-menu li { display: block; }
  .kc-menu-item {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 3px 8px;
    flex-direction: row; border-radius: 3px;
  }
  .kc-menu-item .kc-glyph { width: 1.2em; text-align: center; }
  .kc-menu-item kbd { margin-left: auto; }
  .kc-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, inherit);
    border-color: transparent;
  }

  /* 部品を選ぶ窓 (KiCad の Choose Symbol)。図の上に浮かぶ。 */
  .kc-chooser {
    position: absolute; top: 8px; left: 8px; width: 260px; max-height: calc(100% - 16px);
    display: flex; flex-direction: column; cursor: default;
    background: var(--vscode-editorWidget-background, var(--kc-chrome));
    border: 1px solid var(--vscode-editorWidget-border, var(--kc-line)); border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .kc-chooser[hidden] { display: none; }
  .kc-chooser header {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px;
    border-bottom: 1px solid var(--kc-line); font-weight: 600;
  }
  .kc-chooser-close { margin-left: auto; border: 0; background: none; cursor: pointer; }
  .kc-chooser-body { display: flex; flex-direction: column; min-height: 0; }

  /* 属性パネルに据えた部品の一覧。**窓に移しても同じ箱**なので、
     見た目の決めは箱 (cf-chrome-palette) の側に置く。 */
  .kc-dock { margin-top: 10px; }
  .kc-dock h3 {
    display: flex; align-items: center; margin: 0 0 4px;
    font-size: 11px; font-weight: normal; color: var(--vscode-descriptionForeground);
  }
  .kc-dock-pop {
    margin-left: auto; padding: 0 4px; border: 1px solid transparent; border-radius: 3px;
    background: none; color: inherit; cursor: pointer; font-size: 13px; line-height: 1;
  }
  .kc-dock-pop:hover { border-color: var(--vscode-focusBorder); }
  /* 窓へ移したあとの空の座。「窓に出ています」と分かるようにしておく。 */
  .kc-dock-body:empty::after {
    content: "別の窓に出ています"; display: block; padding: 6px 2px;
    color: var(--vscode-descriptionForeground);
  }
  .cf-chrome-palette .cf-palette { padding: 6px 0; overflow-y: auto; }
  .kc-chooser .cf-chrome-palette .cf-palette { padding: 6px 8px; }
  /* 見出しは箱の側 (据え置きなら h3、窓なら header) が出す。 */
  .cf-chrome-palette summary { display: none; }
  /* よく使うものの絵。**升目に並べる** — 幅で段の切れ目が変わると、どこに何が
     あるか覚えられない (色見本と同じ理由)。 */
  .cf-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; margin: 0 0 6px; }
  /* パレットの絵。名前の前に置くので、行の高さに収まる大きさで。 */
  .cf-icon { flex: none; vertical-align: middle; }

  .cf-pick {
    display: flex; align-items: center; gap: 6px; width: 100%;
    padding: 2px 6px; border: 1px solid transparent; border-radius: 3px;
    background: none; color: inherit; cursor: pointer; text-align: left;
  }
  /* 絵の幅を揃える。**揃えないと名前が段ごとにずれて**、一覧として読みにくい。 */
  .cf-pick .cf-icon { flex: none; width: 46px; height: 20px; }
  .cf-pick:hover { border-color: var(--vscode-focusBorder); }
  /* いま置こうとしているもの。道具の帯と同じ「いまの状態」の印。 */
  .cf-pick.cf-chosen {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-hoverBackground);
  }
  /* 絵だけの升。**cf-pick の 100% を外す** — 外さないと 1 段に 1 つしか並ばない。 */
  .cf-icons .cf-pick { width: auto; padding: 2px; justify-content: center; }
  .cf-icon { width: 34px; height: 24px; }
  .cf-icon .cf-mark { font-size: 9px; }
  .cf-search {
    width: 100%; box-sizing: border-box; font: inherit; padding: 3px 6px; margin: 0 0 4px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  .cf-types { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
  .cf-types li .cf-pick { width: 100%; }
  .cf-types code { opacity: 0.7; font-size: 11px; }
  .cf-types li.cf-hidden { display: none; }

  /* **狭いときは図を主にする** (52 の docs/32)。属性 260px と道具 64px を
     据えたままだと、390px の画面では図に残る幅が 0 になる。
     閾値の 720px は、iPad mini の縦 (744px) が今までどおりの形で収まり、
     iPhone Pro Max の横 (430px) が畳まれる所。 */
  @media (max-width: 720px) {
    /* 属性は引き出し。**図に重ねる** — 押しのけると図の幅が変わって組み直され、
       見ていた所を見失う。 */
    .kc-props {
      position: absolute; z-index: 3; top: 0; bottom: 0; left: 0;
      width: min(86vw, 300px); transform: translateX(-101%);
      transition: transform 0.15s ease-out;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.35);
    }
    body.kc-drawer .kc-props { transform: none; }
    .kc-props-toggle { display: inline-flex; }

    /* 道具は下端に横並び。縦に 9 つ並べると図を押し潰す。 */
    .kc-main { flex-direction: column; }

    /* **道具は画面の下端に貼り付ける** (実機で「固定にする。スクロールで
       動かないようにする」)。iOS のタブ棒と同じ置き方で、**中身がどう動いても
       道具の場所が変わらない** — 帯を開いても、図を流しても、指の行き先は同じ。
       流れから外すので、その分の場所を body の余白で空けておく
       (空けないと帯と状態欄が下に隠れる)。
       高さを決め打つのは、**流れから外したものの分を CSS で測れない**ため。
       44 (道具) + 8 (余白) + 1 (境) = 53 に、少し足した数。 */
    body { box-sizing: border-box; padding-bottom: 54px; }
    .kc-tools {
      box-sizing: border-box; position: fixed; z-index: 3;
      left: 0; right: 0; bottom: 0; height: 54px;
    }
    /* **横の巻き取り棒は出さない。** 触る画面では指で流せるし、出すと
       決め打った高さの中で道具の絵に重なる。 */
    .kc-tools { scrollbar-width: none; }
    .kc-tools::-webkit-scrollbar { display: none; }
    /* **図は縮む。** 縦並びにすると図の高さが主軸になり、min-height の既定
       (auto) が「中身より小さくしない」と言うので、図が SVG の高さのまま
       居座って道具・帯・状態欄を画面の外へ押し出す。body は overflow: hidden
       なので、押し出された分は**スクロールもできずに消える**
       (実機で「下の道具が見切れている」)。0 にして図のほうを譲らせる。 */
    .kc-stage { min-height: 0; }
    .kc-tools {
      width: auto; flex-direction: row; overflow-x: auto; overflow-y: hidden;
      padding: 4px; border-left: 0; border-top: 1px solid var(--kc-line);
    }
    .kc-tool { flex: none; min-width: 54px; }

    /* 案内はマウスから指へ。狭い帯に 2 つ並べない。
       **段を分けて丸ごと出す** — 横に押し込むと 1 字ずつ折り返して、
       帯が縦に伸びる (実測で 200px 近くなった)。 */
    .kc-top { flex-wrap: wrap; }
    .kc-title { display: none; }
    .kc-title-touch {
      display: block; width: 100%; margin: 0; opacity: 0.7;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* 浮かぶ窓は画面いっぱいに近づける (260px の窓は狭い画面で収まらない)。 */
    .kc-chooser { width: auto; right: 8px; }

    /* **的は 44px、見た目は iOS の寸法。** 最初は字も枠も一緒に大きくしたが、
       実機で「全体的にボタンやフォントが大きい」と言われた。iOS のタブ棒を
       見ると**この 2 つは別物**で、札は 10pt・絵は 25pt と小さいまま、
       押せる面のほうが 49pt ある。こちらも同じに分ける — 縮めるのは
       字と絵で、押す面の下限は動かさない。
       字は iOS の刻み (17 本文 / 15 小見出し / 13 註 / 12 説明) に載せる。
       ここは密な道具の面なので、地の字は註の 13px。 */
    body { font-size: 13px; }
    .kc-props h2, .cf-colors h3, .kc-dock h3 { font-size: 12px; }
    .cf-swatch, .cf-types code, .kc-status, .kc-title-touch { font-size: 12px; }

    /* **欄は 16px を切らない。** iOS Safari は 16px 未満の欄に触れると、
       打ち始めた瞬間に頁ごと拡大する (図が飛ぶ)。**ここだけは縮めない。** */
    .cf-field, .cf-search { font-size: 16px; padding: 6px 8px; }

    /* 上の帯の釦は絵だけ。iOS の小さい釦 (検索欄と同じ 36pt) に合わせる。 */
    .kc-top button, .kc-props-toggle { min-width: 36px; height: 36px; }
    /* 道具は**タブ棒と同じ作り**。面は 44px のまま、絵と札を落とす。 */
    .kc-tool { min-width: 56px; min-height: 44px; padding: 4px; }
    .kc-tool .kc-glyph { font-size: 17px; }
    /* 一覧の行は iOS も 44pt。**ここは縮めない** — 並んだ中の 1 つを
       選ぶので、隣を押すと別の部品が置かれる。 */
    .cf-pick, .cf-swatch, .kc-menu-item { min-height: 44px; }
    .cf-icons { grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); }
    .cf-icons .cf-pick { min-height: 44px; }

    /* 鍵の字はスマホに要らない。**道具の名前に幅を譲る**
       (案内文の中の鍵は残す — 消すと文が途切れる)。 */
    .kc-tool kbd { display: none; }
  }

  /* 帯: 読めなかったところとお知らせ。折り畳める。 */
  .kc-band { flex: none; max-height: 30%; overflow-y: auto; border-top: 1px solid var(--kc-line); background: var(--kc-chrome); }
  .kc-band summary { padding: 3px 8px; cursor: pointer; user-select: none; opacity: 0.8; }
  .cf-issues { list-style: none; margin: 0; padding: 0 8px 6px; }
  .cf-issue { margin-top: 2px; padding: 3px 8px; border-left: 3px solid var(--kc-line); }
  .cf-issue.cf-error {
    border-left-color: var(--cf-bad);
    background: var(--vscode-inputValidation-errorBackground, transparent);
  }
  .cf-issue.cf-notice {
    border-left-color: var(--cf-iffy);
    background: var(--vscode-inputValidation-warningBackground, transparent);
  }
  /* 行の分かっているものだけが押せる。 */
  .cf-issue[data-line] { cursor: pointer; }
  .cf-issue[data-line]:hover { outline: 1px solid var(--vscode-focusBorder); }
  .cf-issue code {
    display: block; margin-top: 2px; white-space: pre-wrap;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .cf-issue mark {
    background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33));
    color: inherit;
  }

  /* 下の状態行 (KiCad のステータスバー): 左にいまできること、右に穴とズーム。 */
  .kc-status {
    flex: none; display: flex; align-items: center; gap: 12px; padding: 3px 8px; min-height: 1.5em;
    border-top: 1px solid var(--kc-line); background: var(--vscode-statusBar-background, var(--kc-chrome));
    color: var(--vscode-statusBar-foreground, inherit);
  }
  .cf-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kc-cell { min-width: 3em; font-family: var(--vscode-editor-font-family, monospace); }
  .kc-zoom { min-width: 3.5em; text-align: right; }

  /* ---- 図の中の層 ---- */
  /* 見えるだけの層は当たり判定を持たない。 */
  .cf-grid, .cf-axes, .cf-wires { pointer-events: none; }
  /* 掴む層。**全部いつも効かせる** — カーソルの下は elementsFromPoint で重なりごと
     読むので、道具ごとに層を切り替える必要が無い。 */
  .cf-hits, .cf-marks, .cf-wire-hits { pointer-events: all; }
  .cf-wire-hit { stroke: transparent; stroke-width: 8; fill: none; }
  .cf-cell { fill: transparent; }
  .cf-grid-dot { fill: var(--vscode-panel-border); }
  .cf-axis { fill: var(--vscode-descriptionForeground); font-size: 9px; }

  .cf-wire, .cf-lead { stroke: var(--cf-ink); stroke-width: 1.5; fill: none; }
  /* ピンの端は近似。実線で引くと持っていない精度を約束することになる。 */
  .cf-wire.cf-approx { stroke-dasharray: 3 3; opacity: 0.6; }

  .cf-glyph { fill: var(--cf-paper); stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-glyph-line { fill: none; stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-name { fill: var(--cf-ink); font-size: 10px; }
  .cf-pin { stroke: var(--cf-ink); stroke-width: 1.5; }
  .cf-pin-name { fill: var(--vscode-descriptionForeground); font-size: 8px; }
  .cf-mark { fill: var(--cf-ink); font-size: 9px; }
  .cf-dot-mark { fill: var(--cf-node); }
  .cf-dot-name { fill: var(--cf-node); font-size: 9px; }
  /* 節点の点は、鍵の対象になるときだけ目立たせる (いつも濃いと図がうるさい)。 */
  .cf-marks { opacity: 0.45; }

  /* カーソルの下で鍵の対象になるもの。薄く縁取る (押す前に何に効くかが分かる)。 */
  .cf-hover .cf-glyph, .cf-hover .cf-glyph-line, .cf-hover .cf-lead, .cf-hover .cf-pin,
  .cf-wire.cf-hover { stroke: var(--vscode-focusBorder); stroke-width: 2.5; opacity: 0.9; }
  .cf-hover .cf-dot-mark { stroke: var(--vscode-focusBorder); stroke-width: 3; }
  /* **姿のまわりにも影を出す。** 縁取りを塗り替えられるのは記号のマップ
     (circuit) だけで、breadboard と perfboard の .cf-chip は実物の姿そのもの。
     中に塗り替える線が無いので、上の規則では**何も起きていなかった**
     (実機で「全フェンス、ホバーで部品をシャドウにする」)。姿に依らない印は
     影だけなので、選んだ印 (.cf-held) と同じ手を弱くして使う。 */
  .cf-hover { filter: drop-shadow(0 0 3px var(--vscode-focusBorder)); }

  /* エディタのカーソルが指しているもの。掴んでいる印とは別の色。 */
  .cf-aim .cf-glyph, .cf-aim .cf-glyph-line, .cf-aim .cf-lead, .cf-aim .cf-pin,
  .cf-wire.cf-aim { stroke: var(--cf-aim); stroke-width: 2.5; }
  .cf-aim .cf-name { fill: var(--cf-aim); }
  .cf-aim .cf-dot-mark { stroke: var(--cf-aim); stroke-width: 3; }

  /* 選んだもの。**中の線を塗り替えるのは記号のマップ (circuit) だけに効く** —
     breadboard と perfboard の .cf-chip は実物の姿そのもので、塗り替える線が
     無い。姿に依らない印は下の 2 つ (光らせる・枠で囲む)。 */
  .cf-held .cf-glyph, .cf-held .cf-glyph-line, .cf-held .cf-lead,
  .cf-held .cf-pin { stroke: var(--cf-held); stroke-width: 2.5; }
  .cf-held .cf-name { fill: var(--cf-held); }
  .cf-held .cf-dot-mark { stroke: var(--cf-held); stroke-width: 3; }
  .cf-wire.cf-held { stroke: var(--cf-held); stroke-width: 2.5; }
  /* 姿のまわりを光らせる。実物の色の上でも縁が立つ。 */
  .cf-held {
    filter: drop-shadow(0 0 2px var(--cf-held))
            drop-shadow(0 0 5px var(--cf-held));
  }
  /* 運んでいる部品の姿 (行き先に出す写し)。**当たり判定は外す** —
     下の穴を掴めるように。置けないときは赤く濁らせる。 */
  .cf-ghost-part { opacity: 0.75; pointer-events: none; }
  .cf-ghost-part-bad {
    opacity: 0.55;
    filter: saturate(0.15) drop-shadow(0 0 2px var(--cf-bad)) drop-shadow(0 0 5px var(--cf-bad));
  }
  /* 持ち上げた元の姿。薄くして、行き先の写しと二重に見えないようにする。 */
  .cf-lifted { opacity: 0.28; }

  /* 囲む枠。**当たり判定は外す** — 枠の上でも下の部品を掴めるように。 */
  .cf-held-box {
    fill: none;
    stroke: var(--cf-held);
    stroke-width: 1.6;
    stroke-dasharray: 5 3;
    pointer-events: none;
  }

  /* 領域選択の帯。**掴めない** (下の部品を拾わせる)。 */
  .kc-band-select {
    position: absolute; z-index: 1; pointer-events: none;
    border: 1px dashed var(--cf-held); background: var(--cf-held); opacity: 0.18;
  }

  /* 注釈の札 (circuit のマップ)。図ではなく掴むための升目なので、印そのものは
     描かず、指した升に小さな札を出す。 */
  /* 塗り潰す記号の中身 (同軸コネクタの中心導体)。輪郭の線とは別に持つ。 */
  .cf-glyph-core { fill: var(--cf-ink); stroke: none; }

  .cf-note-tag { fill: var(--cf-paper); stroke: var(--cf-ink); stroke-width: 1; opacity: 0.85; }
  .cf-note-text { fill: var(--cf-ink); }
  /* 形を持つ注釈 (line / arrow / box)。**図に重ねる印**なので、部品や配線とは
     別の見え方にする — 細い破線で、回路の一員ではないことを言う。
     当たり判定は太い透明を重ねる (配線と同じ手。掴めないと動かせない)。 */
  .cf-note-line {
    fill: none; stroke: var(--cf-ink); stroke-width: 1.4; opacity: 0.7;
    stroke-dasharray: 5 3; stroke-linecap: round;
  }
  .cf-note-hit { fill: none; }

  /* 読めなかった行に書かれたもの。**触れている印・持っている印より後に置く**。 */
  .cf-bad .cf-glyph, .cf-bad .cf-glyph-line, .cf-bad .cf-lead,
  .cf-wire.cf-bad { stroke: var(--cf-bad); }
  .cf-bad .cf-name { fill: var(--cf-bad); }

  /* 触れている穴の印。**穴を塗り潰さない** — 当たり判定の四角は升ちょうどの
     大きさなので、塗ると穴そのものがカーソルの下に隠れる (実機で
     「マウスカーソルの■で穴が隠れる。小さくするか非表示に」)。
     升より小さい輪を穴の真ん中に置いて、中は空けておく (map.ts の markHole)。 */
  .cf-hole-mark {
    fill: none; stroke: var(--vscode-focusBorder); stroke-width: 1.5;
    opacity: 0.8; pointer-events: none;
  }
  /* ゴースト: 置く・動かす先の穴。置けないときは赤。**触れている印より後に、
     同じ強さで置く** — カーソルの真下の穴 (まさに押そうとしている穴) が薄い色に
     負けると、1 穴で置く部品はゴーストがまったく見えない。 */
  body.cf-carrying .cf-cell.cf-ghost, .cf-cell.cf-ghost { fill: var(--cf-ghost); opacity: 0.45; }
  body.cf-carrying .cf-cell.cf-ghost-bad, .cf-cell.cf-ghost-bad { fill: var(--cf-bad); opacity: 0.45; }
  /* 端数の升は DOM に無い。押した升からずらした所に小さい四角を出す (52 の docs/23)。掴めてはいけない。 */
  .cf-fine-box { fill: var(--cf-ghost); opacity: 0.6; pointer-events: none; }
  .cf-fine-box-bad { fill: var(--cf-bad); }
  /* 配線の 1 点目。 */
  body[data-tool="wire"] .cf-cell.cf-from, .cf-cell.cf-from {
    fill: var(--vscode-focusBorder); opacity: 0.35;
  }

  /* 引いている最中の配線の影。**引いたら消える**ので、図には残らない。
     置く部品のゴーストと同じ色にして、「まだ書かれていない」ことを揃える。 */
  .cf-ghost-wire {
    fill: none; stroke: var(--cf-ghost); stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 4 3; pointer-events: none;
  }

  /* 多端子部品の足の先の接続点。**配線の道具のときだけ濃く出す** — いつも
     目立たせると、足の丸が記号より先に目に入って図として読みにくい。
     当たり判定は見た目より大きく取ってあり、そちらは常に透明。 */
  .cf-pin-dot { fill: var(--cf-paper); stroke: var(--cf-ink); stroke-width: 1.2; }
  .cf-pin-hit { fill: transparent; stroke: none; }
  body[data-tool="wire"] .cf-pin-dot { fill: var(--vscode-focusBorder); stroke: none; }
  body[data-tool="wire"] .cf-pin-hit:hover + .cf-pin-name,
  body[data-tool="wire"] .cf-pin-hit:hover { cursor: crosshair; }
  /* 押した足。1 点目の印は穴と同じ色で出す。 */
  .cf-pin-hit.cf-from { fill: var(--vscode-focusBorder); opacity: 0.45; }
`;

/** 升目とその頭の一覧。セッションが組む (`Session.view`)。 */
export type MapViewHtml = {
  /** `renderMapHtml` が組んだ升目 (エスケープ済み)。 */
  readonly html: string;
  /** `renderFencePicker` が組んだ一覧 (エスケープ済み。1 つなら空)。 */
  readonly picker: string;
  /** `renderIssues` が組んだ帯 (エスケープ済み。言うことが無ければ空)。 */
  readonly issues: string;
  /**
   * いまのフェンスの語彙 (パレットと候補の一覧)。**言語が変わると入れ替わる**
   * ので、升目と一緒に送り直す。1 つのフェンスしか扱わない殻では毎回同じ。
   */
  readonly chrome: PanelChrome;
};

/** フェンスが組む帯 (`FenceEditor.palette` / `typeNames` の答え)。 */
export type PanelChrome = {
  /** 置ける部品の一覧。 */
  readonly palette: string;
  /** 種類の名前の候補 (`datalist`)。欄の `list` が指す。 */
  readonly typeNames: string;
  /** 色の候補 (`datalist`)。配線を選んだときの色の欄が引く。 */
  readonly colorNames: string;
  /** 配線の色見本 (固定のパレット)。色を書かないフェンスでは空。 */
  readonly swatches: string;
  /** 配線を `Shift` で折れるか (`FenceEditor.foldsWire`)。案内文に出す。 */
  readonly foldsWire: boolean;
  /** 何分の 1 升まで刻めるか (`FenceEditor.fine`)。null なら Ctrl は素のクリック (52 の docs/23)。 */
  readonly fine: number | null;
  /** 端数が効く相手 (`FenceEditor.fineFor`)。`note` なら注釈だけ。 */
  readonly fineFor: 'all' | 'note';
};

/** 欄の種類が引く候補の名札。**組む側と引く側で同じ綴りを使う**ための 1 か所。 */
export const TYPE_LIST_ID = 'cf-type-names';

/** 色の候補の名札。**組む側と引く側で同じ綴りを使う**ための 1 か所。 */
export const COLOR_LIST_ID = 'cf-color-names';

/**
 * 配線の色見本。**四角と名前を並べた固定のパレット**
 * (実機で「ドロップダウンメニューではなく、固定の色パレット」)。
 *
 * ドロップダウンだと**開くまで色が見えない** — 色名だけの並びから被覆の色を
 * 思い出させることになる。実物の色そのもので四角を塗るので、`colors.ts` の
 * 表をそのまま引く (テーマで塗り替えない色。図と見本が食い違わない)。
 *
 * 引ける名前だけを出す (知らない名前は四角の色が決まらない)。
 */
export const renderSwatches = (names: readonly string[]): string => {
  const seen = new Set<string>();
  const shown = names
    .map((name) => ({ name, css: wireColor(name) }))
    .filter((one) => {
      // **同じ四角を 2 つ並べない。** `gray` と `grey` は同じ色の綴り違いで、
      // 見本に両方出すと「どこが違うのか」と読ませてしまう (実機で訊かれた)。
      // 書くほうは今までどおり両方通る — 減らすのは見本だけ。
      if (one.css === null || seen.has(one.css)) return false;
      seen.add(one.css);
      return true;
    });
  if (shown.length === 0) return '';
  return shown.map((one) => (
    `<button type="button" class="cf-swatch" data-color="${escapeMarkup(one.name)}"`
    + ` title="${escapeMarkup(one.name)}">`
    + `<span class="cf-swatch-chip" style="background:${escapeMarkup(one.css ?? '')}"></span>`
    + `<span class="cf-swatch-name">${escapeMarkup(one.name)}</span></button>`
  )).join('');
};

/**
 * 種類の欄が、選んだものによって引き替える候補の名札。**中身は空で出す** —
 * 何を並べるかは選んだものが来てから決まる (配線なら `--` / `-|` / `|-`)。
 */
export const KIND_LIST_ID = 'cf-kind-names';

export type PanelHtmlOptions = {
  /** webview の CSP に載せる出所。 */
  readonly cspSource: string;
  /** スクリプトを許す 1 回きりの札。 */
  readonly nonce: string;
  /** webview から見た `dist/map.js` の在り処 (`asWebviewUri` が作る)。 */
  readonly scriptUri: string;
  /**
   * 升目と、いまのフェンスの語彙。**語彙も `view` が持つ** — 言語が変わると
   * 入れ替わるので、最初の HTML と送り直しで同じ出どころにする
   * (別々に渡していたときは、最初に開いた言語のパレットが残った)。
   */
  readonly view: MapViewHtml;
  /**
   * 戻す・やり直すを誰が持つか。`own` はパネル (VS Code の undo が届かないので
   * 自前の履歴)、`vscode` はカスタムエディタ (タブの文書へ undo が届く)。
   */
  readonly undo: 'own' | 'vscode';
};

/**
 * 一覧に出す行番号。**3 桁に足りなければ 0 を先に付ける** (`001` `012`) —
 * 桁数が違うと題の頭が縦にずれる (実機で頼まれた)。4 桁からはそのまま。
 */
const LINE_DIGITS = 3;
const lineLabel = (line: number): string => String(line).padStart(LINE_DIGITS, '0');

/**
 * フェンスの一覧。**2 つ以上のときだけ**出す (1 つなら選ぶものが無い)。
 * 題があれば題、無ければ「フェンス」と呼ぶ。題はフェンスから来た字なので
 * エスケープする。
 */
export function renderFencePicker(fences: readonly FenceEntry[], line: number | null): string {
  if (fences.length < 2) return '';
  const options = fences.map((fence) => {
    // **「行番号: 題」。** 一覧は上から順に並ぶので、頭が揃っていると目で追える
    // (題を先に出すと、長さがまちまちで行番号の桁が縦に揃わない。実機で頼まれた)。
    const label = `${lineLabel(fence.line)}: ${fence.title ?? 'フェンス'}`;
    return `<option value="${fence.line}"${fence.line === line ? ' selected' : ''}>${escapeMarkup(label)}</option>`;
  }).join('');
  // **前後と両端のボタンを添える。** 一覧を開いて選び直さずに隣のフェンスへ
  // 行ける (図を 1 枚ずつ見ていくときの動きがこれ。実機で頼まれた)。
  //
  // 並びも印も**メディアプレーヤーと同じ** — ⏮ ◀ ▶ ⏭ (実機で「最初、最後に
  // 移動できるようにする。メディアプレーヤーのアイコンを真似する」)。
  // 端へ飛ぶ 2 つは**棒と三角を並べて**描く。⏮ ⏭ の 1 文字は環境によって
  // 色付きの絵文字になり、ほかのボタンと揃わない。
  const step = (name: string, glyph: string, title: string): string =>
    `<button type="button" class="cf-fence-step" data-step="${name}" title="${title}">${glyph}</button>`;
  return `<label>フェンス <select class="cf-fence">${options}</select></label>`
    + step('first', '|◀', '最初のフェンス')
    + step('prev', '◀', '前のフェンス')
    + step('next', '▶', '次のフェンス')
    + step('last', '▶|', '最後のフェンス');
}

/** 右の道具の列。**鍵と同じ一覧** — 押すと同じ鍵を押したことになる。 */
type ToolButton = {
  /** 状態を持つ道具 (押している間ハイライトする)。 */
  readonly tool?: string;
  readonly key: string;
  /** `Ctrl` を押しながらの鍵か (複製)。 */
  readonly modifier?: boolean;
  readonly glyph: string;
  readonly name: string;
  readonly kbd: string;
  /**
   * 名前だけでは相手が分からない道具の一言。**動かすと引きずるは形が同じ**
   * (どちらも持ち上げて 1 クリック) なので、名前と鍵しか出さないと一覧では
   * 見分けが付かない (実機で「何が違うのか」と訊かれた)。
   */
  readonly hint?: string;
  /**
   * 右クリックの一覧にだけ出す道具。**道具の列には出さない** — 相手が
   * 注釈のときにしか効かないものを常に並べると、押せない釦が居座る。
   */
  readonly menuOnly?: boolean;
};

const TOOLS: readonly ToolButton[] = [
  { tool: 'select', key: 'Escape', glyph: '↖', name: '選ぶ', kbd: 'Esc' },
  { tool: 'place', key: 'a', glyph: '▣', name: '部品', kbd: 'A' },
  { tool: 'wire', key: 'w', glyph: '─', name: '配線', kbd: 'W' },
  { key: 'm', glyph: '✥', name: '動かす', kbd: 'M', hint: '部品だけが動く (配線は元の穴に残る)' },
  { key: 'g', glyph: '⤡', name: '引きずる', kbd: 'G', hint: '穴に来ているものが丸ごと動く (つながりは保たれる)' },
  { key: 'r', glyph: '↻', name: '回す', kbd: 'R' },
  { key: 'x', glyph: '⇔', name: '反転', kbd: 'X' },
  { key: 'd', modifier: true, glyph: '⧉', name: '複製', kbd: 'Ctrl+D' },
  { key: 'Delete', glyph: '✕', name: '消す', kbd: 'Del' },
  // 注釈の言葉を写す。**相手が注釈のときだけ効く**ので一覧にだけ出す。
  {
    key: 'c', glyph: '⧉', name: 'テキストコピー', kbd: 'C',
    hint: '注釈 (text) の言葉をクリップボードへ', menuOnly: true,
  },
];

/**
 * 右クリックの一覧。**道具の列と同じ表から組む** — 押せることが 2 通りの
 * 並びで違って見えると、鍵を覚える手がかりにならない。
 */
const toolTitle = (one: ToolButton): string =>
  escapeMarkup(`${one.name} (${one.kbd})${one.hint === undefined ? '' : ` — ${one.hint}`}`);

const renderMenu = (): string => `<menu class="kc-menu" hidden>${TOOLS.map((one) => (
  `<li><button type="button" class="kc-tool kc-menu-item" data-key="${one.key}"`
  + `${one.modifier === true ? ' data-modifier="1"' : ''} title="${toolTitle(one)}">`
  + `<span class="kc-glyph">${one.glyph}</span><span>${one.name}</span><kbd>${one.kbd}</kbd></button></li>`
)).join('')}</menu>`;

const renderTools = (): string => TOOLS.filter((one) => one.menuOnly !== true).map((one) => (
  `<button type="button" class="kc-tool"${one.tool === undefined ? '' : ` data-tool="${one.tool}"`}`
  + ` data-key="${one.key}"${one.modifier === true ? ' data-modifier="1"' : ''}`
  + ` title="${toolTitle(one)}">`
  + `<span class="kc-glyph">${one.glyph}</span><span>${one.name}</span><kbd>${one.kbd}</kbd></button>`
)).join('');

export const panelHtml = ({ cspSource, nonce, scriptUri, view, undo }: PanelHtmlOptions): string => {
  const own = undo === 'own';
  const { chrome } = view;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none';`
    + ` style-src ${escapeMarkup(cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeMarkup(nonce)}';">`
    + `<style>${STYLE}</style><title>図を掴んで動かす</title></head>`
    + `<body data-tool="select"${own ? ' class="cf-own-undo"' : ''}>`
    + `<header class="kc-top">`
    + `<button type="button" class="kc-props-toggle" title="属性と部品 (狭いとき)">▤</button>`
    + `<span class="kc-group">`
    + `<button class="cf-undo"${own ? ' disabled' : ''} title="元に戻す (Ctrl+Z)">↶</button>`
    + `<button class="cf-redo"${own ? ' disabled' : ''} title="やり直す (Ctrl+Shift+Z)">↷</button></span>`
    + `<span class="kc-group">`
    + `<button class="kc-zoom-out" title="縮小 (-)">−</button>`
    + `<button class="kc-zoom-in" title="拡大 (+)">＋</button>`
    + `<button class="kc-fit" title="全体 (Home)">⤢</button></span>`
    + `<p class="cf-fences">${view.picker}</p>`
    + `<span class="kc-title">ホイールで拡大・縮小、中ボタン (か Space + ドラッグ) で移動</span>`
    + `<span class="kc-title-touch">2 本指で移動・ピンチで拡大、長押しでメニュー</span>`
    + `</header>`
    + `<div class="kc-main">`
    + `<aside class="kc-props"><h2>属性</h2>`
    + `<form class="cf-inspector" hidden>`
    + `<label>名前 <input class="cf-field" name="id" size="8" title="E"></label>`
    + `<label>種類 <input class="cf-field" name="type" size="12" list="${TYPE_LIST_ID}"></label>`
    + `<label>値 <input class="cf-field" name="value" size="8"></label>`
    + `<label>ラベル <input class="cf-field" name="label" size="8"></label>`
    + `<label>色 <input class="cf-field" name="color" size="8" list="${COLOR_LIST_ID}"></label>`
    + `<datalist id="${KIND_LIST_ID}"></datalist>`
    + `</form>`
    // **色見本は欄の外。** 配線の道具を選んだだけ (何も選んでいない) のときも
    // 出したいので、欄の出し入れとは別に持つ。
    + `<section class="cf-colors" hidden><h3>配線の色</h3>`
    + `<div class="cf-swatches">${chrome.swatches}</div></section>`
    // **部品の一覧はここに出しっぱなし** (実機で「属性パネルに固定で」)。
    // 窓の絵を押すと、今までどおり図の上に浮かぶ窓へ移す (`kc-chooser`)。
    // **語彙ごと移す**ので、箱は 1 つだけ (中身は言語をまたぐと入れ替わる)。
    + `<section class="kc-dock"><h3>部品を置く`
    + `<button type="button" class="kc-dock-pop" title="別の窓で開く">⧉</button></h3>`
    + `<div class="kc-dock-body">`
    // **言語ごとに入れ替わる。** 1 つの殻が 3 つのフェンスを扱うので、
    // いまのフェンスの語彙に差し替えられるよう箱で包む (52 の docs/19)。
    // **能力表も同じ箱に書く** (body に焼くと、言語をまたいだとき最初の言語のまま残る)。
    + `<div class="cf-chrome-palette" data-folds="${chrome.foldsWire ? '1' : '0'}"`
    + ` data-fine="${chrome.fine ?? ''}" data-fine-for="${chrome.fineFor}">${chrome.palette}</div>`
    + `</div></section>`
    + `<p class="kc-props-hint">部品や配線をクリック (か <kbd>E</kbd>) すると欄が出ます。`
    + `<kbd>Enter</kbd> か欄を離れたときに行へ当たります。</p>`
    + `</aside>`
    + `<div class="kc-stage"><div class="kc-canvas"><div class="cf-body">${view.html}</div></div>`
    + renderMenu()
    + `<div class="kc-chooser" hidden><header>部品を置く <kbd>Enter</kbd> で先頭を持つ`
    + `<button type="button" class="kc-chooser-close" title="属性パネルへ戻す (Esc)">✕</button></header>`
    + `<div class="kc-chooser-body"></div>`
    + `</div></div>`
    + `<nav class="kc-tools">${renderTools()}</nav>`
    + `</div>`
    + `<details class="kc-band" open><summary>読めなかった行とお知らせ</summary>`
    + `<div class="cf-band">${view.issues}</div></details>`
    + `<footer class="kc-status"><span class="cf-status"></span>`
    + `<span class="kc-cell"></span><span class="kc-zoom">100 %</span></footer>`
    + `<div class="cf-chrome-lists">${chrome.typeNames}${chrome.colorNames}</div>`
    + `<script nonce="${escapeMarkup(nonce)}" src="${escapeMarkup(scriptUri)}"></script></body></html>`;
};

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * スクリプトを 1 回きりで許すための札。**擬似乱数では作らない** —
 * `Math.random` は予測できるので、札の意味が薄れる。
 * `crypto` はデスクトップと web のどちらの拡張ホストにもある。
 */
export const makeNonce = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => ALPHABET[byte % ALPHABET.length]).join('');

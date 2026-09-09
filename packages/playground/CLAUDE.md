# プロジェクト指示 (playground)

3 つのフェンスを**ブラウザだけ**で試す 1 枚の静的ページ。
拡張を入れずに「書くと図が出る」ところまで見せるための入口
(もう 1 つの入口は Codespaces。判断は 52 の docs/15)。

置き場は GitHub Pages。リポジトリ直下の `.github/workflows/pages.yml` が
`dist/` をそのまま上げる。

## ここは拡張ではない

`contributes` を持たないので、`scripts/packages.mjs` は拡張と数えず、
`doBuild.sh` / `make` の `.vsix` の対象から外れる。
`make check` には乗るので、`typecheck` と `test` は通し続ける。

## 約束

1. **3 つのコアを直に呼ぶ。** 描画の決め事はこちらに書かない
   (`fences.ts` が 3 つを 1 つの形に揃えるだけ)。文法も図もあちらが正。
2. **circuit の図は TeX を持ってきて描く。** WASM の TeX
   (node-tikzjax のもの) をブラウザで走らせる。**要るときだけ落とす** —
   資材 8.5 MB は circuit の図を初めて描くときに取りに行き、
   breadboard と perfboard しか見ない人には落とさせない。
   後処理 (`finishSvg`) はコアのものを通すので、描き上がりは拡張と揃う。
3. **マップは iframe を webview の代わりにする。** 拡張では VS Code が
   webview を用意し、拡張ホストと `postMessage` で話す。その形をそのまま
   写したので、**殻 (fence-kit) も文法も 1 行も変えずに動く**。
   頁が肩代わりするのは 3 つ: 送り口 (`acquireVsCodeApi`)、色の変数
   (`--vscode-*`)、そして文書 — テキスト欄の中身を「フェンスが 1 つだけ
   書かれた Markdown」に見せる (`map/doc.ts`)。
4. **例は写さない。** `scripts/examples.mjs` が各パッケージの `examples/` から
   フェンスを抜き出してビルド時に `dist/examples.json` を作る。
   ここに例の本文を置くと、直した日に 2 つが食い違う。
5. **決め事は DOM を知らない場所に置く。** `main.ts` は打鍵を読んで結果を
   映すだけの薄い層で、テストの対象は `share.ts` / `examples.ts` / `fences.ts`。
6. **外から来た字は境界で確かめる。** URL のハッシュ (`share.ts`) と
   `examples.json` (`examples.ts`) は、読めなければ null か空で返し、
   落とした数を画面に出す。黙って捨てない。
7. **どこにも送らない。** 図もフェンスもブラウザの中だけで動く。
   共有は URL に載せるだけで、預け先を持たない。
   **だから配ったリンクは「こちらが読めなくする」以外では切れない。**
   次の約束はそれを守るためのもの。
8. **共有リンクの読み口は足すだけ。減らさない** (判断は 52 の docs/37)。
   リンクは種類を**平文で**載せ (`#breadboard/…`)、中身も base64 で
   埋め込んである。**綴りを変えると、配ってあるリンクが黙って読めなくなる。**
   - 種類の別名は `kinds.ts` の `ALSO` に足す。**期限を切らない**
     (52 の docs/08 の「別名を落とすコストは見えない黙った壊れ方」と同じ)。
   - 綴り (`#<種類>/<base64url>`) を変えるとき — 圧縮や短縮を入れるとき —
     は、**旧い形も読み続ける**。新しい形は見分けが付く印で始める。
   - 受け口を緩めるのは**リンクの読み口だけ**。画面の状態と `examples.json`
     は自分で作るので `isKind` (正の綴りだけ) のまま。
9. **スマホではアプリになる** (PWA。判断は 52 の docs/35)。ホーム画面から
   開いたときだけ `body.app` を付けて、**編集する所だけ**を出す
   (見出し・フェンスの字・出るものを畳む)。**頁として開いた人には何も
   変えない** — 同じ 1 枚で両方をまかなう。
   manifest の道は**相対**で書く (置き場が Pages の `/tommie-fence/` と
   手元の `/` の 2 つあるため)。
10. **絵札は組み立てが焼く。** 約束 2 の「外から持ってこない」と揃える —
   ラスタライザ (sharp は 30 MB の native) を足さず、favicon と同じ図案を
   zlib で PNG に詰める (`scripts/icon.mjs`)。
11. **控え役は先読みしない。** 束ねた塊の名前は中身のハッシュなので、
    先読みの一覧を作ると組み立てと二重管理になる。一度通った道を控えるだけ。
    **控えを先に返してよいのは、名前に中身の指紋が入っているものだけ**
    (`chunk-*.js` / `tex/` / `icon-*.png`)。`app.js` も `style.css` も名前が
    変わらないので、控えを先にすると**直しが 1 回目の表示に出ない**。
    そちらは網が先で、駄目なときだけ控えから返す。
12. **見せる順は 図 → 字** (デモとしての形。判断は 52 の docs/41)。
    狭い画面は 一文 → 種類の札 → 図 → 試す → フェンス → 道具 → 次へ、
    広い画面は今までどおり左に字・右に図 (HTML は図が先、CSS の order で
    入れ替える)。**既定の例は 3 つとも「図01 LED と抵抗」** — 同じ回路を
    3 通りに描けることが、3 つを 1 つに畳んだ理由だから。
    **わざと壊した例は `?dev` のときだけ**欄に出す。
13. **「試す」釦は当たるものだけ出す** (`demo.ts`)。`nudge` はちょうど
    1 か所のときだけ書き換え、0 か所・2 か所以上では null を返す。
    **押しても何も起きない釦は「壊れている」と読まれる。**
    釦は例の本文の断片を探すので、**例を直すと黙って死ぬ** — 試験が
    例を fs で読んで当たり続けているか見張っている。

## コマンド

リポジトリ直下から:

```bash
npm run check --workspace=playground    # 型チェック + テスト
npm run build --workspace=playground    # dist/ を作る
npx -y serve packages/playground/dist   # 手元で開く (python3 -m http.server でもよい)
```

`npm run watch` は束ねるものだけを見張る。HTML と CSS と例と
TeX の資材は `npm run build` のたびに写す。

TeX の資材 (`dist/tex/`) は **node_modules の node-tikzjax から写す**。
リポジトリには置かない (8.5 MB のバイナリを二重に持たない)。

## 構成

- `src/kinds.ts` — 3 つの種類。依存を持たない小さな島
- `src/fences.ts` — 3 つのコアを 1 つの入口に。**ここだけが 3 つを知っている**
- `src/share.ts` — URL のハッシュ (`#<種類>/<base64url>`)
- `src/examples.ts` — `examples.json` の受け取り (形の確認)
- `src/main.ts` — DOM。決め事は持たない
- `src/map/` — 図を掴んで動かすマップ。`doc.ts` (テキスト欄を Markdown に
  見せる) と `host.ts` (殻が求める外の世界) が純関数でテストがあり、
  `webview.ts` は iframe の中で動く。**`import()` で読む**ので別のかたまり
- `src/tex/` — circuit の図を描く一式 (node-tikzjax をブラウザへ移したもの)。
  `tar.ts` だけが純関数でテストがある。残りは fetch / WASM / DOM が要るので
  ブラウザで確かめる。**`import()` で読む**ので別のかたまりになる
- `src/sw.js` — 控え役 (service worker)。**束ねない** — 出所の根に置く
  1 本で、組み立てが版を差し込んで `dist/` へ写す
- `scripts/examples.mjs` — 例を集める (ビルド時)
- `scripts/icon.mjs` — PWA の絵札を焼く (ビルド時)。型は `icon.d.mts`
- `src/index.html` / `src/style.css` — そのまま `dist/` へ写す
- `dist/manifest.webmanifest` — 組み立てが書く (版と絵札の一覧を持つので、
  手で書くと `package.json` と食い違う)

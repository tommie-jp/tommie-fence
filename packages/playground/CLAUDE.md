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
2. **circuit の図はここでは出せない。** WASM の TeX が要るため。
   TeX とネットリストと報告までを出し、図の代わりに理由を書く。
   web 版の拡張 (`extension.web.ts`) と同じ線。
3. **例は写さない。** `scripts/examples.mjs` が各パッケージの `examples/` から
   フェンスを抜き出してビルド時に `dist/examples.json` を作る。
   ここに例の本文を置くと、直した日に 2 つが食い違う。
4. **決め事は DOM を知らない場所に置く。** `main.ts` は打鍵を読んで結果を
   映すだけの薄い層で、テストの対象は `share.ts` / `examples.ts` / `fences.ts`。
5. **外から来た字は境界で確かめる。** URL のハッシュ (`share.ts`) と
   `examples.json` (`examples.ts`) は、読めなければ null か空で返し、
   落とした数を画面に出す。黙って捨てない。
6. **どこにも送らない。** 図もフェンスもブラウザの中だけで動く。
   共有は URL に載せるだけで、預け先を持たない。

## コマンド

リポジトリ直下から:

```bash
npm run check --workspace=playground    # 型チェック + テスト
npm run build --workspace=playground    # dist/ を作る
npx -y serve packages/playground/dist   # 手元で開く (python3 -m http.server でもよい)
```

`npm run watch` は束ねるものだけを見張る。HTML と CSS と例は
`npm run build` のたびに写す。

## 構成

- `src/kinds.ts` — 3 つの種類。依存を持たない小さな島
- `src/fences.ts` — 3 つのコアを 1 つの入口に。**ここだけが 3 つを知っている**
- `src/share.ts` — URL のハッシュ (`#<種類>/<base64url>`)
- `src/examples.ts` — `examples.json` の受け取り (形の確認)
- `src/main.ts` — DOM。決め事は持たない
- `scripts/examples.mjs` — 例を集める (ビルド時)
- `src/index.html` / `src/style.css` — そのまま `dist/` へ写す

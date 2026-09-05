# プロジェクト指示 (tommie-fence)

電子工作の図を描く Markdown フェンス言語のモノレポ。全体像は
[README.ja.md](README.ja.md) (英語は [README.md](README.md))。
各パッケージの設計上の約束は `packages/*/CLAUDE.md` にあり、
**そちらがそのパッケージについては正**。ここには横断の作法だけを書く。

## 構成

- `packages/circuit-fence` — ` ```circuit ` フェンス。回路図 (circuitikz / TeX)
- `packages/breadboard-fence` — ` ```breadboard ` フェンス。ブレッドボード実体配線図
- `packages/fence-kit` — 3 つで重複している部分の置き場。ビルド工程を持たず、
  使う側の esbuild が束ねる。入口は 3 つ: `fence-kit` (本体。**DOM も Node も
  使わない**)、`fence-kit/cli` (**CLI 専用。ここだけ Node を使ってよい**)、
  `fence-kit/webview`
- `packages/perfboard-fence` — ` ```perfboard ` フェンス。ユニバーサル基板。
  **一通り動く** (2 本足・3 本足・DIP / SIP、板の外の機器、注釈、テーマ、
  文法リファレンスと例と CLI まで)。
  全穴が独立しているので、breadboard の `board` / `layout` / `place` /
  `router` はそのままでは使えない。**実測すると土台に
  なるのは盤面モデルではなく描画層のほう** (52 の docs/05)
- `packages/tommie-fence` — **VS Code に出るのはこれだけ。** 3 つのフェンスを
  1 つの拡張に畳んだもの (52 の docs/19)。中身は入口だけで、図を描くのは
  上の 3 つのコア。**3 つは拡張ではなくライブラリ + CLI**になった
- `packages/playground` — 3 つのフェンスをブラウザだけで試す静的なページ
  (GitHub Pages)。**拡張ではない** ので `.vsix` の対象から外れ、`check` には乗る。
  約束は [packages/playground/CLAUDE.md](packages/playground/CLAUDE.md)

言語は別、作法は同じ。**先回りして共通化しない** — 実際に重複してから引き上げる。
いま fence-kit にあるのは、実測で重複が確かめられたものだけ:
改行を揃える処理、フェンスの取り出し (言語名は引数)、markup のエスケープと
要素の組み立て、**盤面に依らない SVG の部品** (`num` / `svgText`)、
**実物の部品の話** (抵抗値とカラーコード、部品と配線の色、字幅の見積もり)、
**ネットリストの組み立て** (`computeNets`。盤面ごとの事情は `preferredName` に寄せた)、
**CLI の共通部分** (`fence-kit/cli` — 引数の読み取り、入力ファイルの集め方、
ネットリストの出し方)。
図の中身 (板・部品・配線の形) は入っていない — circuit は TeX に描かせるので
SVG を直に組み立てるコードを持たず、共有できるのが breadboard と
perfboard の 2 つだけ。perfboard が描き進むあいだも、
要ったものから 1 つずつ引き上げる。

## コマンドはリポジトリ直下で

npm workspaces なので、`npm install` は直下で 1 回。lock も直下の 1 本だけ。

```bash
npm install
npm run check                                # 全パッケージの型チェック + テスト
npm run check --workspace=circuit-fence      # 1 つだけ
npm run examples --workspace=circuit-fence   # 図を作り直す
npm run build --workspace=playground         # 試す頁 (playground) を組む
./doBuild.sh                                 # .vsix を作って入れ直す (拡張は 1 つ)
./doVersion.sh circuit-fence minor           # 版を上げる
```

**触っていないものは作り直さない。** 段取りは `Makefile` が持っていて、
`doBuild.sh` は引数を make の目標に訳すだけ。make を直に呼んでもよい:

```bash
make                  # .vsix を作る (変わっていれば)
make install          # 上に加えて VS Code に入れ直す (doBuild.sh の既定)
make tommie-fence     # 拡張だけ (チェックは飛ばさない)
make CHECK=0 install  # 型チェックとテストを飛ばす (doBuild.sh --fast と同じ)
make clean            # 作り直しの記録・作業場・.vsix を捨てる
make help             # 目標の一覧
```

作り直しが要るかどうかは、入力ファイル (`git ls-files` に見えているもの) と
`.vsix` の新しさで決まる。印と作業場は `.build/` に置く (`.gitignore` 済み)。
**作業場は依存を入れたまま残す** — 2 回目からの `npm install` が
5.4 秒 → 0.6 秒になるため。1 GB 近くなるので、片付けるときは `make clean`。

## 約束

1. **`vsce` を直に呼ばない**。`.vsix` を作るのは `./doBuild.sh` (と、その中身の
   `make`) だけ。**拡張は `tommie-fence` の 1 つ**で、3 つのコアはその依存として
   作業場へ写される (`WSDEPS` は入れ子まで辿る)。
   **入れ直す前に畳む前の 3 つを消す** (`RETIRED`) — 残っていると文法も
   プレビューも二重に登録され、図が 2 つ出る。
   workspaces は依存を直下の `node_modules` へ巻き上げるので、パッケージの中で
   `vsce package` を走らせると依存を外に探しに行き、同じファイルを 2 通りの経路で
   拾って「同じパスが 2 つある」と言って止まる。`scripts/vsix.sh` はパッケージ単体を
   作業場へ写して単独で install してから詰める。**役割は 3 つに分けてある**:
   `doBuild.sh` が入口、`Makefile` が何をいつ作り直すか、
   `scripts/vsix.sh` が 1 つのパッケージの詰め方。
2. **パッケージは単体で install できる形を保つ**。1 の段取りが成り立つ前提。
   devDependencies を直下へ集約しない (各パッケージに置いたままにする)。
   パッケージのビルドが要るファイルは、そのパッケージの中に置く
   (`esbuild.mjs` を共通化しないのはこれが理由)。
3. **パッケージ間で依存するときは esbuild で束ねる**。`fence-kit` は
   external にしない。`.vsix` に実体は入らないので、依存の種類としては
   **devDependencies が正しい** (実行時には要らない)。
   `scripts/vsix.sh` は作業場へ写すとき、モノレポ内の依存を隣に置いて
   `file:` 指定に書き換える。npm 上に無いパッケージを探しに行かせないため。
   **npm は `file:` の依存を「中身が変わっただけ」では写し直さない**ので、
   詰める前に `node_modules` の側へ写し直している (これを外すと `fence-kit` の
   直しが `.vsix` に入らない)。
4. **版はパッケージごとに独立**。揃えない (揃えると直していないパッケージまで
   版が上がって CHANGELOG が嘘になる)。**タグはパッケージ名を接頭辞にする**:
   `circuit-fence-v0.4.0`。旧リポジトリの `v0.3.0` 形式は archive 側に残る。
5. **CI はリポジトリ直下の `.github/workflows` だけが動く**。
   パッケージの中に置いても GitHub は読まない。
6. **README の図と相対リンクは `vsce` が絶対 URL へ書き換える**。基準の既定は
   リポジトリ直下なので、モノレポでは `packages/<パッケージ>` の分が足りない。
   `scripts/vsix.sh` が `package.json` の `repository.directory` から基準を作って
   `--baseContentUrl` / `--baseImagesUrl` で渡している。**パッケージを別の
   深さへ動かすなら `repository.directory` も直す** — 忘れると Marketplace と
   拡張ページの図が黙って 404 になる (ローカルの相対リンクは正しいままなので
   気づけない)。`examples/` をパッケージの外へ出せないのも同じ理由。
7. **マージは fast-forward のみ**。作業ブランチを切ってコミットし、
   `git merge --ff-only` で main に取り込み、ブランチを消す。
8. **コミットは conventional commits 形式**。
9. **Markdown は lint を通す**:
   `npx markdownlint-cli 'README.md' 'README.ja.md' 'CLAUDE.md' 'examples/*.md'`。
   パッケージの中は各パッケージの CLAUDE.md の指定に従う。
10. **README は日本語が正、英語が追随**。節の構成は 2 本で 1 対 1 に保つ。

## パッケージ間で違っていて、揃えていないもの

**揃えるべきだが揃っていない**のではなく、**理由があって違う**。消さない。

| もの | circuit-fence | breadboard-fence | なぜ |
| --- | --- | --- | --- |
| web 版のエントリ | 専用の `extension.web.ts` (描けないと返すスタブ) | 同じ `extension.ts` を束ね直すだけ | 回路図の描画は WASM の TeX が要り、ブラウザで動かない |
| `previewRefresher` | ある | ない | 回路図は描画が非同期 (TeX → SVG) なので、描き上がってからプレビューを促す仕組みが要る。フェンスに依存しないので `fence-kit` の候補 |
| ライブラリの出口 | `circuit-fence/core` は **dist** を指す (`import`/`require`/`types`)。ソースを指す `circuit-fence/src/core` を別に持つ | `breadboard-fence/core` は **ソース** (`src/core/index.ts`) を指す | circuit だけサーバー側描画から呼ぶ要望があり、外へ出す形 (dist) が要った。3 つとも playground から呼ぶので、**ビルド前でも型が付くソースの入口**を別に用意した (dist を指すと、型チェックの前に circuit を build しないと通らない)。`src/**` は `.vscodeignore` で `.vsix` に入らないので、**ソースの入口はモノレポの中でだけ生きる** |
| 実行時の依存 | `yaml` + `node-tikzjax` | `yaml` だけ | 同上 |
| 図の組み立て | TeX (circuitikz) に描かせて後から色を塗り替える | SVG を直に組み立てる | だから `svg` `palette` `textFit` `title` にあたるものが circuit には無い。`theme` は名前が同じだけで別物 (circuit は塗り替えの色、breadboard は色 + 穴の寸法)。**例外は移動エディタのマップ** (`core/edit/mapSvg.ts`) — あれは公開する図ではなく掴むための UI なので SVG を組み立てる。形は**回路図になるべく寄せる**が、正確さは TeX が正 (細部だけが違うものは同じ形に落とす) |
| エラーの帯のキャレット | 全角を 2 桁と数えて位置を合わせる | 桁数だけ合わせる | 同じ `errorText.ts` という名前で別実装。**circuit の方が正しい**ので、揃えるなら breadboard を寄せる (未着手) |

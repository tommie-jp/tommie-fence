# プロジェクト指示 (vna-fence)

Markdown の ` ```vna ` フェンスを VNA (NanoVNA) の画面として描くライブラリ + CLI。
横断の作法は[リポジトリ直下の CLAUDE.md](../../CLAUDE.md)、
**このパッケージについてはここが正**。起こした経緯と決めは
`~/52-tommie-fence/docs/75`・`76` にある (private)。

## この図の物理 (設計が板の 3 つと分かれる理由)

**図の中に部品も板も無い。** 描くのは周波数の関数 (S パラメータ) で、そこから
次が全部出てくる。

- **ネットリストも ERC もマップ (エディタの殻) も無い**。拡張には `FenceEditor` を
  渡さず、Problems に出す口 (`problemsOf`) だけを渡す
- 値は**理想の模型** (`dut:`、ABCD 行列の縦続 — `model/abcd.ts` `model/dut.ts`) と
  **測った Touchstone** (`data:` — `model/touchstone.ts`) の 2 通り。破線と実線
- 枠は**単位ごと** (`layout/panels.ts`)。実機の 4 本重ねは紙で読めないので分けた。
  語彙 (形式名・マーカーの読み値の書式) は実機に揃える

## 約束

1. **core はファイルを開かない**。`data:` は宿主が `DataSource` で渡す (CLI は `.md`
   の隣、拡張は `env.currentDocument` の隣)。**名前は `DATA_NAME` 1 か所で絞る**
   (`/` も `..` も通さない)。**名前の形だけでは足りない** — 宿主の読み口 (`cli/data.ts`) は
   シンボリックリンクを辿らず (`lstat` + `O_NOFOLLOW`)、通常のファイル以外 (`/dev/zero`・
   FIFO) を読まず、上限までしか読まない
2. **エスケープが唯一の防御** (板のフェンスと同じ)。図と帯に載る字は `escapeMarkup`、
   入力の断片を報告に載せる入口は `safeToken` だけ。Touchstone の注釈は描かない
3. **読めなかったところは図の外に出す**。**枠は必ず描く** (読めた所まで。54)。
   `data:` が読めないのはお知らせ (理想だけで図は出る)
4. **SVG に `NaN` / `Infinity` を書かない**。log の −∞、Γ = 1 の Z、tan の発散は
   `model/sparams.ts` と `abcd.ts` で頭を打たせ、描く値は `fraction` で枠の縁に寄せる
5. **上限を置く** (`limits.ts`)。点数・トレース・マーカー・素子・ファイルの大きさ
6. **先回りして共有しない**。`parseHertz` は copper にも同じ物がある — fence-kit へ
   上げるのは 2 つの綴りの受け方を見比べて揃えるとき

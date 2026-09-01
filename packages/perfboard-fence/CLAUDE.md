# プロジェクト指示 (perfboard-fence)

Markdown の ` ```perfboard ` フェンスをユニバーサル基板の実体配線図として
描く拡張。横断の作法は[リポジトリ直下の CLAUDE.md](../../CLAUDE.md)、
**このパッケージについてはここが正**。

## いまどこまで来ているか

**Phase 6 とその先の 4 つまで。** 2 本足・3 本足・DIP・SIP を置き、板の外の
機器 (`device`) につなぎ、注釈 (`notes:`) を付け、テーマと幅 (`style:`) を
選べる。板は穴数でも名前 (`akizuki-c`) でも書ける。
文法は [docs/01-syntax.md](docs/01-syntax.md)、例は [examples/](examples/README.md)。
フェーズ分けと、何をどこから持ってくるかの実測は
`~/52-tommie-fence/docs/05-perfboard-fenceの起こし方.md` にある (private)。

## この板の物理 (設計が breadboard と分かれる唯一の理由)

**全穴が独立している。** ブレッドボードは列の 5 穴が内部でつながっていて、
電源レールが 1 本まるごとつながっているが、ここには何も無い。
そこから次が全部出てくる。

- 導通は**配線でしか生まれない**。だから `stripOf` は「穴そのもの」になる
- **繋ぎ忘れが図の上で沈黙する**。ネットリストを出すだけでは足りず、
  ERC (全ピン結線済みか / ショート / 浮きネット) が要る
- 溝も電源レールも無いので、`layout` に `ravineY` も `lanes` も要らない
- 板ごとに行数が違う。**26 行を超える板がある**ので、番地の行ラベルを
  `a`〜`j` 固定にはできない (どう書くかは Phase 1 で決める)

## 約束

1. **エスケープが唯一の防御**。VS Code のプレビューは拡張が返した HTML を
   サニタイズしない。図と報告に載る字は必ず `escapeMarkup` (fence-kit) を通す。
   入力の断片を報告に載せる入口は `safeToken` だけにする。
2. **読めなかったところは図の外に出す**。SVG には何も書き込まない
   (書き出した SVG を貼ったときに報告が付いてこないように)。
3. **キャレットは全角を 2 桁と数える** (`render/errorText.ts`)。
   breadboard-fence は桁数だけ合わせていてずれる。**新しく起こすほうを
   間違った側に合わせない**ので、circuit-fence の数え方から始めている。
4. **黙って何も返さない状態を作らない**。読めたが描けないときも、
   なぜ出ないのかを言う (`renderPerfboard` の `pending`)。
5. **先回りして共有しない**。`fence-kit` へ上げるのは、perfboard 側で実際に
   その行が要って、breadboard と重複していると測れたときだけ。
   引き上げたら breadboard のスナップショットが無差分であることを必ず見る。
   いま上がっているのは `num` / `svgText` / `parseOhms` / `resistorBandColors` /
   部品の色 / `fit` / `textWidth`。**どれも実物の部品か SVG の話で、盤面に依らない。**
6. **番地の長さに上限を置く**。行の名前を無制限に受けると `rowIndex` が
   桁あふれして `Infinity` になり、`rowLabel` の桁下げが終わらず**図が止まる**
   (実際に踏んだ)。`model/address.ts` の `MAX_ROW_LETTERS` / `MAX_COL_DIGITS`。
7. **1 つの穴に挿せる足は 1 本**。ブレッドボードは同じ列の別の行へ寄せられたが
   (48 の docs/13)、ここには寄せる先が無い — 隣の穴は別のネットになる。
   だから寄せずに**重なりとして報告する**。
8. **ERC は読めているときだけ掛ける**。読めなかった配線を勘定に入れないまま
   「つながっていません」と言うと、**書いた配線について書き忘れを指摘する**
   ことになる。掛けなかったことは黙らずに言う。
   **帯は読めなかったものを先に並べる** — ERC のお知らせは足 1 本につき 1 件
   出るので、行順のままだと打ち切り (8 件) で本物のエラーが消える。
9. **胴の形は描画と当たり判定で同じものを使う** (`placement/geometry.ts`)。
   別々に持つと「図では重なって見えるのに何も言わない」あるいはその逆になる。
   `pinRef` を 2 か所に持って ERC が黙った件と同じ型。
10. **描画コアは DOM にも `node:` にも依存しない**。同期の純関数だけで組む
   (プレビュー・CLI・サーバー側描画のどこからでも同じに呼べるように)。
11. **実寸から穴数を計算しない** (`model/catalog.ts`)。縁の余白は板ごとにも
   辺ごとにも違い、取付穴がそこに入るので、ミリを 2.54 で割っても穴数は出ない
   (秋月 C タイプは 72×47mm で 25×15。割り算だと 28×18 になる)。
   **カタログに入れてよいのは実物を数えた値だけ**で、出所を頭書きに残す。
   数えていない大きさは黙って当てはめず、近い板を挙げて返す —
   7×5cm (汎用基板) と 72×47mm (秋月 C) は別の板で、穴数も違う。

## コマンド

リポジトリ直下から回す。

```bash
npm run check --workspace=perfboard-fence      # 型チェック + テスト
npm run coverage --workspace=perfboard-fence   # カバレッジ (80% 以上を保つ)
npm run build --workspace=perfboard-fence
```

**図はフェンスの直後に貼る**: `docs/01-syntax.md` と `examples/*.md` の
フェンスはすべて本物で、直後に**そのフェンスを描いた図**を貼る。どの図にも
`title: 図NN タイトル` を付け、**番号は .md ごとに 01 から**数え直す。
規約は `src/core/examples.test.ts` が見張る。

**図は再生成してコミット**: 描画を変えたら
`npm run examples --workspace=perfboard-fence` と
`npm run docs --workspace=perfboard-fence` を実行し、`examples/out` と
`docs/out` の差分も一緒にコミットする (スナップショットテストの期待値であり、
文書が貼っている図でもある)。

**Markdown は lint を通す**:
`npx markdownlint-cli 'README.md' 'README.ja.md' 'CHANGELOG.md' 'CLAUDE.md' 'docs/*.md' 'examples/*.md' 'examples/errors/*.md'`。
設定は `.markdownlint.json` (MD013 行長・MD033 インライン HTML は無効)。

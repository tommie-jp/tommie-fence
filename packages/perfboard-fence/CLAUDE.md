# プロジェクト指示 (perfboard-fence)

Markdown の ` ```perfboard ` フェンスをユニバーサル基板の実体配線図として
描く拡張。横断の作法は[リポジトリ直下の CLAUDE.md](../../CLAUDE.md)、
**このパッケージについてはここが正**。

## いまどこまで来ているか

**Phase 2 まで。** 板・穴・2 本足の部品を描く。配線とネットリストはまだ無い。
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
6. **1 つの穴に挿せる足は 1 本**。ブレッドボードは同じ列の別の行へ寄せられたが
   (48 の docs/13)、ここには寄せる先が無い — 隣の穴は別のネットになる。
   だから寄せずに**重なりとして報告する**。
7. **描画コアは DOM にも `node:` にも依存しない**。同期の純関数だけで組む
   (プレビュー・CLI・サーバー側描画のどこからでも同じに呼べるように)。

## コマンド

リポジトリ直下から回す。

```bash
npm run check --workspace=perfboard-fence      # 型チェック + テスト
npm run coverage --workspace=perfboard-fence   # カバレッジ (80% 以上を保つ)
npm run build --workspace=perfboard-fence
```

**Markdown は lint を通す**:
`npx markdownlint-cli 'README.md' 'README.ja.md' 'CLAUDE.md'`。
設定は `.markdownlint.json` (MD013 行長・MD033 インライン HTML は無効)。

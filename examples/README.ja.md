# 例

[English](README.md) | [日本語](README.ja.md)

**実体は各パッケージの中にある。** ここはリポジトリ直下からの入口。

| フェンス | 例 | 索引 |
| --- | --- | --- |
| circuit | 回路 15 本 + わざと壊した例 5 本 | [packages/circuit-fence/examples/](../packages/circuit-fence/examples/README.md) |
| breadboard | 回路 13 本 + わざと壊した例 2 本 | [packages/breadboard-fence/examples/](../packages/breadboard-fence/examples/README.md) |

どの例も、フェンスの直後に**そのフェンスを描いた図**が貼ってある。
GitHub のようにフェンスが描画されない場所で、書き方と出力を対で読むためのもの。
VS Code のプレビュー (`Ctrl+Shift+V`) ではフェンス自体が図になる。

## circuit — 回路図

[![RC ローパス](../packages/circuit-fence/examples/out/01-rc-lowpass.png)](../packages/circuit-fence/examples/01-rc-lowpass.md)

部品を番地で置き、配線を `--` で引くと、ネットリストまで出る。
上は [01-rc-lowpass.md](../packages/circuit-fence/examples/01-rc-lowpass.md)。

- [04-non-inverting-amp.md](../packages/circuit-fence/examples/04-non-inverting-amp.md)
  — オペアンプの向きと足への引き方
- [11-logic.md](../packages/circuit-fence/examples/11-logic.md)
  — ロジックゲート、DIP の IC、切り替えスイッチ
- [15-arrows.md](../packages/circuit-fence/examples/15-arrows.md)
  — 電流の矢と電圧の符号 (`i=` `v=`)
- [errors/](../packages/circuit-fence/examples/errors/)
  — 読めなかったときに何が出るか (行番号つきのエラー)

## breadboard — ブレッドボード実体配線図

[![LED と抵抗](../packages/breadboard-fence/examples/out/01-led.png)](../packages/breadboard-fence/examples/01-led.md)

穴の番地に部品を挿すと、ボード内部の導通からネットリストが出る。
上は [01-led.md](../packages/breadboard-fence/examples/01-led.md)。
**番号は読む順**で、最小の回路から実験回路まで難しくなる。

- [07-pico.md](../packages/breadboard-fence/examples/07-pico.md)
  — Raspberry Pi Pico に LED とボタンをつなぐ
- [09-am-radio.md](../packages/breadboard-fence/examples/09-am-radio.md)
  — 1 石中波ラジオ (バーアンテナとポリバリコン)
- [10-bh-ad2.md](../packages/breadboard-fence/examples/10-bh-ad2.md)
  — B-H カーブ測定回路 (オペアンプ・測定器・トロイダルコア)
- [errors/](../packages/breadboard-fence/examples/errors/)
  — わざと読めなく書いたもの

## なぜ実体をここに置かないか

例はドキュメントではなく、**ビルドとテストの一部**だから。
パッケージの外へ出すと 3 つとも壊れる。

- `examples/out/` はスナップショットテストの**期待値**
  (`src/core/examples.test.ts` がパッケージ相対で読む)
- `npm run examples --workspace=<パッケージ>` はパッケージの中で回る
- README の相対リンクは `vsce` が**パッケージを基準に**絶対 URL へ書き換える
  (Marketplace と拡張ページの図はこれで出ている)

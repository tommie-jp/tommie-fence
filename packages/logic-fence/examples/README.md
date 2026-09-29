# 例

計器の画面の表と同じ語で書いた ` ```logic ` の例。プレビュー (`Ctrl+Shift+V`) で開くと
フェンスがそのまま図になる。
文法の全部は [docs/01-syntax.md](../docs/01-syntax.md)、1 画面の早見表は
[docs/02-cheatsheet.md](../docs/02-cheatsheet.md)。

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。

| ファイル | 内容 |
| --- | --- |
| [00-counter.md](00-counter.md) | 74HC163 が数えるアドレス (本の 10-20) — `counter` の `sequence`、バスの 16 進、カーソル 2 本 |
| [01-binary-counter.md](01-binary-counter.md) | 4 ビットの 2 進カウンタ — 分周と、バスの 10 進 |
| [02-uart.md](02-uart.md) | UART の 1 バイト — `decode:` の `uart` |
| [03-pretrigger.md](03-pretrigger.md) | トリガの前を見る — `start:` と `pulse` と `edges` |
| [04-spi-byte.md](04-spi-byte.md) | SPI の 1 バイト (モード 0) — 読み下し (SPI) はまだ無いので `pattern` のレーンをカーソルで読む |

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではない。

## 図の付け方

作り直しは `npm run examples --workspace=logic-fence`
(`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショット
テストの期待値であり、貼ってある図でもある。
どの図にも `title: 図NN タイトル` を付けてある。**番号は .md ごとに 01 から数え直す**。

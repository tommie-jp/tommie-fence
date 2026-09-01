# 例

[English](README.md) | [日本語](README.ja.md)

**実体は各パッケージの中にある。** ここはリポジトリ直下からの入口。

| フェンス | 例 | 索引 |
| --- | --- | --- |
| circuit | 回路 15 本 + わざと壊した例 5 本 | [packages/circuit-fence/examples/](../packages/circuit-fence/examples/README.md) |
| breadboard | 回路 13 本 + わざと壊した例 2 本 | [packages/breadboard-fence/examples/](../packages/breadboard-fence/examples/README.md) |
| perfboard | [packages/perfboard-fence/examples/](../packages/perfboard-fence/examples/README.md) — 回路 8 本 + わざと壊した例 1 本 | [packages/perfboard-fence/](../packages/perfboard-fence/README.ja.md) |

どの例も、フェンスの直後に**そのフェンスを描いた図**が貼ってある。
GitHub のようにフェンスが描画されない場所で、書き方と出力を対で読むためのもの。
VS Code のプレビュー (`Ctrl+Shift+V`) ではフェンス自体が図になる。

## circuit — 回路図

部品を番地で置き、配線を `--` で引くと、ネットリストまで出る。
座標計算も分岐の黒丸の手打ちも要らない。

### RC ローパス

[![RC ローパス](../packages/circuit-fence/examples/out/01-rc-lowpass.png)](../packages/circuit-fence/examples/01-rc-lowpass.md)

いちばん小さい例。番地・部品・配線・ネットリストが一通り出てくる
([01-rc-lowpass.md](../packages/circuit-fence/examples/01-rc-lowpass.md))。

### 非反転増幅回路

[![非反転増幅回路](../packages/circuit-fence/examples/out/04-non-inverting-amp.png)](../packages/circuit-fence/examples/04-non-inverting-amp.md)

オペアンプの向き (`+up`) と、足の名前への配線の引き方
([04-non-inverting-amp.md](../packages/circuit-fence/examples/04-non-inverting-amp.md))。

### ロジックゲート

[![ロジックゲート](../packages/circuit-fence/examples/out/11-logic-1.png)](../packages/circuit-fence/examples/11-logic.md)

ゲート記号、DIP の IC、切り替えスイッチ
([11-logic.md](../packages/circuit-fence/examples/11-logic.md))。

### 電流の矢と電圧の符号

[![電流の矢と電圧の符号](../packages/circuit-fence/examples/out/15-arrows-1.png)](../packages/circuit-fence/examples/15-arrows.md)

`i=` と `v=` で、解析の向きを図に書き込む
([15-arrows.md](../packages/circuit-fence/examples/15-arrows.md))。

### そのほか

- [02-parts.md](../packages/circuit-fence/examples/02-parts.md) — 2 端子部品 44 種と 1 端子の記号 4 種
- [08-themes.md](../packages/circuit-fence/examples/08-themes.md) — `auto` / `light` / `dark` / `mono`
- [12-notes.md](../packages/circuit-fence/examples/12-notes.md) — 印・枠・指し棒・字の注釈
- [14-half-step.md](../packages/circuit-fence/examples/14-half-step.md) — 交点の間の番地 (`a_1.5`)
- [errors/](../packages/circuit-fence/examples/errors/) — 読めなかったときに何が出るか

## breadboard — ブレッドボード実体配線図

穴の番地に部品を挿すと、**ボード内部の導通から**ネットリストが出る。
**番号は読む順**で、最小の回路から実験回路まで難しくなる。

### LED と抵抗

[![LED と抵抗](../packages/breadboard-fence/examples/out/01-led.png)](../packages/breadboard-fence/examples/01-led.md)

いちばん小さい例。抵抗 1 本と LED 1 個
([01-led.md](../packages/breadboard-fence/examples/01-led.md))。

### Raspberry Pi Pico

[![Raspberry Pi Pico](../packages/breadboard-fence/examples/out/07-pico.png)](../packages/breadboard-fence/examples/07-pico.md)

マイコンボードを板にまたがせて、LED とボタンをつなぐ
([07-pico.md](../packages/breadboard-fence/examples/07-pico.md))。

### 1 石中波ラジオ

[![1 石中波ラジオ](../packages/breadboard-fence/examples/out/09-am-radio.png)](../packages/breadboard-fence/examples/09-am-radio.md)

板の外の機器 (バーアンテナ・ポリバリコン・イヤホン・電池) を `device` で置き、
図の下に部品リストを出した例
([09-am-radio.md](../packages/breadboard-fence/examples/09-am-radio.md))。

### B-H カーブ測定回路

[![B-H カーブ測定回路](../packages/breadboard-fence/examples/out/10-bh-ad2.png)](../packages/breadboard-fence/examples/10-bh-ad2.md)

オペアンプ・測定器・トロイダルコアを含む実験回路
([10-bh-ad2.md](../packages/breadboard-fence/examples/10-bh-ad2.md))。

### そのほか

- [03-board-variants.md](../packages/breadboard-fence/examples/03-board-variants.md) — 板の印字を手元の実物に寄せる
- [05-capacitors.md](../packages/breadboard-fence/examples/05-capacitors.md) — 部品の姿を選ぶ (`capacitor/ceramic` など)
- [11-sensors.md](../packages/breadboard-fence/examples/11-sensors.md) — CdS・サーミスタ・ダイオードの仲間
- [13-points.md](../packages/breadboard-fence/examples/13-points.md) — 番地に名前を付ける (`points:`)
- [errors/](../packages/breadboard-fence/examples/errors/) — わざと読めなく書いたもの

## perfboard — ユニバーサル基板

**一通り書ける。** 2 本足・3 本足・DIP・SIP の部品、板の外の機器、注釈、
テーマまで ([packages/perfboard-fence](../packages/perfboard-fence/README.ja.md))。

```yaml
board: 14x8
parts:
  R1: resistor b3 b6 1k
  D1: led b9 b11 red
  BAT:
    type: device
    label: 電池 3V
    pins: + -
wires:
  - BAT.+ -- b3
  - b6 -- b9 orange
  - b11 -- BAT.-
```

板の大きさは**列 × 行**で書く (板が「72×47.5mm」と長辺 × 短辺で売られるのと
同じ順)。番地は `b3` の形で、行が 26 を超える板では `aa3` と続く。
部品は 2 つの穴を結ぶ線の上に寝る。抵抗は値が読めればカラーコードを塗り、
LED は書かれた色で光る。配線は 2 つの穴をまっすぐ結ぶ — ブレッドボードの
ような経路探索は要らない (溝もレールも無く、どの穴も同じ格子の上にある)。

**ブレッドボードとの違いは物理そのもの**で、ユニバーサル基板は全穴が独立して
いる。挿しただけでは何もつながらず、ネットリストは書いた配線からだけ出る。
裏を返すと繋ぎ忘れが図の上で沈黙するので、そこは **ERC が見張る** —
どこにもつながっていない足、配線で短絡した部品、部品の足を 1 つもつないで
いない配線を、行番号つきで名指す。

電池やスピーカーのように**盤面に載らないもの**は `device` として板の外の帯に
置き、配線からは `BAT.+` の形で指す。**板の上に線は引かない** — 板に線が出ると、
そこに挿す場所があるように見えてしまう。導通だけがネットリストに効く。

例は [packages/perfboard-fence/examples/](../packages/perfboard-fence/examples/README.md)、
文法は [docs/01-syntax.md](../packages/perfboard-fence/docs/01-syntax.md)。

## なぜ実体をここに置かないか

例はドキュメントではなく、**ビルドとテストの一部**だから。
パッケージの外へ出すと 3 つとも壊れる。

- `examples/out/` はスナップショットテストの**期待値**
  (`src/core/examples.test.ts` がパッケージ相対で読む)
- `npm run examples --workspace=<パッケージ>` はパッケージの中で回る
- README の相対リンクは `vsce` が**パッケージを基準に**絶対 URL へ書き換える
  (Marketplace と拡張ページの図はこれで出ている)

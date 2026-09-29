# Logic Fence

[English](README.md) | [日本語](README.ja.md)

Markdown の ` ```logic ` フェンス (YAML) を **ロジックアナライザの画面** —
レーン・値の見えるバス・時間軸・カーソル・トリガの印・プロトコルの読み下し — として描くライブラリと CLI。
WaveForms (Analog Discovery 3) の Logic を写す。VS Code では拡張 `tommie-fence` の中で動く。

![74HC163 のアドレスが 0 1 2 3 4 5 3 4 5 3 と数えるのを Analog Discovery 3 で見る](examples/out/00-counter.png)

## 何のためか

ロジックアナライザで測る実験のノートには、**測る前に「こう見えるはず」の画面**が要る。
信号をパターンジェネレータの語 (`clock 1Hz`、`pulse 2s 500ms`、`pattern 0110 bit 1ms`) で書き、
レーンをバスに束ね (`Address: A3..A0 hex`)、本文が読む所にカーソルとトリガを置けば、
フェンスがレーンとバスの箱を描き、カーソルの時刻での全行の値を計算する。

```yaml
title: 図1 74HC163 のアドレス — 1 s ごとに 0 1 2 3 4 5 3 4 5 3
device: ad3                   # 必須。レーンの本数と標本化の上限
time: 1s/div                  # 1 目盛。画面は必ず 10 目盛
sample: 1kHz
signals:
  CLK: dio0 clock 1Hz
  A:   dio1..dio4 counter on CLK rising sequence 0 1 2 3 4 5 3 4 5 3   # レーン A0..A3
buses:
  Address: A3..A0 hex         # MSB が先、基数は最後
cursors: [4.5s, 5.5s]         # X1 X2 と、その差
trigger: CLK rising at 0s     # 確かめる。そのレーンにその時刻の edge が無ければ言う
```

- **`device:` は必須** — `ad3` (DIO 16 本・標本化 125 MS/s まで・1 本 32,768 標本) か `generic`。
  機種を越える標本化や窓は、黙って描かずに言う
- **信号**は `clock` `pulse` `pattern` `high` `low` `edges` と `counter` (前のレーンの edge を数えて
  レーンの束を作る)。周波数と時間は単位が要る (素の数は断る)
- **バス**は値を `hex` `bin` `dec` `sint` で箱に書き、変わり目で WaveForms のように切り替わる。
  同時に変わるビットは 1 回の変化
- **カーソル** (X1・X2) は、その時刻の全レーンとバスの値と ΔX・1/ΔX を出す。
  **トリガは、レーンの本当の edge と突き合わせる**
- **変わり目が 3 px より近いレーン**は塗りで描いて言う (線にすると折り返しに見えるだけ)
- **`decode:`** は UART のフレームを読み下す (`uart TXD baud 9600 8N1`)。SPI と I2C はまだ

## 兄弟との違い

| | 描くもの | 元になるもの |
| --- | --- | --- |
| [scope-fence](../scope-fence/) | オシロの画面 (アナログ、時間) | 波 + 操作と、WaveForms の CSV |
| [spectrum-fence](../spectrum-fence/) | スペクトラムの画面 (周波数) | 波と受信機 |
| logic-fence | **ロジックアナライザの画面 (ディジタル、時間)** | **クロック・パターン・カウンタ** |

ネットリスト・ERC・掴んで動かすマップは無い。

## 使い方

文法の全部は [docs/01-syntax.md](docs/01-syntax.md)、1 画面の早見表は
[docs/02-cheatsheet.md](docs/02-cheatsheet.md)、例は [examples/](examples/README.md)。

```bash
npx logic-fence check notes/            # 読めたか・読み値を確かめる (書き出さない)
npx logic-fence render notes/ --out out # SVG を書き出す
node node_modules/logic-fence/dist/cli.cjs check notes/01.md   # tgz に依存するプロジェクトからの同じ呼び方
```

`check` はカーソルの表と、波形の要約 (レーンごとの変わり目の数・バスの値の並び) を字で出す。
**図を見る前に数で突き合わせる**。

npm には無い。Release の tgz を `file:` で指す。
ライブラリの入口は `logic-fence/core` (`renderLogic` / `extractLogicFences`)。

## ライセンス

MIT

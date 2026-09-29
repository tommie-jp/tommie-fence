# logic フェンス 早見表

**1 画面に収めた全形式。** LLM に書かせるときは、これをそのままプロンプトに貼る。
詳しい説明と図は [01-syntax.md](01-syntax.md)。

## かたち

````text
```logic
title: 図01 74HC163 のアドレス   # 任意。図の左上に載る 1 行 (": " を含めない)
device: ad3                      # 必須。ad3 (DIO 16 本・125 MS/s) / generic
time: 1s/div                     # 1 目盛 (/div が要る)。か window: 10s (窓の全部)。目盛は 10 で固定
start: 0s                        # 任意。窓の左端 (既定 0。負ならトリガ前が見える)
sample: 1kHz                     # 任意。書けば機種の上限・バッファ・2 標本を確かめる
signals:                         # 名前: [dioN] 種類 引数…。行の順が図の順
  CLK: dio0 clock 1Hz
  A:   dio1..dio4 counter on CLK rising sequence 0 1 2 3 4 5 3 4 5 3   # レーン A0〜A3 ができる
buses:                           # 名前: レーン… 基数 (MSB が先、基数は最後)
  Address: A3..A0 hex
cursors: [4.5s, 5.5s]            # 任意。X1 X2 (2 つまで)。表に行ごとの値
                                 # decode: (uart) は下の「カーソル・トリガ・読み下し」
trigger: CLK rising at 0s        # 任意。レーン rising|falling [at 時刻]
style: dark                      # 任意
```
````

画面は横 10 目盛 × 60 px。**変わり目が 3 px より近いレーンは線でなく塗り**になる (お知らせが出る)。
`style:` は 1 語 (`light` `dark` `mono`) か並び (`theme` `width` (120〜4000) `stamp` `debug` (`on` / `off`))。
バスは信号の後ろ、読み下しはその後ろに描く。

## 機種

| `device:` | レーン | 標本化 | バッファ |
| --- | --- | --- | --- |
| `ad3` | 16 本 (`dio0`〜`dio15`) | 125 MS/s まで | 1 本 32,768 標本まで |
| `generic` | 32 本まで | 検査しない | 検査しない |

## 信号 (`名前: [dioN] 種類 引数…`)

```yaml
device: generic
time: 500us/div
signals:
  CLK:   dio0 clock 1kHz               # t = 0 で立ち上がる。duty の既定は 50 %
  DUTY:  clock 1kHz duty 25%
  ONE:   pulse 1ms 500us               # 開始 幅
  BITS:  pattern 01101001 bit 500us    # bit の並び + 1 bit の長さ。from 時刻 と repeat も書ける
  DATA:  edges 0s=0 750us=1 2ms=0      # 時刻=値 (増える順)
  HI:    high
  LO:    low
```

| 種類 | 引数 | 注意 |
| --- | --- | --- |
| `clock` | 周波数 [`duty 25%`] | 周波数は単位付き (`1Hz` `10kHz`。素の数は断る) |
| `pulse` | 開始 幅 | 時間は単位付き (`0` だけ単位なし) |
| `pattern` | bit 列 `bit` 長さ [`from` 時刻] [`repeat`] | 始まる前は最初の bit、終わったら最後の bit を保つ |
| `edges` | `時刻=値` を並べる | 各時刻からその値を保つ |
| `high` `low` | なし | 一定 |
| `counter` | 下 | クロックの edge を数える束 |

## カウンタ (`counter`) とバス (`buses:`)

```yaml
device: ad3
time: 1s/div
signals:
  CLK: dio0 clock 1Hz
  Q:   dio1..dio4 counter on CLK rising start 0 wrap 6    # 0 1 2 3 4 5 0 1 …
  S:   counter bits 3 on CLK falling sequence 0 1 2 3 repeat  # 幅は bits 3 でも書ける
buses:
  Count: Q3..Q0 dec         # Q3 Q2 Q1 Q0 dec の略
  Sum:   S2 S1 S0 bin
```

- `dio1..dio4` (小さい番号から) がビット数。レーンは `名前0`〜 (LSB が先頭の DIO)。**元のレーンは前に書く**
- **i 番目の edge の直後の値**が i 番目の値。`start N` `wrap M` (N から数え M で 0 に戻る) か
  `sequence 値…` (10 進か `0x1F`。多い edge は最後の値を保つ。`repeat` で繰り返す)。両方は書けない
- 基数は `hex` (`0x3`) `bin` (`0b0011`) `dec` `sint` (2 の補数)。バスは 16 ビットまで。`A3..A0` は `A3 A2 A1 A0` の略

## カーソル・トリガ・読み下し

```yaml
device: ad3
time: 250us/div
signals:
  CLK: clock 4kHz
  TXD: pattern 10000100101010010110111 bit 104.17us
decode:
  Serial: uart TXD baud 9600 8N1 ascii   # ascii は 'H'、hex は 0x48。窓に全部入るフレームだけ
cursors: [500us, 1.5ms]                  # X1 X2。変わり目ちょうどは新しい値
trigger: CLK falling at 125us            # 書いた edge が本当にあるか確かめる。at 無しは最初の該当 edge
```

- 読み下しは **`uart` だけ** (`spi` `i2c` は「まだ書けません」)。形式は `8N1` (データ 5〜8・パリティ `N` `E` `O`・ストップ 1〜2)
- トリガに指せるのは 1 ビットのレーン。`data:` (CSV を重ねる) はまだ無い

## 読み値 (CLI の `check`)

カーソルの表 (`信号 / X1 / X2`、2 つなら `ΔX` と `1/ΔX`) の後に、**レーンの変わり目の数**、
**バスの値と始まりの時刻の並び** (`Address (hex): 0x0@0 s 0x1@1 s …`)、読み下しのフレームが出る。
本文の表と数で突き合わせてから、図を見る。

## 言われること (お知らせは図を描いた上で言う)

| 言われること | 直し方 |
| --- | --- |
| device: は ad3 / generic のどれかを書きます | `device:` を書く |
| 時間軸を書きます | `time: 1s/div` か `window: 10s` (両方は断る) |
| 単位の無い数 | `1Hz` `500ms` `1kHz` |
| 知らない種類です | `clock pulse pattern high low edges counter` |
| counter の元のレーンがありません | 元を**前に**書く |
| バスの最後に基数を書きます | `hex` `bin` `dec` `sint` |
| (お知らせ) 変わり目が 3 px より近く…塗りで描きました | `time:` を細かく |
| (お知らせ) 標本化は N までです / バッファに入りません | `sample:` |
| (お知らせ) 立ち上がりは 0.3 s にありません | `trigger:` の `at` を edge に合わせる |
| (お知らせ) カーソル・トリガの時刻が窓の外です | 時刻を窓の中に |

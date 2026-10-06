# 触ってみる

[English](try-me.md) | [日本語](try-me.ja.md)

フェンスを 9 つ、パッケージごとに 1 つずつ置いてあります。
**Markdown プレビューを開くと図になります**: `Ctrl+Shift+V`
(macOS は `Cmd+Shift+V`)、またはこのタブの右上にある分割プレビューのボタン。

フェンスを書き換えると図が付いてきます。わざと壊す (部品の種類を綴り間違える、
無い穴へ配線を引く) と、図の代わりに行番号と行の中身と、綴りを指す印が出ます。

## breadboard — LED と抵抗

```bread
title: LED と抵抗
board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
  - c13 -- -t13 black
notes:
  - source blue
```

`a5` `b12` は穴番地 (行 a〜j + 列番号)。`+t5` は上側の電源レール。
同じ列は基板の中でつながっているので、抵抗と LED の間は `a10 -- b12` の 1 本で済みます。

## perfboard — 同じ回路を、穴ごとに

```perf
board: 16x8
title: LED と抵抗
points:
  VCC: a1
  GND: f1
parts:
  R1: resistor c3 c7 330
  D1: led c9 c11 red
wires:
  - VCC -- a3
  - a3 -- c3
  - c7 -- c9
  - c11 -- f11
  - f11 -- GND
notes:
  - source blue
```

こちらは全部の穴が独立しているので、配線を引くまで何もつながりません。
上のブレッドボードとの違いはそこだけです。

## circuit — 回路図

```circuit
title: RC ローパス
parts:
  IN:  port 1,1
  R1:  resistor 1,1 2,1 10k
  C1:  capacitor 2,1 2,2 100n
  OUT: port 3,1
  G1:  ground 2,2
wires:
  - 2,1 -- 3,1
notes:
  - source 4,1 blue
style:
  grid: on
```

部品を番地に置き、配線を `--` で引きます。ネットリストは図から導けるので、
`IN` `OUT` `GND` は書かなくても出てきます。

## copper — 銅張り基板を切って作る治具

```copper
board: 40x20mm
title: 50Ω のスルー線路
f: 2.4G
copper:
  L1: line 0,10 40,10 3.06mm
parts:
  J1: sma left 10 CH0
  J2: sma right 10 CH1
  C1: capacitor/1608 20,10 10p
```

位置は基板の左上からの mm です。線路の字に幅・**Z0**・電気長が出ます。
線路の上に置いたチップは**線路を切ります**。

## vna — その治具を測った NanoVNA の画面

```vna
device: h4
sweep: 1M-300M 101
title: 100 Ω を直列に
dut: series R 100
traces:
  - S21 logmag
  - S11 logmag
  - S11 smith
markers:
  - 10M
```

`dut:` は理想の模型で、破線で出ます (どちらも −6.02 dB、Smith では 150 Ω)。
測った値を Touchstone でこのファイルの隣に保存し、`data: <ファイル>.s2p` を
書き足すと実線で重なります。このフェンスにはマップがありません。

## scope — 上の RC ローパスに方形波を入れたオシロの画面

```scope
title: RC の充電 (τ = 1 ms)
time: 1ms/div
trigger: ch1 rising 1V
ch1: square 100Hz 1V offset 1V
ch2: ch1 | rc 1ms
cursors: [0, 1ms]
measure: [vpp, freq]
```

10 kΩ と 100 nF で τ = 1 ms。`ch1` は波形発生器の波 (振幅は peak なので 0〜2 V)、
`ch2: ch1 | rc 1ms` はそれを RC に通した波です。画面の下の読み値で X2 は 1.27 V
(63 % まで上がった所)。WaveForms の Scope を CSV で書き出してこのファイルの隣に置き、
`data: <ファイル>.csv` を書き足すと実線で重なります。このフェンスにはマップがありません。

## spectrum — NanoVNA の出力を tinySA Ultra で見る

```spectrum
title: 100 MHz の方形波の高調波
device: tinysa-ultra
sweep: 0-960M 450
rbw: 300kHz
ref: 0dBm
signal: square 100MHz -10dBm
markers: [100M, 300M, 500M]
```

`device:` は必須です (`ad2` / `ad3` は Analog Discovery の FFT、tinySA は掃引型の受信機)。
`-10dBm` は同じ peak の正弦の電力なので、方形波の基本波は −7.90 dBm に立ち、
奇数次の高調波が 1/n で並びます。このフェンスにはマップがありません。

## graph — ボード線図

```graph
title: RC ローパス — −3 dB の所が −45°
x: 周波数 Hz log 100..100k
y:
  - 利得 dB
  - 位相 deg
lines:
  利得 dB: 20*log10(1/sqrt(1+(x/1.59k)^2))
  位相 deg: -deg(atan(x/1.59k))
notes:
  - level -3dB
  - mark 1.59k
```

計器の画面ではなく教科書のグラフです。線のキーの最後の語が単位で、単位の違う線は横軸を共有して
縦に積んだ枠に分かれます。図の下の読み値は 1.59 kHz で −3.01 dB・−45.0° です。
このフェンスにはマップがありません。

## logic — 74HC163 のアドレス

```logic
title: 74HC163 のアドレス — 1 s ごとに 0 1 2 3 4 5 3 4 5 3
device: ad3
time: 1s/div
signals:
  CLK: dio0 clock 1Hz
  A:   dio1..dio4 counter on CLK rising sequence 0 1 2 3 4 5 3 4 5 3
buses:
  Address: A3..A0 hex
cursors: [4.5s, 5.5s]
trigger: CLK rising at 0s
```

ロジックアナライザの画面です。レーンは 0 / 1 で、`counter` は前のレーンの edge を数え、
バスは書いた基数で値を箱に書きます。図の下の表がカーソルの時刻の全行の値を読みます
(`0x4` と `0x5`)。トリガは書いた edge が本当にあるかを確かめます。このフェンスにはマップがありません。

## 打たずに掴んで動かす

どのフェンスもマウスで編集できます。このタブの右上の基板の絵の釦を押すと
(コマンドパレット `Ctrl+Shift+P` の **「tommie-fence: 図を掴んで動かす
(Fence Editor)」** でも同じ。英語の画面では「Open the Fence Editor」)、
カーソルのあるフェンスのマップが横に開きます。
または `Ctrl+Shift+P` →**「View: Reopen Editor With...」**→
**Fence Editor** で、このタブ自体をマップにできます。基板と回路図の 4 つのフェンスを
1 つのエディタで扱います (vna・scope・spectrum・graph・logic にはマップがありません)。

マップは図ではなく**掴むための層**です。部品を動かすとフェンスの番地が
書き換わるので、正はいつもテキストのままです。

## 次に読むもの

- [examples/](README.ja.md) — フェンスと、それが描く図を並べた索引
- [circuit の文法](../packages/circuit-fence/docs/01-syntax.md) ·
  [breadboard の文法](../packages/breadboard-fence/docs/01-syntax.md) ·
  [perfboard の文法](../packages/perfboard-fence/docs/01-syntax.md) ·
  [copper の文法](../packages/copper-fence/docs/01-syntax.md) ·
  [vna の文法](../packages/vna-fence/docs/01-syntax.md) ·
  [scope の文法](../packages/scope-fence/docs/01-syntax.md) ·
  [spectrum の文法](../packages/spectrum-fence/docs/01-syntax.md) ·
  [graph の文法](../packages/graph-fence/docs/01-syntax.md) ·
  [logic の文法](../packages/logic-fence/docs/01-syntax.md)

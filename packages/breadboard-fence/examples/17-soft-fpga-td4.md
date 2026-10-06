# Soft-FPGA TD4 (Pico 2 + DIP スイッチ + LED)

GitHub の [Soft-FPGA-TD4](https://github.com/tommie-jp/Soft-FPGA-TD4) (Verilog で書いた 4 ビット CPU
TD4 を Pico 2 の中で動かす) のブレッドボードを、このフェンスで描いたもの。
**入力は DIP スイッチ (8 連のうち 4 つ)、出力は LED 4 つ。** FPGA は要らない。

- IN_PORT: GP14〜GP17 ← DIP スイッチの 1〜4 番。反対のピンは GND。
  **プルアップ抵抗は要らない** (Pico 2 の内蔵プルアップを使う。スイッチを ON にすると 0)
- OUT_PORT: GP4〜GP7 → 330Ω → LED → GND

```bread
title: 図01 Soft-FPGA TD4 の配線
board: full
parts:
  MCU: pico2 @ h5
  R1: resistor j28 j32 330
  D1: led j34(A) j36(K) red
  R2: resistor j40 j44 330
  D2: led j46(A) j48(K) red
  R3: resistor a28 a32 330
  D3: led a34(A) a36(K) red
  R4: resistor a40 a44 330
  D4: led a46(A) a48(K) red
  SW1: dip-switch8 @ e52
wires:
  # 電源は USB から。GND を下のレールへ
  - j7 -- -b7 black
  - -t7 -- -b8 black
  # OUT_PORT: GP4 GP5 GP6 GP7 → 抵抗 → LED → GND
  - j10 -- i28 yellow
  - j11 -- i40 yellow
  - j13 -- b28 yellow
  - j14 -- b40 yellow
  - i32 -- i34 yellow
  - i44 -- i46 yellow
  - b32 -- b34 yellow
  - b44 -- b46 yellow
  - i36 -- -b36 black
  - i48 -- -b48 black
  - b36 -- -t36 black
  - b48 -- -t48 black
  # IN_PORT: GP14 GP15 GP16 GP17 ← DIP スイッチ 1〜4 番、反対のピンは GND
  - j23 -- a52 blue
  - j24 -- a53 blue
  - a24 -- a54 blue
  - a23 -- a55 blue
  - i52 -- -b52 black
  - i53 -- -b53 black
  - i54 -- -b54 black
  - i55 -- -b55 black
```

![図01 Soft-FPGA TD4 の配線](out/17-soft-fpga-td4.svg)

- `dip-switch8 @ e52` は溝をまたぐ 16 ピンの DIP。**k 番のスイッチは同じ列の `e` と `f` の間の接点**
  (`B1`〜`B4` が `e52`〜`e55`、`A1`〜`A4` が `f52`〜`f55`)。使わない 5〜8 番はそのまま空けておく
- 図の上でスイッチの ON / OFF は決まらない (接点は開いたまま。実物は ON の向きが品ごとに違う)

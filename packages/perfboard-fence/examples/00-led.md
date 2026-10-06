# LED と抵抗

いちばん小さな回路。電源から抵抗を通して LED を光らせる。
**同じ回路を circuit / breadboard でも描いてある** (どれも「図01 LED と抵抗」)。
電源は 5 V (USB 充電器など) で、基板の外の機器として描く。330 Ω なら LED に約 9 mA 流れる。

先に回路図を見てから、基板に落とす。

```circuit
title: 回路図01 LED と抵抗
parts:
  V1: vsource 1,1 1,3 5
  R1: resistor 1,1 3,1 330
  D1: led 3,1 3,3 red
  G1: ground 1,3
wires:
  - 1,3 -- 3,3
```

<img src="out/schematic/00-led.png" alt="回路図01 LED と抵抗" width="299">


```perf
board:
  size: 12x6
  h: 1.6mm
  material: FR-4
  slots: on
title: 図01 LED と抵抗
parts:
  R1: resistor c3 c7 330
  D1: led c9 c11 red
  V1:
    type: device
    at: -c3
    label: 電源 5V
    pins: + -
wires:
  - V1.+ -- a3 red
  - a3 -- c3 red
  - c7 -- c9
  - V1.- -- a4 black
  - a4 -- a11 black
  - a11 -- c11 black
```

![図01 LED と抵抗](out/00-led.svg)

読み方:

- `c3` `c7` は穴番地 (行 A〜F + 列番号)。**基板は穴が 1 つずつ独立している**
  ので、ブレッドボードと違って隣の穴とはつながらない。つなぐ線は全部書く。
- `resistor c3 c7 330` の `330` はカラーコード (橙橙茶) になって帯に出る。
- 電源は基板の外の機器 (`type: device`)。`at: -c3` の `-` は基板の外を指す。

| ネット | つながっている端子 |
| --- | --- |
| N1 | R1.1, V1.+ |
| N2 | R1.2, D1.1 |
| N3 | D1.2, V1.- |

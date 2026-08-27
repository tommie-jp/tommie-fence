# ID と値の出方

ID は先頭 1 文字が本体、残りが添字になる (回路図の慣習どおり)。
`R1` は R の添字 1、`Rload` は R の添字 load、`R` はそのまま。

値は種類から単位を補う。数字と SI 接頭辞 (`k` `M` `G` `m` `u` `n` `p`) の
組でないときは、書いたとおりに出る。単位を勝手に足さない。

```circuit
title: 図01 ID と値の出方
parts:
  R1:    resistor a2 a3 10k
  Rload: resistor a4 a5 4.7
  R:     resistor a6 a7 1M
  L1:    inductor c2 c3 10m
  C1:    capacitor c4 c5 2.2u
  D1:    diode c6 c7 1N4148
notes:
  - text b2 blue center: "R1: resistor a2 a3 10k"
  - text b4 blue center: "Rload: resistor a4 a5 4.7"
  - text b6 blue center: "R: resistor a6 a7 1M"
  - text d2 blue center: "L1: inductor c2 c3 10m"
  - text d4 blue center: "C1: capacitor c4 c5 2.2u"
  - text d6 blue center: "D1: diode c6 c7 1N4148"
  - source a8 blue large
style:
  grid: on
```

| 書いたもの | 図に出るもの |
| --- | --- |
| `R1: resistor … 10k` | R₁ / 10 kΩ |
| `Rload: resistor … 4.7` | R_load / 4.7 Ω |
| `R: resistor … 1M` | R / 1 MΩ |
| `L1: inductor … 10m` | L₁ / 10 mH |
| `C1: capacitor … 2.2u` | C₁ / 2.2 uF |
| `D1: diode … 1N4148` | D₁ / 1N4148 (そのまま) |

ID は記号の下 (縦置きなら左)、値は反対側に出る。

値に使えるのは英数字と `. + - / ( ) _ %` だけ。`,` と `=` は circuitikz が
オプションの区切りとして読んでしまうので使えない (小数点は `.` で書く)。
日本語は**フェンスの TeX にフォントが無い**ので描けない。

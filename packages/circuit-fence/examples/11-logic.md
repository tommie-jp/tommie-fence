# ロジックゲートと IC

ロジックゲートは 1 つの番地に置き、足を名前で指す。入力は `a` `b`、
出力は `out`。入力は番号でも呼べる (`U1.1` `U1.2`)。

```circuit
parts:
  U1: and b2 7408
  U2: or b6 7432
  U3: nand b10 7400
  U4: nor b14 7402
  U5: xor e2 7486
  U6: xnor e6 74266
  U7: not e10 7404
  U8: buffer e14 7407
wires:
  - a1 |- U1.a
  - c1 |- U1.b
  - U1.out -| b4
  - a5 |- U2.a
  - c5 |- U2.b
  - U2.out -| b8
  - a9 |- U3.a
  - c9 |- U3.b
  - U3.out -| b12
  - a13 |- U4.a
  - c13 |- U4.b
  - U4.out -| b16
  - d1 |- U5.a
  - f1 |- U5.b
  - U5.out -| e4
  - d5 |- U6.a
  - f5 |- U6.b
  - U6.out -| e8
  - d9 |- U7.in
  - U7.out -| e12
  - d13 |- U8.in
  - U8.out -| e16
style:
  grid: on
```

上の段が `and` / `or` / `nand` / `nor`、下の段が `xor` / `xnor` / `not` /
`buffer`。`not` と `buffer` は入力が 1 本なので、足の名前は `in` と `out`。
番地の後ろに書いた型番は記号の下に出る。

## DIP の IC

`dip8` `dip14` `dip16` `dip20` `dip28` `dip40` があり、足は**番号で指す**
(`U1.1`)。型番は記号の**中**に出る。

```circuit
parts:
  U1: dip8 c2 NE555
wires:
  - a1 |- U1.1
  - e1 |- U1.4
  - U1.5 -| e4
  - U1.8 -| a4
style:
  grid: on
```

足の番号は DIP の実物と同じで、左上が 1、左を下りて、右下から上がって戻る
(8 ピンなら左が 1〜4、右が 5〜8)。

## 切り替えスイッチ

`spdt` は共通が `in`、行き先が `1` と `2`。

```circuit
parts:
  S1: spdt b2
wires:
  - b1 |- S1.in
  - S1.1 -| a4
  - S1.2 -| c4
style:
  grid: on
```

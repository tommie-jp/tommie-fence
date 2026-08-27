# ロジックゲートと IC

ロジックゲートは 1 つの番地に置き、足を名前で指す。入力は `a` `b`、
出力は `out`。入力は番号でも呼べる (`U1.1` `U1.2`)。

```circuit
title: 図06 ロジックゲート
parts:
  U1: and b2 7408
  U2: or b5 7432
  U3: nand b8 7400
  U4: nor b11 7402
  U5: xor e2 7486
  U6: xnor e5 74266
  U7: not e8 7404
  U8: buffer e11 7407
wires:
  - a1 |- U1.a
  - c1 |- U1.b
  - U1.out -| b3
  - a4 |- U2.a
  - c4 |- U2.b
  - U2.out -| b6
  - a7 |- U3.a
  - c7 |- U3.b
  - U3.out -| b9
  - a10 |- U4.a
  - c10 |- U4.b
  - U4.out -| b12
  - d1 |- U5.a
  - f1 |- U5.b
  - U5.out -| e3
  - d4 |- U6.a
  - f4 |- U6.b
  - U6.out -| e6
  - d7 |- U7.in
  - U7.out -| e9
  - d10 |- U8.in
  - U8.out -| e12
notes:
  - text c2 blue large center: "U1: and b2 7408"
  - text c5 blue large center: "U2: or b5 7432"
  - text c8 blue large center: "U3: nand b8 7400"
  - text c11 blue large center: "U4: nor b11 7402"
  - text f2 blue large center: "U5: xor e2 7486"
  - text f5 blue large center: "U6: xnor e5 74266"
  - text f8 blue large center: "U7: not e8 7404"
  - text f11 blue large center: "U8: buffer e11 7407"
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
title: 図07 DIP の IC
parts:
  U1: dip8 c2 NE555
wires:
  - a1 |- U1.1
  - e1 |- U1.4
  - U1.5 -| e4
  - U1.8 -| a4
notes:
  - text f1 blue large: "U1: dip8 c2 NE555"
style:
  grid: on
  pitch: 1
```

足の番号は DIP の実物と同じで、左上が 1、左を下りて、右下から上がって戻る
(8 ピンなら左が 1〜4、右が 5〜8)。

## 切り替えスイッチ

`spdt` は共通が `in`、行き先が `1` と `2`。

```circuit
title: 切り替えスイッチ
parts:
  S1: spdt b2
wires:
  - b1 |- S1.in
  - S1.1 -| a4
  - S1.2 -| c4
notes:
  - text d1 blue large: "S1: spdt b2"
style:
  grid: on
```

# 線路の形

線路は**縦横の区間の折れ線**。点を並べて書き、最後に幅を書く。触れ合う線路は
1 つの島 (ネット) になる。

```copper
board: 40x25mm
title: 図01 折れ線とスタブ
f: 2.4G
copper:
  L1: line 0,15 12,15 12,6 28,6 28,15 40,15 3.06
  S1: line 20,6 20,20 3.06
parts:
  J1: sma left 15
  J2: sma right 15
```

![図01 折れ線とスタブ](out/02-lines-1.svg)

等価回路 (スタブの等価回路) — 線路は伝送線路 (`tline`、値は Z0)、SMA の外皮は地。

```circuit
title: 回路図01 スタブの等価回路
parts:
  J1: sma b2 mirror
  T1: tline b4 b7 50 l=$\mathrm{L1}$
  T2: tline b9 b12 50 l=$\mathrm{L1}$
  S1: tline d8 g8 50 l=$\mathrm{S1}$
  J2: sma b14
  G1: ground c2
  G2: ground c14
wires:
  - J1.1 -- b4
  - b7 -- b9
  - b8 -- d8
  - b12 -- J2.1
  - J1.2 -- c2
  - J2.2 -- c14
notes:
  - text g9: 開放
```

![回路図01 スタブの等価回路](out/schematic/02-lines-1.png)

L1 はスタブの付け根で 2 本に分かれて見える。S1 は先が開いた線路で、λ/4 になる周波数で付け根を短絡に見せる (ノッチ)。

S1 は L1 に T 字に触れているので同じ島。先が開いたスタブ (本の 6-16 のノッチ)。

**幅を変えるときは線路を分ける。** 触れ合っていれば 1 つの島で、字はそれぞれの
幅の Z0 を出す — 本の 6-14 のステップインピーダンス LPF。

```copper
board: 50x20mm
title: 図02 ステップインピーダンス LPF (1GHz)
f: 1G
copper:
  L1: line 0,10 8,10 3.06
  L2: line 8,10 16,10 0.5
  L3: line 16,10 24,10 8
  L4: line 24,10 32,10 0.5
  L5: line 32,10 40,10 8
  L6: line 40,10 42,10 0.5
  L7: line 42,10 50,10 3.06
parts:
  J1: sma left 10
  J2: sma right 10
```

![図02 ステップインピーダンス LPF (1GHz)](out/02-lines-2.svg)

等価回路 (ステップインピーダンス LPF の等価回路) — 線路は伝送線路 (`tline`、値は Z0)、SMA の外皮は地。

```circuit
title: 回路図02 ステップインピーダンス LPF の等価回路
parts:
  J1: sma b2 mirror
  T1: tline b3 b5 50 l=$\mathrm{L1}$
  T2: tline b5 b7 112 l=$\mathrm{L2}$
  T3: tline b7 b9 26 l=$\mathrm{L3}$
  T4: tline b9 b11 112 l=$\mathrm{L4}$
  T5: tline b11 b13 26 l=$\mathrm{L5}$
  T6: tline b13 b15 112 l=$\mathrm{L6}$
  T7: tline b15 b17 50 l=$\mathrm{L7}$
  J2: sma b18
  G1: ground c2
  G2: ground c18
wires:
  - J1.1 -- b3
  - b17 -- J2.1
  - J1.2 -- c2
  - J2.2 -- c18
```

![回路図02 ステップインピーダンス LPF の等価回路](out/schematic/02-lines-2.png)

細い線路 (112Ω) は直列のコイル、太い線路 (26Ω) は地へのコンデンサとして働き、LC のはしご型 LPF になる。

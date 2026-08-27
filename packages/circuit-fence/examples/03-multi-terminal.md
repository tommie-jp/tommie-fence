# 多端子の記号

トランジスタ・MOSFET・オペアンプ・トランスは **1 つの番地に置く**。
足は番地ではなく名前で指す (`Q1.B` `M1.gate` `U1.out` `T1.A1`)。

```circuit
parts:
  Q1: npn b2
  Q2: pnp b5
  Q3: nigbt b8
  M1: nmos f2
  M2: pmos f5
  Q4: pigbt f8
wires:
  - a2 -| Q1.C
  - c2 -| Q1.E
  - b1 -| Q1.B
  - a5 -| Q2.C
  - c5 -| Q2.E
  - b4 -| Q2.B
  - a8 -| Q3.C
  - c8 -| Q3.E
  - b7 -| Q3.G
  - e2 -| M1.D
  - g2 -| M1.S
  - f1 -| M1.G
  - e5 -| M2.D
  - g5 -| M2.S
  - f4 -| M2.G
  - e8 -| Q4.C
  - g8 -| Q4.E
  - f7 -| Q4.G
notes:
  - text d2 blue large: "Q1: npn b2"
  - text d5 blue large: "Q2: pnp b5"
  - text d8 blue large: "Q3: nigbt b8"
  - text h2 blue large: "M1: nmos f2"
  - text h5 blue large: "M2: pmos f5"
  - text h8 blue large: "Q4: pigbt f8"
style:
  grid: on
  pitch: 1.2
```

上の段がバイポーラと IGBT、下の段が MOSFET。**記号の下の青い行が、
その記号を出すために書いた 1 行**そのもの。
足の名前は回路図の慣習の 1 文字でも、綴りでも同じところを指す
(`Q1.B` と `Q1.base` は同じ足)。

| 種類 | 足 |
| --- | --- |
| `npn` / `pnp` | `B` `C` `E` (`base` `collector` `emitter`) |
| `nigbt` / `pigbt` | `G` `C` `E` (IGBT の制御端子はゲート) |
| `nmos` / `pmos` | `G` `D` `S` (`gate` `drain` `source`) |
| `njfet` / `pjfet` | 同上 |
| `nmos-e` / `pmos-e` / `nmos-d` / `pmos-d` | 同上 |
| `opamp` | `+` `-` `out` |
| `transformer` | `A1` `A2` (1 次) / `B1` `B2` (2 次) |

番地の後ろに型番を書くと、記号の下に出る。トランスは 1 次側が `A`、
2 次側が `B`。

```circuit
parts:
  U1: opamp b2 LM358
  T1: transformer b7 1to1
wires:
  - a1 -| U1.+
  - c1 -| U1.-
  - U1.out -| b4
  - a6 -| T1.A1
  - c6 -| T1.A2
  - a9 -| T1.B1
  - c9 -| T1.B2
notes:
  - text d1 blue large: "U1: opamp b2 LM358"
  - text d6 blue large: "T1: transformer b7 1to1"
style:
  grid: on
  pitch: 1.2
```

**足へは `-|` か `|-` で引く**。足は記号ごとに決まった位置にあって格子の上に
無いので、`--` (まっすぐ) で番地とつなぐと斜めの線になる。

## FET の種類

`nmos` / `pmos` はチャネルを 1 本で描いた**簡易記号**。記事でよく使うのは
こちらだが、接合型 (JFET) と、エンハンスメント型 / デプレッション型を
書き分けたいときは次の名前で書く。**足の名前はどれも同じ**。

```circuit
parts:
  J1: njfet b2
  J2: pjfet b5
  M1: nmos-e f2
  M2: pmos-e f5
  M3: nmos-d j2
  M4: pmos-d j5
wires:
  - a2 -| J1.D
  - c2 -| J1.S
  - b1 -| J1.G
  - a5 -| J2.D
  - c5 -| J2.S
  - b4 -| J2.G
  - e2 -| M1.D
  - g2 -| M1.S
  - f1 -| M1.G
  - e5 -| M2.D
  - g5 -| M2.S
  - f4 -| M2.G
  - i2 -| M3.D
  - k2 -| M3.S
  - j1 -| M3.G
  - i5 -| M4.D
  - k5 -| M4.S
  - j4 -| M4.G
notes:
  - text d2 blue large: "J1: njfet b2"
  - text d5 blue large: "J2: pjfet b5"
  - text h2 blue large: "M1: nmos-e f2"
  - text h5 blue large: "M2: pmos-e f5"
  - text l2 blue large: "M3: nmos-d j2"
  - text l5 blue large: "M4: pmos-d j5"
style:
  grid: on
  pitch: 1.2
```

左が N チャネル、右が P チャネル。上から接合型 (`njfet` / `pjfet`)、
エンハンスメント型 (`nmos-e` / `pmos-e`)、デプレッション型
(`nmos-d` / `pmos-d`)。エンハンスメント型はチャネルが切れて、
デプレッション型はつながって描かれる。

## 2 端子でも足を持つもの

ポテンショメータのワイパーとサイリスタ・トライアックのゲートは、
**両端を番地で置いたうえで 3 本目を名前で指す**。書き方は 2 端子部品と同じで、
足だけ `P1.w` `T1.g` のように呼ぶ。

```circuit
parts:
  P1: potentiometer b1 b5 10k
  T1: thyristor e1 e5
  T2: triac h1 h5
wires:
  - P1.w -- a3
  - T1.g |- d3
  - T2.g |- g3
notes:
  - text c1 blue large: "P1: potentiometer b1 b5 10k"
  - text f1 blue large: "T1: thyristor e1 e5"
  - text i1 blue large: "T2: triac h1 h5"
style:
  grid: on
```

| 種類 | 足 |
| --- | --- |
| `potentiometer` | `w` (`wiper`) |
| `thyristor` / `triac` | `g` (`gate`) |

ワイパーは記号の**真上**に出るので、そのまま `--` で上の番地へ引ける。
ゲートは横にずれた位置にあるので、ほかの足と同じく `|-` で直角に入れる。

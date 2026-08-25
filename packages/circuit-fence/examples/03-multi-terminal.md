# 多端子の記号

トランジスタ・MOSFET・オペアンプ・トランスは **1 つの番地に置く**。
足は番地ではなく名前で指す (`Q1.B` `M1.gate` `U1.out` `T1.A1`)。

```circuit
parts:
  Q1: npn b2
  Q2: pnp b5
  M1: nmos e2
  M2: pmos e5
wires:
  - a2 -| Q1.C
  - c2 -| Q1.E
  - b1 -| Q1.B
  - a5 -| Q2.C
  - c5 -| Q2.E
  - b4 -| Q2.B
  - d2 -| M1.D
  - f2 -| M1.S
  - e1 -| M1.G
  - d5 -| M2.D
  - f5 -| M2.S
  - e4 -| M2.G
style:
  grid: on
```

左上から `npn` (`b2`) / `pnp` (`b5`) / `nmos` (`e2`) / `pmos` (`e5`)。
足の名前は回路図の慣習の 1 文字でも、綴りでも同じところを指す
(`Q1.B` と `Q1.base` は同じ足)。

| 種類 | 足 |
| --- | --- |
| `npn` / `pnp` | `B` `C` `E` (`base` `collector` `emitter`) |
| `nmos` / `pmos` | `G` `D` `S` (`gate` `drain` `source`) |
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
style:
  grid: on
```

**足へは `-|` か `|-` で引く**。足は記号ごとに決まった位置にあって格子の上に
無いので、`--` (まっすぐ) で番地とつなぐと斜めの線になる。

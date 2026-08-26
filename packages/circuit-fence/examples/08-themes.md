# テーマ

`style: theme` で明暗を選ぶ。**テーマを変えても図は描き直さない**
(描き上がった SVG の色を差し替えるだけ)。

`auto` が既定。エディタの文字色をそのまま使うので、明るいテーマでも
暗いテーマでも読める。1 枚描いた図をどちらでも使い回せる。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  theme: auto
  grid: on
```

`light` / `dark` は明暗を決め打ちする。ノートの見た目を固定したいとき。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  theme: light
  grid: on
```

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  theme: dark
  grid: on
```

`mono` は黒一色。資料に貼るときや印刷するとき。

```circuit
parts:
  IN:  port a1
  R1:  resistor a1 a3 10k
  C1:  capacitor a3 c3 100n
  OUT: port a4
  G1:  ground c3
wires:
  - a3 -- a4
style:
  theme: mono
  grid: on
```

テーマだけ選ぶなら `style: dark` の 1 行でよい。細かく指定するときは
マップで書く ([09-style.md](09-style.md))。

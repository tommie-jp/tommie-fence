# 触ってみる

[English](try-me.md) | [日本語](try-me.ja.md)

フェンスを 3 つ、パッケージごとに 1 つずつ置いてあります。
**Markdown プレビューを開くと図になります**: `Ctrl+Shift+V`
(macOS は `Cmd+Shift+V`)、またはこのタブの右上にある分割プレビューのボタン。

フェンスを書き換えると図が付いてきます。わざと壊す (部品の種類を綴り間違える、
無い穴へ配線を引く) と、図の代わりに行番号と行の中身と、綴りを指す印が出ます。

## breadboard — LED と抵抗

```breadboard
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
同じ列は板の中でつながっているので、抵抗と LED の間は `a10 -- b12` の 1 本で済みます。

## perfboard — 同じ回路を、穴ごとに

```perfboard
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
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
notes:
  - source a4 blue
style:
  grid: on
```

部品を番地に置き、配線を `--` で引きます。ネットリストは図から導けるので、
`IN` `OUT` `GND` は書かなくても出てきます。

## 打たずに掴んで動かす

どのフェンスもマウスで編集できます。フェンスの中にカーソルを置いて、
コマンドパレット (`Ctrl+Shift+P`) から
**「Breadboard Fence: 図を掴んで動かす (マップ)」**。
または `Ctrl+Shift+P` →**「View: Reopen Editor With...」**→
**breadboard Editor** で、このタブ自体をマップにできます。

マップは図ではなく**掴むための層**です。部品を動かすとフェンスの番地が
書き換わるので、正はいつもテキストのままです。

## 次に読むもの

- [examples/](README.ja.md) — フェンスと、それが描く図を並べた索引
- [circuit の文法](../packages/circuit-fence/docs/01-syntax.md) ·
  [breadboard の文法](../packages/breadboard-fence/docs/01-syntax.md) ·
  [perfboard の文法](../packages/perfboard-fence/docs/01-syntax.md)

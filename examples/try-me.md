# Try me

[English](try-me.md) | [日本語](try-me.ja.md)

Three fences, one per package. **Open the Markdown preview to see them drawn**:
`Ctrl+Shift+V` (`Cmd+Shift+V` on macOS), or the split-preview button at the top
right of this tab.

Edit any fence and the drawing follows. Break one on purpose — misspell a part
type, or point a wire at a hole that is not there — and the drawing is replaced
by the line number, the line itself, and a caret under the spelling at fault.

## breadboard — an LED and a resistor

```breadboard
title: An LED and a resistor
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

`a5` and `b12` are hole addresses (row `a`–`j`, column number). `+t5` is the top
power rail. Columns are joined inside the board, so `a10 -- b12` is the only wire
needed between the resistor and the LED.

## perfboard — the same circuit, hole by hole

```perfboard
board: 16x8
title: An LED and a resistor
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

Every hole is independent here, so nothing is connected until a wire says so.
That is the whole difference from the breadboard above.

## circuit — a schematic

```circuit
title: RC low-pass
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

Parts sit at grid addresses and wires are drawn with `--`. The netlist is
derived, so `IN`, `OUT` and `GND` come out without being written down.

## Drag the parts instead of typing

Every fence can also be edited with the mouse. Put the cursor inside one and run
**"Breadboard Fence: 図を掴んで動かす (マップ)"** from the command palette
(`Ctrl+Shift+P`), or reopen this file with the map editor: `Ctrl+Shift+P` →
**"View: Reopen Editor With..."** → **breadboard Editor**.

The map is a grab layer, not the drawing. Dragging a part rewrites the address
in the fence, so the text stays the source of truth.

## Where to go next

- [examples/](README.md) — every fence next to the drawing it produces
- [circuit syntax](../packages/circuit-fence/docs/01-syntax.md) ·
  [breadboard syntax](../packages/breadboard-fence/docs/01-syntax.md) ·
  [perfboard syntax](../packages/perfboard-fence/docs/01-syntax.md)

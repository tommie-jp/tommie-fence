# Try me

[English](try-me.md) | [日本語](try-me.ja.md)

Eight fences, one per package. **Open the Markdown preview to see them drawn**:
`Ctrl+Shift+V` (`Cmd+Shift+V` on macOS), or the split-preview button at the top
right of this tab.

Edit any fence and the drawing follows. Break one on purpose — misspell a part
type, or point a wire at a hole that is not there — and the drawing is replaced
by the line number, the line itself, and a caret under the spelling at fault.

## breadboard — an LED and a resistor

```bread
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

```perf
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

## copper — the same kind of fixture, cut from a copper-clad board

```copper
board: 40x20mm
title: A 50-ohm through line
f: 2.4G
copper:
  L1: line 0,10 40,10 3.06mm
parts:
  J1: sma left 10 CH0
  J2: sma right 10 CH1
  C1: capacitor/1608 20,10 10p
```

Positions are millimetres from the top-left corner. The caption of the line gives
its width, **Z0** and electrical length; the chip placed on the line **cuts it**.

## vna — the NanoVNA screen for that fixture

```vna
device: h4
sweep: 1M-300M 101
title: 100 ohms in series
dut: series R 100
traces:
  - S21 logmag
  - S11 logmag
  - S11 smith
markers:
  - 10M
```

`dut:` is the ideal model, drawn dashed; it gives −6.02 dB both ways and 150 Ω on
the Smith chart. Save the measurement next to this file as Touchstone and add
`data: <file>.s2p` to draw it solid over the model. This fence has no map.

## scope — the RC low-pass above, driven by a square wave

```scope
title: RC charging (tau = 1 ms)
time: 1ms/div
trigger: ch1 rising 1V
ch1: square 100Hz 1V offset 1V
ch2: ch1 | rc 1ms
cursors: [0, 1ms]
measure: [vpp, freq]
```

10 kΩ and 100 nF make τ = 1 ms. `ch1` is the generator's wave (amplitude is
peak, so 0 to 2 V); `ch2: ch1 | rc 1ms` is that wave through the RC. The
readings under the screen give 1.27 V at X2 — 63 % of the way up. Export the
Scope screen of WaveForms as CSV next to this file and add `data: <file>.csv`
to draw it solid. This fence has no map.

## spectrum — the NanoVNA output on a tinySA Ultra

```spectrum
title: Harmonics of a 100 MHz square wave
device: tinysa-ultra
sweep: 0-960M 450
rbw: 300kHz
ref: 0dBm
signal: square 100MHz -10dBm
markers: [100M, 300M, 500M]
```

`device:` is required: `ad2` / `ad3` draw the FFT of Analog Discovery, the
tinySA models a swept receiver. `-10dBm` is the power of a sine with the same
peak, so the square wave's fundamental stands at −7.90 dBm and the odd harmonics
fall as 1/n. This fence has no map.

## graph — a Bode plot

```graph
title: RC low-pass — −45° where the gain is −3 dB
x: 周波数 Hz log 100..100k
y:
  - 利得 dB
  - 位相 deg
lines:
  利得 dB: 20*log10(1/sqrt(1+(x/1.59k)^2))
  位相 deg: -deg(atan(x/1.59k))
notes:
  - level -3dB
  - mark 1.59k
```

A textbook graph, not an instrument screen. The last word of a line's key is its
unit, and lines with different units stack in panels that share the x axis. The
readings under the graph give −3.01 dB and −45.0° at 1.59 kHz. This fence has no map.

## Drag the parts instead of typing

Every fence can also be edited with the mouse. Click the circuit-board button at
the top right of this tab (or run **"tommie-fence: Open the Fence Editor"** from
the command palette, `Ctrl+Shift+P`) and the map opens beside the text, showing
the fence under the cursor. Or reopen this file as the map itself:
`Ctrl+Shift+P` → **"View: Reopen Editor With..."** → **Fence Editor**. One editor
handles the four board and schematic fences (vna, scope, spectrum and graph have no map).

The map is a grab layer, not the drawing. Dragging a part rewrites the address
in the fence, so the text stays the source of truth.

## Where to go next

- [examples/](README.md) — every fence next to the drawing it produces
- [circuit syntax](../packages/circuit-fence/docs/01-syntax.md) ·
  [breadboard syntax](../packages/breadboard-fence/docs/01-syntax.md) ·
  [perfboard syntax](../packages/perfboard-fence/docs/01-syntax.md) ·
  [copper syntax](../packages/copper-fence/docs/01-syntax.md) ·
  [vna syntax](../packages/vna-fence/docs/01-syntax.md) ·
  [scope syntax](../packages/scope-fence/docs/01-syntax.md) ·
  [spectrum syntax](../packages/spectrum-fence/docs/01-syntax.md) ·
  [graph syntax](../packages/graph-fence/docs/01-syntax.md)

# Graph Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draw a Markdown ` ```graph ` fence (YAML) as a
**textbook x-y graph** — frequency responses (resonance curves, Bode plots) and
characteristic curves (I-V, reactance). In VS Code it runs inside the
`tommie-fence` extension.

![Resonance curve — the peak at 15.9 kHz, higher when the loop resistance is lower](examples/out/00-resonance.png)

## What it is for

A lab note has a table of values you expect to read, and a graph you draw from
it on log paper. Write the curve as an expression or as the table's points and
the fence draws it; point at a CSV of your measurements and they are plotted on
top. The numbers at the marks come out as text, so the prose and the picture
never disagree.

```yaml
title: Fig. 3 RC low-pass — −45° where the gain is −3 dB
x: 周波数 Hz log 100..100k           # name unit [log] [range]; the range uses ..
y:
  - 利得 dB
  - 位相 deg
lines:
  利得 dB: 20*log10(1/sqrt(1+(x/1.59k)^2))   # the last word of the key is the unit
  位相 deg: -deg(atan(x/1.59k))
data: 5-1.csv                        # measured points (next to the .md) → circles
notes:
  - level -3dB
  - mark 1.59k
```

- **Lines** are an expression of `x` (the axis value; SI prefixes `1.59k` `25.9m`
  `10M` are factors) or points written one per line (`- 2k 0.38`). Ideal lines
  are dashed
- **Units** separate the panels: lines with different units stack in panels that
  share the x axis (three at most). Axis names read "quantity/unit"
- **Magnitudes start at 0** when you leave the range out; dB and degrees wrap the values
- **Measured values** (`data:`) are a CSV **only from the same folder as the
  Markdown**, drawn as circles and never joined by a line. Columns are matched
  to lines by unit and name. The core never opens files; the host reads them
- **Mark and peak readings** appear under the drawing (`1.59 kHz  −3.01 dB  −45.0°`)
- **Expressions are read by a small recursive-descent parser**, never `eval`

## How it differs from its siblings

| | Draws | From |
| --- | --- | --- |
| [scope-fence](../scope-fence/) | An oscilloscope screen (time) | Waves + operations, a WaveForms CSV |
| [spectrum-fence](../spectrum-fence/) | A spectrum screen (frequency) | Waves and a receiver, a measured CSV |
| [vna-fence](../vna-fence/) | A VNA screen (frequency) | A model and Touchstone |
| graph-fence | **A textbook graph** | **Expressions and points, a measured CSV** |

A task that shows an instrument's screen uses scope, spectrum or vna; a task
that collects values and plots them uses graph. There is no netlist, no ERC and
no map to drag parts on.

## Usage

The full grammar is in [docs/01-syntax.md](docs/01-syntax.md), a one-screen
cheatsheet in [docs/02-cheatsheet.md](docs/02-cheatsheet.md), examples in
[examples/](examples/README.md).

```bash
npx graph-fence check notes/            # did it read, and what are the readings (writes nothing)
npx graph-fence render notes/ --out out # write the SVGs
```

`check` prints the readings (marks and peaks) as text. **Match the numbers
before you look at the picture.**

Not on npm. Point `file:` at the tgz from the Release.
The library entry is `graph-fence/core` (`renderGraph` / `extractGraphFences`).

## License

MIT

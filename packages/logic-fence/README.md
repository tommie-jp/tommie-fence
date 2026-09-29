# Logic Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draw a Markdown ` ```logic ` fence (YAML) as the
**screen of a logic analyser** — lanes, buses with their values, a time axis,
cursors, a trigger mark and a protocol decode row. It follows WaveForms
(Analog Discovery 3) Logic. In VS Code it runs inside the `tommie-fence`
extension.

![74HC163 address counting 0 1 2 3 4 5 3 4 5 3, seen on an Analog Discovery 3](examples/out/00-counter.png)

## What it is for

A lab note measured with a logic analyser needs the screen **you expect to
see before measuring**. Write each signal in the words of a pattern generator
(`clock 1Hz`, `pulse 2s 500ms`, `pattern 0110 bit 1ms`), bundle lanes into a
bus (`Address: A3..A0 hex`), and put the cursors and the trigger where the
text reads them; the fence draws the lanes and the bus boxes and computes the
value of every row at each cursor.

```yaml
title: Fig. 1 Address of a 74HC163 — 0 1 2 3 4 5 3 4 5 3, one per second
device: ad3                   # required: lanes and sample-rate limits
time: 1s/div                  # one division; the screen is always 10 divisions
sample: 1kHz
signals:
  CLK: dio0 clock 1Hz
  A:   dio1..dio4 counter on CLK rising sequence 0 1 2 3 4 5 3 4 5 3   # lanes A0..A3
buses:
  Address: A3..A0 hex         # MSB first, the radix goes last
cursors: [4.5s, 5.5s]         # X1 X2, with the delta
trigger: CLK rising at 0s     # checked: the lane must have that edge there
```

- **`device:` is required** — `ad3` (16 DIO, up to 125 MS/s, 32,768 samples per
  lane) or `generic`. A sample rate or window beyond the device is said, not
  silently drawn
- **Signals** are `clock` `pulse` `pattern` `high` `low` `edges` and `counter`
  (counts the edges of an earlier lane and makes a group of lanes). Frequencies
  and times need a unit; a bare number is refused
- **Buses** show the value in `hex` `bin` `dec` `sint`, changing at the
  transitions like WaveForms; bits that change together are one change
- **Cursors** (X1, X2) give the value of every lane and bus at that time and
  ΔX / 1/ΔX. **The trigger is checked** against the lane's real edges
- **A lane whose edges are closer than 3 px** is drawn as a band and said so —
  a line would only look like aliasing
- **`decode:`** reads UART frames (`uart TXD baud 9600 8N1`); SPI and I2C are
  not there yet

## How it differs from its siblings

| | Draws | From |
| --- | --- | --- |
| [scope-fence](../scope-fence/) | An oscilloscope screen (analogue, time) | Waves + operations, and a WaveForms CSV |
| [spectrum-fence](../spectrum-fence/) | A spectrum screen (frequency) | Waves and a receiver |
| logic-fence | **A logic analyser screen (digital, time)** | **Clocks, patterns and counters** |

There is no netlist, no ERC and no map to drag parts on.

## Usage

The full grammar is in [docs/01-syntax.md](docs/01-syntax.md), a one-screen
cheatsheet in [docs/02-cheatsheet.md](docs/02-cheatsheet.md), examples in
[examples/](examples/README.md).

```bash
npx logic-fence check notes/            # did it read, and what are the readings (writes nothing)
npx logic-fence render notes/ --out out # write the SVGs
node node_modules/logic-fence/dist/cli.cjs check notes/01.md   # the same, from a project that depends on the tgz
```

`check` prints the cursor table and a summary of the waveforms (the edge count
of every lane, the value sequence of every bus). **Match the numbers before you
look at the picture.**

Not on npm. Point `file:` at the tgz from the Release.
The library entry is `logic-fence/core` (`renderLogic` / `extractLogicFences`).

## License

MIT

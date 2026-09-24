# VNA Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draws a Markdown ` ```vna ` fence (YAML) as **the screen of a
vector network analyser (NanoVNA)** — Log Mag, Smith chart, SWR, phase, group delay,
impedance and TDR. In VS Code it runs inside the `tommie-fence` extension.

![A 100-ohm resistor in a series fixture](examples/out/00-series-1.png)

## What it is for

A lab note about measuring with a NanoVNA wants **the screen you should expect**
before you measure, and **what you got** after. Screenshots only exist afterwards.
Write the ideal model in one line and the fence computes the traces; point it at the
Touchstone file you saved and the measurement is drawn over them.

```yaml
device: h4
sweep: 1M-300M 101
dut: series R 100            # ideal model → dashed
data: 3-1-100ohm.s2p         # measured, next to the .md → solid
traces:
  - S21 logmag
  - S11 logmag
  - S11 smith
markers:
  - 10M
  - 300M
```

- **The model** (`dut:`) is a ladder cascaded from CH0 to CH1: `series` / `shunt`
  R, L, C with parasitics (`esr` `esl` `cp`), lossless lines and stubs, and an
  `open` / `short` end for one-port measurements
- **The measurement** (`data:`) is a Touchstone 1.x file (`.s1p` / `.s2p`, RI / MA /
  DB) **in the same folder as the Markdown**. The core never opens files; the host
  does (the CLI, and the VS Code extension for the document being previewed)
- **Traces use the NanoVNA menu names** (`logmag` `phase` `delay` `smith` `polar`
  `swr` `linear` `r` `x` `z` `tdr`), up to four. Traces with the same unit share one
  panel
- **Markers** are read out below the drawing in the NanoVNA format
  (`10.000 MHz  −6.02 dB  150.0 Ω + j0.0 Ω`), from the measurement if there is one
- The device (`h4` / `v2` / `plus4`) only decides what is **said** when the sweep goes
  beyond its range

## How it differs from its siblings

| | Draws | From |
| --- | --- | --- |
| [circuit-fence](../circuit-fence/) | Schematics | Parts at addresses |
| [breadboard-fence](../breadboard-fence/) / [perfboard-fence](../perfboard-fence/) | Wiring on boards | Parts in holes |
| [copper-fence](../copper-fence/) | Copper-clad boards | Copper in millimetres |
| vna-fence | **The analyser's screen** | **A model and a Touchstone file** |

Different languages, the same habits: YAML-hosted fences and errors reported with the
Markdown line and its text. There is no netlist, ERC or drag-to-edit map here.

## Usage

The whole syntax is in [docs/01-syntax.md](docs/01-syntax.md) (Japanese), with
examples under [examples/](examples/README.md).

```bash
npx vna-fence check  doc.md             # did it read; the marker readings
npx vna-fence render doc.md --out out   # write SVG
```

Point `file:` at the tarball from a Release (it is not on the npm registry).
The library entry is `vna-fence/core` (`renderVna` / `extractVnaFences`).

## License

MIT

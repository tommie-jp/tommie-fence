# Spectrum Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draw a Markdown ` ```spectrum ` fence (YAML) as the
**screen of a spectrum analyser** — either an FFT instrument (Analog
Discovery's Spectrum) or a swept one (tinySA). In VS Code it runs inside the
`tommie-fence` extension.

![Harmonics of the NanoVNA output seen on a tinySA Ultra](examples/out/00-harmonics.png)

## What it is for

A lab note measured with a spectrum analyser needs the screen **you expect to
see before measuring**. Write the signal in the same words as the generator
settings (`square 100MHz -10dBm`) and the instrument in the words of its menu
(`rbw: 300kHz`, `atten: 20dB`); the fence computes the lines, the receiver's
noise floor and the marker readings. Point at a measured CSV and the
measurement is drawn on top.

```yaml
title: Fig. 1 Harmonics of the NanoVNA output
device: tinysa-ultra          # required: the kind of instrument decides the maths
sweep: 0-960M 450
rbw: 300kHz
ref: 0dBm
signal: square 100MHz -10dBm
markers: [100M, 300M, 500M]
```

- **`device:` is required** — `ad2` `ad3` (FFT: sample → window → FFT, in dBV)
  and `tinysa` `tinysa-ultra` `generic` (swept: the lines traced with the RBW
  filter, plus a floor from the DANL, attenuator and LNA, in dBm). **The same
  wave reads the same dBm on both kinds.** A key that only one kind has is
  refused on the other
- **The signal** is written like a scope wave (`sine` `square` `triangle`
  `sawtooth` `pulse` `dc`, amplitude as peak; `-10dBm` is the power of a sine
  into 50 Ω). A list is summed. Operations (`| rc`) are not allowed
- **Instrument settings use the menu's words** — `rbw:` `atten:` `lna:`
  `points:` (swept), `samples:` `window:` (FFT), `ref:` `scale:` `unit:`
  `floor:`. An RBW that is not on the menu does not read
- **Measured values** (`data:`) are a two-column CSV (tinySA's SAVE TRACES,
  the Spectrum export of WaveForms), **only from the same folder as the
  Markdown**. The core never opens files; the host reads them
- **Marker** readings (a frequency or `peak`) appear under the drawing in the
  instrument's format (`1  100.000 MHz  −7.90 dBm`)

## How it differs from its siblings

| | Draws | From |
| --- | --- | --- |
| [vna-fence](../vna-fence/) | A VNA screen (frequency) | A model and Touchstone |
| [scope-fence](../scope-fence/) | An oscilloscope screen (time) | Waves + operations, and a WaveForms CSV |
| spectrum-fence | **A spectrum screen (frequency)** | **Waves and a receiver, a measured CSV** |

The shape of a processed wave belongs to scope, the frequency response of a
device under test (a filter's S21) to vna, and what a signal is made of
(harmonics, floor) to spectrum. There is no netlist, no ERC and no map to drag
parts on.

## Usage

The full grammar is in [docs/01-syntax.md](docs/01-syntax.md), a one-screen
cheatsheet in [docs/02-cheatsheet.md](docs/02-cheatsheet.md), examples in
[examples/](examples/README.md).

```bash
npx spectrum-fence check notes/            # did it read, and what are the readings (writes nothing)
npx spectrum-fence render notes/ --out out # write the SVGs
```

`check` prints the marker readings as text. **Match the numbers before you
look at the picture.**

Not on npm. Point `file:` at the tgz from the Release.
The library entry is `spectrum-fence/core` (`renderSpectrum` / `extractSpectrumFences`).

## License

MIT

# Spectrum Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draw a Markdown ` ```spectrum ` fence (YAML) as the
**screen of a spectrum analyser** — either an FFT instrument (Analog
Discovery's Spectrum) or a swept one (tinySA). In VS Code it runs inside the
`tommie-fence` extension.

## What it is for

A lab note measured with a spectrum analyser needs the screen **you expect to
see before measuring**. Write the signal in the same words as the generator
settings (`square 100MHz -10dBm`) and the instrument in the words of its menu
(`rbw: 300kHz`, `atten: 20dB`); the fence computes the lines, the receiver's
noise floor and the marker readings.

```yaml
title: Fig. 1 Harmonics of the NanoVNA output
device: tinysa-ultra          # required: the kind of instrument decides the maths
sweep: 0-960M 450
rbw: 300kHz
ref: -10dBm
signal: square 100MHz -10dBm
markers: [100M, 300M, 500M]
```

## CLI

```bash
npx spectrum-fence check notes/            # did it read, and what are the readings (writes nothing)
npx spectrum-fence render notes/ --out out # write the SVGs
```

`check` prints the marker readings as text. **Match the numbers before you
look at the picture.**

## License

MIT

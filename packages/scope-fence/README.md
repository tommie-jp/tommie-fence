# Scope Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draw a Markdown ` ```scope ` fence (YAML) as an
**oscilloscope screen** — time-domain waveforms, trigger, cursors and
Measurements. In VS Code it runs inside the `tommie-fence` extension.

![RC charging — reading the input and the capacitor voltage with cursors](examples/out/00-rc-charging-3.png)

## What it is for

A lab note measured with an oscilloscope needs the screen **you expect to see
before measuring**, and the screen **you saw after**. A screenshot only exists
after the fact. Write the ideal wave in the same words as the instrument
settings table (`square 100Hz 1V offset 1V`, `1ms/div`) and the fence computes
the waveform; point at a CSV exported from WaveForms and the measurement is
drawn on top.

```yaml
title: Fig. 3 RC charging — the screen you should see
time: 1ms/div
trigger: ch1 rising 1V
ch1: square 100Hz 1V offset 1V     # wave from the generator → dashed
ch2: ch1 | rc 1ms                  # ch1 through an RC of tau = 1 ms
data: 5-1-rc.csv                   # measured values (next to the .md) → solid
cursors: [0, 1ms]
measure: [vpp, freq]
```

- **Waves** use the generator's words (`sine` `square` `triangle` `sawtooth`
  `pulse` `dc`). Amplitude is peak (`2Vpp` `0.707Vrms` `-10dBm` also work);
  `offset` `phase` `duty` come in any order
- **Operations** (`| rc 1ms`, `| clip -0.7V 0.7V`, `| offset` `| gain` `| abs`)
  pass an earlier channel through a circuit: RC charging, rectifying and
  smoothing, clippers and clampers
- **Measured values** (`data:`) are the Scope export of WaveForms (CSV / TXT),
  **only from the same folder as the Markdown**. The core never opens files;
  the host reads them
- **Cursor and Measurements readings** appear under the drawing in WaveForms'
  format (`Vpp 2.00 V`, `Freq 100.0 Hz`), taken from the measurement when there
  is one
- **Numbers without units are refused** (`sine 1000 1` could mean 1 kHz, and
  1 V or 1 Vpp)

## How it differs from its siblings

| | Draws | From |
| --- | --- | --- |
| [vna-fence](../vna-fence/) | A VNA screen (frequency) | A model and Touchstone |
| scope-fence | **An oscilloscope screen (time)** | **Waves + operations, and a WaveForms CSV** |
| [spectrum-fence](../spectrum-fence/) | A spectrum screen (frequency) | Waves and a receiver, a measured CSV |

Waves are written the same way as in spectrum. There is no netlist, no ERC and
no map to drag parts on.

## Usage

The full grammar is in [docs/01-syntax.md](docs/01-syntax.md), a one-screen
cheatsheet in [docs/02-cheatsheet.md](docs/02-cheatsheet.md), examples in
[examples/](examples/README.md).

```bash
npx scope-fence check notes/            # did it read, and what are the readings (writes nothing)
npx scope-fence render notes/ --out out # write the SVGs
```

`check` prints the readings (Measurements and cursors) as text. **Match the
numbers before you look at the picture.**

Not on npm. Point `file:` at the tgz from the Release.
The library entry is `scope-fence/core` (`renderScope` / `extractScopeFences`).

## License

MIT

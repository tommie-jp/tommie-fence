# Scope Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draw a Markdown ` ```scope ` fence (YAML) as an
**oscilloscope screen** — time-domain waveforms, trigger, cursors and
Measurements. In VS Code it runs inside the `tommie-fence` extension.

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
cursors: [0, 1ms]
measure: [vpp, freq]
```

## CLI

```bash
npx scope-fence check notes/            # did it read, and what are the readings (writes nothing)
npx scope-fence render notes/ --out out # write the SVGs
```

`check` prints the readings (Measurements and cursors) as text. **Match the
numbers before you look at the picture.**

## License

MIT

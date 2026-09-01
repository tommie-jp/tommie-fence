# Examples

[English](README.md) | [日本語](README.ja.md)

**The files live inside the packages.** This page is the way in from the
repository root. The prose in them is Japanese; the fences are language-neutral.

| Fence | Examples | Index |
| --- | --- | --- |
| circuit | 15 circuits + 5 deliberately broken | [packages/circuit-fence/examples/](../packages/circuit-fence/examples/README.md) |
| breadboard | 13 circuits + 2 deliberately broken | [packages/breadboard-fence/examples/](../packages/breadboard-fence/examples/README.md) |

Every example carries **the drawing that fence produces** right after it, so the
source and the result read as a pair where fences are not rendered (GitHub, for
one). In the VS Code preview (`Ctrl+Shift+V`) the fence itself becomes the
drawing.

## circuit — schematics

[![RC low-pass](../packages/circuit-fence/examples/out/01-rc-lowpass.png)](../packages/circuit-fence/examples/01-rc-lowpass.md)

Parts are placed by grid address and wired with `--`; the netlist follows.
Above is [01-rc-lowpass.md](../packages/circuit-fence/examples/01-rc-lowpass.md).

- [04-non-inverting-amp.md](../packages/circuit-fence/examples/04-non-inverting-amp.md)
  — op-amp orientation and wiring to named pins
- [11-logic.md](../packages/circuit-fence/examples/11-logic.md)
  — logic gates, DIP ICs, changeover switches
- [15-arrows.md](../packages/circuit-fence/examples/15-arrows.md)
  — current arrows and voltage signs (`i=`, `v=`)
- [errors/](../packages/circuit-fence/examples/errors/)
  — what comes back when a fence cannot be read (errors with line numbers)

## breadboard — breadboard wiring diagrams

[![An LED and a resistor](../packages/breadboard-fence/examples/out/01-led.png)](../packages/breadboard-fence/examples/01-led.md)

Parts go into numbered holes, and the netlist is derived from the strips inside
the board. Above is [01-led.md](../packages/breadboard-fence/examples/01-led.md).
**The numbering is the reading order**, from the smallest circuit to bench ones.

- [07-pico.md](../packages/breadboard-fence/examples/07-pico.md)
  — an LED and a button on a Raspberry Pi Pico
- [09-am-radio.md](../packages/breadboard-fence/examples/09-am-radio.md)
  — a one-transistor AM radio (ferrite rod antenna, tuning capacitor)
- [10-bh-ad2.md](../packages/breadboard-fence/examples/10-bh-ad2.md)
  — a B-H curve rig (op-amp, instruments, toroidal core)
- [errors/](../packages/breadboard-fence/examples/errors/)
  — fences written wrong on purpose

## Why the files are not kept here

The examples are not documentation — they are **part of the build and the
tests**. Moving them out of the packages breaks three things at once.

- `examples/out/` holds the **expected values** of the snapshot tests
  (`src/core/examples.test.ts` reads it relative to its own package)
- `npm run examples --workspace=<package>` runs inside the package
- `vsce` rewrites the relative links in a README to absolute URLs **based on the
  package**, which is how the drawings appear on the Marketplace and on the
  extension page

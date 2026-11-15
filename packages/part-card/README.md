# Part cards — add a part without writing code

[English](README.md) | [日本語](README.ja.md)

Write a model number in a fence (`U1: dip14 e5 74LS00`) and the pin names are looked up in the parts table and printed
on the figure. A part that is not in the table can be added with one **part card** (`*.part.yaml`) — no code, no build.

A card carries no drawing. Its look is one the fences already have (DIP, single row, TO-92, TO-220, an off-board
device box, a two-row board).

```yaml
# .tommie-fence/parts/74LS00.part.yaml
models: [74LS00, SN74LS00, SN74LS00N]   # the first spelling is the canonical one
package: dip14                          # dipN / sipN / transistor/to92 / regulator/to220 / device / board
role: quad 2-input NAND                 # shown in the parts list
pins: [1A, 1B, 1Y, 2A, 2B, 2Y, GND, 3Y, 3A, 3B, 4Y, 4A, 4B, VCC]
source: TI SN74LS00 (SDLS025), pin diagram (N)   # required: where the order was checked
```

- Put cards in `.tommie-fence/parts/` in the workspace. The VS Code preview redraws on save, and mistakes in a card
  show in the Problems panel with their line.
- `part-card check <dir>` checks the fields and the pin-name rules and builds the part in all three fences;
  `part-card preview <card>` writes the SVGs. **Compare them with the data sheet's pin diagram** — no tool can tell
  whether the order is right.
- The fence CLIs read the cards too (`--cards <dir>`, `--no-cards`, `--strict-cards`).
- Local cards are read only by desktop VS Code and the CLIs. To make a part available everywhere (the web extension,
  the playground), move the card to `packages/fence-kit/parts/` and run `npm run cards` and `npm run rows`.

The full guide (fields, pin order per package, the naming rules) is in Japanese: [README.ja.md](README.ja.md).
Worked examples are the bundled cards in [packages/fence-kit/parts/](../fence-kit/parts/) (`chips/`, `discretes/`, `modules/`, `boards/`).

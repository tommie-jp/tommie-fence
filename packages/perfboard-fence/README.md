# Perfboard Fence

[English](README.md) | [日本語](README.ja.md)

A VS Code extension that previews a ` ```perfboard ` fence (YAML) in Markdown as
a perfboard wiring diagram.

Two-lead, three-lead, DIP and SIP parts all place, wire, check and write out.

## What it is for

Moving a circuit you tried on a breadboard onto perfboard, **in the layout you
chose yourself** — and keeping the drawing and the build order inside the same
lab notebook.

```yaml
board: akizuki-c
parts:
  R1: resistor b3 b7 10k
  D1: led c5 c9
wires:
  - b7 -- c5
```

- Positions are **grid addresses** (`b3` — row b, column 3), not coordinate
  pairs, so a diff means something and an LLM has less to get wrong. Row letters
  carry the way a spreadsheet's do, so a board taller than 26 rows keeps reading
  (`aa`, `ab`)
- **Wires are drawn by hand.** No auto-router — it does not suit a use where a
  person decides what goes where. What you write is what is drawn, which makes
  the result a soldering order
- What it derives is the **netlist** and the **errors**. Every hole on a
  perfboard is independent, so a missing connection is silent in the picture.
  That is what the ERC watches — it names an unconnected pin, with the line it
  was written on

## How it differs from its siblings

| | Draws | Holes |
| --- | --- | --- |
| [circuit-fence](../circuit-fence/) | Schematics | — |
| [breadboard-fence](../breadboard-fence/) | Breadboard wiring diagrams | Five holes in a column are joined inside the board |
| perfboard-fence | Perfboard layouts | **Every hole is independent**; only a wire creates a connection |

The languages are separate; the manners are shared: YAML-hosted fences,
positions written as addresses, and mistakes reported with Markdown line numbers
and the content of the offending line.

## What works today

| | State |
| --- | --- |
| Recognising a ` ```perfboard ` fence | works |
| Reporting an empty fence or a YAML syntax error with its line | works |
| Naming a key it does not know | works |
| **Drawing the board and its holes** (`board: 25x15` / `board: akizuki-c`) | works |
| **Addresses** (`b3`, and `aa3` past 26 rows) | works |
| **Placing two-lead parts** (17 kinds: resistors, LEDs, capacitors…) | works |
| **Resistor colour codes** and LED colours | works |
| **Drawing wires** (`- b7 -- c5 red`) | works |
| **Deriving the netlist** | works |
| **Naming holes** (`points:`) | works |
| **ERC** (unwired pins, shorted parts, wires that connect nothing) | works |
| **Collision checks** (overlapping bodies) and lead spacing | works |
| **Figure titles** (`title:`) | works |
| **CLI** (`render` / `check`) | works |
| **Three-lead parts, DIP, SIP** | works |
| `device` (things off the board), `notes:`, `style:` | **still to come** |

A board is written as a **hole count** or as a **name**. The count is columns by
rows — the order the board itself is sold in (`72×47mm` is long side by short
side). The names are `akizuki-b`, `akizuki-c` and `akizuki-d`, and writing the
physical size (`72x47mm`, `7.2x4.7cm`) picks the same board.

**Hole counts are never computed from millimetres.** The border varies from
board to board and from edge to edge, with the mounting holes sitting in it, so
dividing by 2.54 does not give the count. Only boards counted off a product
photo can be named; write a size that has not been counted and you get the
nearest board it knows, not a guess.

## How to write it

The grammar is in [docs/01-syntax.md](docs/01-syntax.md) (Japanese), and the
worked circuits are in [examples/](examples/README.md).

## CLI

```bash
node dist/cli.cjs render examples --out examples/out   # write the drawings
node dist/cli.cjs check examples                       # check without writing
```

`check` prints the netlist and whatever it has to say. It exits non-zero if any
line could not be read, so it drives CI and an LLM's self-correcting loop.

## Development

Run everything from the repository root (npm workspaces).

```bash
npm run check --workspace=perfboard-fence      # typecheck + tests
npm run examples --workspace=perfboard-fence   # rebuild the drawings
./doBuild.sh perfboard-fence                   # build the .vsix, reinstall into VS Code
```

## License

MIT

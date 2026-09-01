# Perfboard Fence

[English](README.md) | [日本語](README.ja.md)

A VS Code extension that previews a ` ```perfboard ` fence (YAML) in Markdown as
a perfboard wiring diagram.

**Three-lead parts and DIPs are still to come.** The board, its holes,
two-lead parts, wires and the netlist all work.

## What it is for

Moving a circuit you tried on a breadboard onto perfboard, **in the layout you
chose yourself** — and keeping the drawing and the build order inside the same
lab notebook.

```yaml
board: 28x18
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
| **Drawing the board and its holes** (`board: 28x18`) | works |
| **Addresses** (`b3`, and `aa3` past 26 rows) | works |
| **Placing two-lead parts** (17 kinds: resistors, LEDs, capacitors…) | works |
| **Resistor colour codes** and LED colours | works |
| **Drawing wires** (`- b7 -- c5 red`) | works |
| **Deriving the netlist** | works |
| **Naming holes** (`points:`) | works |
| **ERC** (unwired pins, shorted parts, wires that connect nothing) | works |
| **Collision checks** (overlapping bodies) and lead spacing | works |
| Three-lead parts, DIP, SIP | **still to come** |
| `device` (things off the board), notes, CLI | **still to come** |

The board size is written **columns by rows** — the order the board itself is
sold in (`72×47.5mm` is long side by short side). There are no named boards
(`akizuki-c` and such) yet: the vendor's pages give dimensions and pitch but
never the hole count, so until someone counts a real board, you write the size
you see on yours.

## Development

Run everything from the repository root (npm workspaces).

```bash
npm run check --workspace=perfboard-fence   # typecheck + tests
npm run build --workspace=perfboard-fence   # write dist/
./doBuild.sh perfboard-fence                # build the .vsix, reinstall into VS Code
```

## License

MIT

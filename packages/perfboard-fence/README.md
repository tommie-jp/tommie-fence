# Perfboard Fence

[English](README.md) | [日本語](README.ja.md)

A VS Code extension that previews a ` ```perfboard ` fence (YAML) in Markdown as
a perfboard wiring diagram.

Two-lead, three-lead, DIP and SIP parts place, wire up to things off the board,
take annotations, check and write out.

## What it is for

Moving a circuit you tried on a breadboard onto perfboard, **in the layout you
chose yourself** — and keeping the drawing and the build order inside the same
lab notebook.

```yaml
board: akizuki-c
parts:
  R1: resistor b3 b7 10k
  D1: led c5 c9
  BAT:
    type: device
    pins: + -
wires:
  - BAT.+ -- b3
  - b7 -- c5
  - c9 -- BAT.-
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
  was written on. For a drawing of part of a circuit, `style: check: off` turns
  the checks off (they are on by default)
- Things that do not sit on the board — a battery, a speaker — are written as a
  `device` and drawn in a band beside it, **with a line from the pin to the hole**
  (without it, the box in the band and the board never join up)

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
| **Things off the board** (`device`: batteries, speakers…) | works |
| **Annotations** (`notes:`: rings, boxes, arrows, text) | works |
| **Writing the fence into the drawing** (`notes: - source`) | works |
| **Theme and width** (`style:`: `light` / `dark` / `mono`) | works |
| **Turning the ERC off** (`style: check: off`; on by default) | works |
| **The solder side** (`style: back: on`; off by default) | works |
| **Axis labels** (`style: labels:`: letters/digits, upper/lower) | works |
| **Slot copper** (`board: slots: on`; off by default) | works |
| **Board and pad colours** (`board: color:` / `land:`; green and silver) | works |

A board is written as a **hole count** or as a **name**. The count is columns by
rows — the order the board itself is sold in (`72×47mm` is long side by short
side). The names are `akizuki-a`, `akizuki-b`, `akizuki-c` and
`akizuki-d`, and writing the physical size (`72x47mm`, `7.2x4.7cm`) picks the
same board.

**Hole counts are never computed from millimetres.** The border varies from
board to board and from edge to edge, with the mounting holes sitting in it, so
dividing by 2.54 does not give the count. Only boards counted off a product
photo can be named; write a size that has not been counted and you get the
nearest board it knows, not a guess.

## How to write it

The grammar is in [docs/01-syntax.md](docs/01-syntax.md) (Japanese), and the
worked circuits are in [examples/](examples/README.md).

## Grabbing the drawing

Parts and holes can be dragged around while you look at the drawing. Because the
fence **writes positions as hole addresses**, moving something comes down to
swapping a spelling inside a line.

- Pick **`perfboard Editor`** from the list at the top of a `.md` tab and the tab
  itself becomes the drawing's editor. To open it beside the text instead:
  `Perfboard Fence: 図を掴んで動かす (マップ)`
- **You grab the drawing itself** — not a separate grid. A transparent hit layer
  sits over the holes, and **the grid is uniform**, so an address and the picture
  can never disagree
- The band at the top switches **tools** — select, wire, node, and "place" once
  you pick from the palette. A part moves on its own and the connections change
  with it; a node (a hole) takes everything written at it, so they are kept
- **Placing, deleting, wiring, turning and editing names and values all work.**
  The palette searches by type name, abbreviation or Japanese name, and a new
  part is named with the smallest free number for its prefix. Turning and
  flipping work on two-lead parts, whose orientation *is* the order of the holes,
  so the grammar needs no new word
- **Nothing stops you before the move.** It compares the netlist before and after
  and lists what broke and what joined. Every hole is independent here, so a
  change always means a wire or a lead
- **ERC notices land in the same band, and clicking one jumps to that line.**
  A missing connection is silent in the drawing on this board, so having the fix
  and the edit in one window matters more here
- **The YAML is never rebuilt**: your comments and formatting survive

Turning parts with three or more leads is still done in text.
More in [docs/02-図を掴んで動かす.md](docs/02-図を掴んで動かす.md) (Japanese).

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

# Circuit Fence

[English](README.md) | [日本語](README.ja.md)

A VS Code extension that renders ` ```circuit ` fences (YAML) in Markdown
as circuit diagrams.

```yaml
parts:
  IN:  port a1
  R1:  resistor a1 a2 10k
  C1:  capacitor a2 b2 100n
  OUT: port a3
  G1:  ground b2
wires:
  - a2 -- a3
```

![RC low-pass](examples/out/01-rc-lowpass.png)

No coordinate arithmetic, no `\coordinate`, no `\node[circ]`.
Junction dots appear on their own.

## Why it exists

Drawing circuits from text is a solved problem
(CircuiTikZ / Schemdraw / Lcapy). This extension competes on two points only.

1. **Positions are written directly as addresses** — write
   `R1: resistor a1 a3 10k` and that is where it goes. No constraint graph,
   no dummy nodes for layout. Fixing the diagram doesn't move the node names
   in the netlist.
2. **Mistakes come back as line numbers** — the parts that parsed are drawn,
   and the lines that failed are listed under the diagram with their Markdown
   line numbers. This is what pays off when an LLM writes the fence and
   corrects itself.

If you need circuit analysis (transfer functions, transient response), use
[Lcapy](https://lcapy.readthedocs.io/). We don't compete there.

## Usage

Open a Markdown file and show the preview (`Ctrl+Shift+V`).
The syntax is in [docs/01-syntax.md](docs/01-syntax.md) (Japanese), and a
one-screen cheatsheet in [docs/02-cheatsheet.md](docs/02-cheatsheet.md)
(Japanese) — hand that single page to an LLM when you have it write the fence.

While you are laying things out, `style: grid: on` marks every address a part
can sit on with a dot. Rows are letters down the left, columns are numbers
across the top: the same way you read a breadboard.

![Grid](examples/out/10-grid.png)

Colors follow the editor by default (readable under both light and dark
themes). `style: theme:` pins them to `light` / `dark` / `mono` instead.

`notes:` overlays marks and text on the diagram. There are five: circle a part
(`circle`), frame a corner of the diagram (`box`), draw a pointer (`arrow`),
rule a line or a divider (`line`), and write a caption at any address
(`text`). **Note text renders Japanese even in the preview** — unlike part
values, it is never handed to the fence's TeX. Size (five steps from tiny to
huge), alignment, and bold are all selectable.

`- source <address>` **lays the fence's own text into the diagram**. The
preview replaces the fence with the picture, so the YAML you wrote is off
screen; this puts it back, side by side with the result.

![Notes](examples/out/12-notes-1.png)

A textbook schematic settles less about symbols than about which current is
called i and which end counts as +. Append `i=<label>` or `v=<label>` to a
two-terminal part's line to get the current arrow and the voltage signs
(`R: resistor b2 b3 i=i`). **The direction is measured from the address
written first**; to reverse it, swap the addresses or write `i<=`. To give a
part a drawn label separate from its ID, write `l=<label>`
(`l=$\dot{E}$` puts the phasor dot on).

![Current arrows and voltage signs](examples/out/15-arrows-1.png)

When several places point at the same node, naming the address under `points:`
makes moving it a one-line edit (write `vin: a1` and `vin` works anywhere an
address does). To sit between two grid points, split the row from the column
with `_` and write a fraction: `a_1.5`.

Diagrams are drawn by TeX (WASM), so there is no LaTeX to install. Each takes
about a second, and a "drawing the diagram…" placeholder stands in until it
lands. Finished diagrams are remembered, so you don't wait the second time.

### From the command line

```bash
node dist/cli.cjs render examples --out examples/out
```

Writes a `.tex` and an `.svg` per diagram. The `.tex` goes straight to LaTeX.
The netlist goes to stdout.

When you don't need the picture, `check` prints just the unreadable lines and
the netlist. It skips the one-second-per-diagram rendering, which is what you
want while writing and in CI.

```bash
node dist/cli.cjs check examples
```

For diagrams that need Japanese or typeset units, `--emit-tex` writes a `.tex`
for your local xelatex.

```bash
node dist/cli.cjs render notes.md --emit-tex --out tex
xelatex -output-directory tex tex/notes.tex
```

It differs from the preview in exactly three ways: Japanese values get
through, units go through siunitx (so µF prints properly), and the op-amp
becomes the real symbol. Addresses and wires are identical, so you can settle
the layout in the preview and then emit. Details in
[docs/01-syntax.md](docs/01-syntax.md) (Japanese).

`--version` prints the version of the toolchain.

```bash
node dist/cli.cjs --version
```

To stamp it onto the diagram, write `style: stamp: on`. **Don't write the text
yourself** — the toolchain fills the number in, so the stamp is renewed
whenever you update. Even an unstamped diagram always carries the version on
the root of the `.svg`, as `data-circuit-fence`.

### From your own code (`circuit-fence/core`)

The core (YAML → validation → circuitikz TeX) stays a synchronous pure
function and loads as a library. Use it when you are feeding the output into
your own rendering queue on a server.

```js
import { compileCircuit, VERSION } from 'circuit-fence/core'

const { tex, errors } = compileCircuit(source)
// Hand tex to node-tikzjax and you get SVG (the path the CLI takes).
// errors carry line numbers. The rendering engine is not part of this entry point
```

It is not published to the npm registry, so hand consumers a tarball.

```bash
npm pack   # builds, emits the type definitions, and makes circuit-fence-<version>.tgz
```

## Development

```bash
npm install
npm run check      # typecheck + tests
npm run examples   # rebuild the diagrams under examples (commit the output too)
./doBuild.sh       # build the .vsix and reinstall it into VS Code
```

Design commitments and working rules are in [CLAUDE.md](CLAUDE.md) (Japanese).

## Status

Phase 3. 77 parts in all (4 one-terminal symbols, 44 two-terminal parts,
29 multi-terminal parts). Done so far: `--` / `-|` / `|-` wires, pin
references (`U1.out`), junction dots, T connections, overlap detection,
`points:` (names for addresses), addresses between grid points (`a_1.5`),
`l=` (the drawn label) and `i=` / `v=` (current arrows and voltage signs) on
two-terminal parts, `title:` (a title above the diagram), `style:` (grid
display, theme, size, version stamp), `notes:` (marks, frames, pointers,
lines, text, and dumping the fence source), and `.tex` output via
`--emit-tex`.

![Non-inverting amplifier](examples/out/04-non-inverting-amp.png)

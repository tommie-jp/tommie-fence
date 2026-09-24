# Copper Fence

[English](README.md) | [日本語](README.ja.md)

A library and CLI that draws a Markdown ` ```copper ` fence (YAML) as a
**dimensioned drawing of a copper-clad board** — microstrip, coplanar lines
(CPW / CPWG) and Manhattan islands, drawn for cutting, peeling and gluing by hand.
In VS Code it runs inside the `tommie-fence` extension.

![A 50-ohm through line](examples/out/00-through.png)

## What it is for

When you build a GHz fixture for a NanoVNA, you want to write **which lines to leave,
how wide, and where** in your lab notes. The fence **computes Z0 from the line width
and prints it next to the line**, so "work out the 50-ohm width on 1.6 mm FR4" becomes
the caption of the drawing.

```yaml
board: 40x20mm
f: 2.4G
copper:
  L1: line 0,10 40,10 3.06
parts:
  J1: sma left 10 CH0
  J2: sma right 10 CH1
  C1: capacitor/1608 20,10 10p
```

- Positions are **`x,y` in millimetres** from the top-left corner. The board has no
  grid of holes, so there are no letter addresses; rulers and a 1 mm grid let you
  read dimensions off the drawing
- A line is **a polyline of horizontal and vertical segments with a width**. Its
  caption gives the **width, Z0 and electrical length** (`L1 3.06mm 50.0Ω 210°`),
  from Hammerstad-Jensen (microstrip) and complete elliptic integrals (CPW / CPWG)
- **A chip placed on a line cuts the line**, as you would with a knife before
  soldering it. The gap is never written separately, so part and gap cannot disagree
- An edge-mount SMA sits on **a side and a position along it** (`sma left 10`); its
  centre pin lands on the line and its shell on the ground
- It derives a **netlist** (touching copper is one net) and an **ERC**: pins on no
  copper, chips with no gap, an SMA pin over front ground, widths too narrow to cut
- Surface-mount sizes come from the same table as perfboard (fence-kit), and are
  **spelled the same way**

## How it differs from its siblings

| | Draws | Positions | Connections |
| --- | --- | --- | --- |
| [circuit-fence](../circuit-fence/) | Schematics | Addresses | — |
| [breadboard-fence](../breadboard-fence/) | Breadboards | Hole addresses | Columns of 5 holes |
| [perfboard-fence](../perfboard-fence/) | Perfboards | Hole addresses | Every hole apart; wires join them |
| copper-fence | Copper-clad boards | **Millimetres** | **The copper itself** (touching shapes are one) |

Different languages, the same habits: YAML-hosted fences, errors reported with the
Markdown line and its text, and the same scale (2.54 mm = 20 px).

## Usage

The whole syntax is in [docs/01-syntax.md](docs/01-syntax.md) (Japanese), with one
fixture per file under [examples/](examples/README.md).

```bash
npx copper-fence check  doc.md             # did it read, what connects (netlist and ERC)
npx copper-fence render doc.md --out out   # write SVG
```

Point `file:` at the tarball from a Release (it is not on the npm registry).
The library entry is `copper-fence/core` (`renderCopper` / `extractCopperFences`).

## License

MIT

# Perfboard Fence

[English](README.md) | [日本語](README.ja.md)

A VS Code extension that previews a ` ```perfboard ` fence (YAML) in Markdown as
a perfboard wiring diagram.

**It is a skeleton so far.** It finds the fence and reports what it could not
read, with line numbers. Nothing is drawn yet.

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

- Positions are **grid addresses** (`b3`), not coordinate pairs, so a diff means
  something and an LLM has less to get wrong
- **Wires are drawn by hand.** No auto-router — it does not suit a use where a
  person decides what goes where. What you write is what is drawn, which makes
  the result a soldering order
- What it derives is the **netlist** and the **errors**. Every hole on a
  perfboard is independent, so a missing connection is silent in the picture.
  That is the part worth having a machine watch

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
| Board, addresses, parts, wires, netlist | **still to come** |

## Development

Run everything from the repository root (npm workspaces).

```bash
npm run check --workspace=perfboard-fence   # typecheck + tests
npm run build --workspace=perfboard-fence   # write dist/
./doBuild.sh perfboard-fence                # build the .vsix, reinstall into VS Code
```

## License

MIT

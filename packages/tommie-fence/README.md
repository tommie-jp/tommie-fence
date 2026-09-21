# tommie-fence

Three Markdown fence languages that draw electronics — a **schematic**, a
**breadboard** and a **perfboard** — shown in the Markdown preview, and an
editor that lets you drag the parts while the fence text stays the source of
truth.

> **Alpha.** It mostly works, but the finer behaviour is still unstable.
> 日本語の説明は [README.ja.md](https://github.com/tommie-jp/tommie-fence/blob/main/README.ja.md) にあります。

![An RC low-pass, drawn from a circuit fence](https://raw.githubusercontent.com/tommie-jp/tommie-fence/main/packages/circuit-fence/examples/out/01-rc-lowpass.png)

![An LED and a resistor on a breadboard, drawn from a breadboard fence](https://raw.githubusercontent.com/tommie-jp/tommie-fence/main/packages/breadboard-fence/examples/out/01-led.png)

## What it does

| Fence | Draws |
| --- | --- |
| ` ```circuit ` | Schematics — parts placed by grid address, netlist derived |
| ` ```breadboard ` | Breadboard wiring — the strips inside the board make the nets |
| ` ```perfboard ` | Perfboard layouts — every hole independent, only wires connect |

- **Preview.** Open the Markdown preview (`Ctrl+Shift+V`) and each fence turns
  into its drawing. A line it cannot read is listed under the drawing with its
  line number and the line itself.
- **Fence Editor.** Drag a part, a wire end or a note, and the address in the
  fence is rewritten. Click the circuit-board button at the top right of a
  `.md` tab that has a fence, or reopen the tab with **Reopen Editor With… →
  Fence Editor**. One editor handles all three fences.
- **Problems.** Lines a fence cannot read get a squiggle and a row in the
  Problems panel (`Ctrl+Shift+M`).
- **Snippets.** On an empty line type `circuit`, `breadboard` or `perfboard`
  and press `Ctrl+Space` for a fence that draws right away.

## Install

Requires VS Code 1.90 or later. The extension is not on the Marketplace yet.
Download the `.vsix` from the
[releases page](https://github.com/tommie-jp/tommie-fence/releases) (tags
`tommie-fence-v…`, with `SHA256SUMS`) and install it:

```bash
code --install-extension tommie-fence-<version>.vsix
```

If you had the earlier single-fence extensions, remove them first — otherwise
every drawing appears twice:

```bash
code --uninstall-extension tommie.circuit-fence
code --uninstall-extension tommie.breadboard-fence
code --uninstall-extension tommie.perfboard-fence
```

To try it without installing anything, use the
[playground](https://tommie-jp.github.io/tommie-fence/) (all three fences in a
browser) or open the repository in
[Codespaces](https://codespaces.new/tommie-jp/tommie-fence?quickstart=1).

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `tommieFence.problems.erc` | `false` | Also list ERC findings (places that would not work as built) in the Problems panel. Off by default: a board still being wired reports every unconnected leg. The Fence Editor shows them behind its **検査** (check) button either way. |
| `tommieFence.map.noteFrame` | `false` | Draw a frame around `notes: text` in the Fence Editor. |

The command titles and messages follow VS Code's display language (English or
Japanese). The fences' own messages are in Japanese.

## Learn the fences

- [circuit syntax](https://github.com/tommie-jp/tommie-fence/blob/main/packages/circuit-fence/docs/01-syntax.md)
- [breadboard syntax](https://github.com/tommie-jp/tommie-fence/blob/main/packages/breadboard-fence/docs/01-syntax.md)
- [perfboard syntax](https://github.com/tommie-jp/tommie-fence/blob/main/packages/perfboard-fence/docs/01-syntax.md)
- [examples](https://github.com/tommie-jp/tommie-fence/blob/main/examples/README.md) — every fence next to the drawing it produces
- [CHANGELOG](CHANGELOG.md)

## Development

This package is only the entry point: the drawing is done by the three core
packages of the monorepo (`circuit-fence`, `breadboard-fence`,
`perfboard-fence`). Build and reinstall from the repository root:

```bash
./doBuild.sh           # build the .vsix and reinstall it (removes the old three first)
```

Do not call `vsce` directly — the workspaces layout makes it pick up the same
files twice. `scripts/vsix.sh` copies the package into a staging area first.

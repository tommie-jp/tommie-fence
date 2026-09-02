# Breadboard Fence

[English](README.md) | [日本語](README.ja.md)

A VS Code extension that renders ` ```breadboard ` fences (YAML) in Markdown
as breadboard wiring diagrams.

````markdown
```breadboard
board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
  - c13 -- -t13 black
```
````

![An LED and a resistor on a breadboard](examples/out/01-led.png)

Along with the drawing it **derives a netlist from the strips inside the board**,
so what you drew can be checked mechanically against the circuit you meant.

```text
+t : R1.1
N1 : R1.2, D1.A
-t : D1.K
```

## Why this exists

Drawing a schematic from text is a solved problem (CircuiTikZ, Schemdraw).
Drawing the **breadboard itself** from text was not: Mermaid, PlantUML and Kroki
all leave it alone. Writing "which hole does it go in" straight into the notes of
an experiment is what makes that experiment reproducible later.

The grammar aims to survive being written by an LLM, which comes down to three
rules: **no absolute coordinates, connections by name, placement by hole address.**

## Getting started

All you need is **VS Code 1.75 or newer**. It is not on the Marketplace, so grab
the `.vsix` from
[Releases](https://github.com/tommie-jp/breadboard-fence/releases)
(or build your own — see [Development](#development)).

The `.vsix` is plain JavaScript with no platform-specific binaries (the only
runtime dependency is a YAML parser). **The same file works everywhere**, which
is why a Release carries exactly one asset. Only the *where* differs.

| Environment | Where the extension runs | Install |
| --- | --- | --- |
| Windows | Windows side | PowerShell: `code --install-extension (Get-Item breadboard-fence-*.vsix).FullName` |
| WSL2 | **WSL side** (`~/.vscode-server/extensions`) | From a WSL shell: `code --install-extension breadboard-fence-*.vsix` |
| Linux / macOS | That machine | `code --install-extension breadboard-fence-*.vsix` |
| Remote-SSH / Dev Container / Codespaces | **The remote** | Same command from the remote's shell |
| VSCodium / Cursor | That machine | Use `codium` / `cursor` instead of `code` |

To check the download, the same Release carries `SHA256SUMS`.

```bash
sha256sum -c SHA256SUMS
```

It is also built for the browser (vscode.dev / github.dev), but **the web
extension host refuses a hand-installed `.vsix`**. Until it is on the
Marketplace, the only route there is to serve the unpacked extension over HTTPS
and hand the URL to `Developer: Install Extension from Location...`.

Once installed, open a Markdown file and show the Markdown preview
(`Ctrl+Shift+V`, or `Cmd+Shift+V` on macOS).

If `code` is not on your PATH, the extensions view (`Ctrl+Shift+X`) has the same
thing under `...` → "Install from VSIX" (on macOS the command palette's
`Shell Command: Install 'code' command in PATH` puts `code` there).

### Updating

**Editing the source does not change the extension you have installed.** The
preview keeps running the previous build until you rebuild the `.vsix` and
install it again.

```bash
# from the repository root
./doBuild.sh breadboard-fence            # check → build the .vsix → reinstall
```

To do the reinstall by hand, that is these two:

```bash
./doBuild.sh breadboard-fence --no-install
code --install-extension packages/breadboard-fence/breadboard-fence-0.4.0.vsix --force
```

Building the `.vsix` goes through `doBuild.sh` because **workspaces hoist the
dependencies to the repository root, so calling `vsce` directly fails** — the
package has to be copied out and packed on its own.

- Reinstalling without bumping the version needs `--force`.
- After reinstalling, **reload the window** (`Developer: Reload Window` in the
  command palette). Reopening the preview is not always enough.
- An out-of-date extension reports newer grammar as "unknown key". When syntax
  you just added does not show up in the drawing, suspect this first.

### Notes for Windows

- Node.js installs with `winget install OpenJS.NodeJS.LTS`.
- PowerShell and cmd do not expand wildcards and will pass
  `breadboard-fence-*.vsix` through literally. Use `Get-Item` as in the table
  above, or write the file name out.

### Notes for WSL2

- This extension **runs on the workspace side (WSL)**. Installing it on the
  Windows side alone leaves fences unrendered in a WSL window. Press the
  "Install in WSL: &lt;distro&gt;" button when the extensions view offers it.
- Keep the repository on the Linux side (`~/breadboard-fence` or similar). Under
  `/mnt/c/...` file access is slow enough that `npm install` and the tests drag.
- **Do not share `node_modules` between Windows and WSL.** esbuild and sharp
  install platform-specific binaries, so what one installs the other cannot run.
  If they get mixed, `rm -rf node_modules && npm install`.

### CLI

Writes standalone SVG you can paste into GitHub. Needs
`npm run build --workspace=breadboard-fence` first. The commands are the same
in PowerShell.

```bash
cd packages/breadboard-fence
node dist/cli.cjs render examples --out examples/out   # write the drawings
node dist/cli.cjs check examples                       # validate, write nothing
```

`check` writes nothing and prints only the netlist and what it could not read
(exit code 1 if a single line failed). It is meant for reading over a fence
before pasting it, and for CI; in a write-and-fix loop with an LLM it turns
around faster by the cost of the write.

Arguments can be files or directories, and expansion happens inside the CLI (so
shells that do not expand wildcards work as-is). Without `--out` it writes beside
the input. `npm run examples` also writes PNGs, but that needs sharp (a
platform-specific binary), so it is for development machines only.

## Grammar

[docs/01-syntax.md](docs/01-syntax.md) has the whole grammar with drawings, and
[docs/02-cheatsheet.md](docs/02-cheatsheet.md) is a one-screen cheatsheet
(both in Japanese). The essentials:

| Element | How to write it | Example |
| --- | --- | --- |
| Board | `board: mini` (17 columns) / `half` (30) / `full` (63). Power rails (present or not, and their order), row-label case and column numbering are selectable as a map | `board: half` |
| Hole address | Row `a`–`e` / `f`–`j` + column | `a5`, `j30` |
| Rail address | `+`/`-` + `t`/`b` + column | `+t5`, `-b20` |
| Two-lead part | `ID: type hole hole value` | `R1: resistor a5 a10 10k` |
| Polarity | Tag the hole with a pin name | `D1: led b12(A) b13(K) red` |
| Three-lead part | One hole per leg | `Q1: transistor h9(B) h10(C) h11(E) 2SC1815` |
| DIP | Write pin 1's hole; the rest follows | `U1: dip8 @ e5 NJM4556A` |
| Off-board device | Map form with `type: device` | see the examples |
| Wire | `- end -- end [-- end …] [colour]` | `- a10 -- b12 -- b20 red` |
| Wire into a lead's hole | The part slides to a free row in the same columns (same nets) | `- j20 -- -b20 black` |
| Routing hint | A detour in brackets (20 = one hole) | `- j20 -- -b20 black [v-20]` |
| Parts list | Printed under the drawing by default; write this to drop it | `parts-list: none` |
| Pushbutton | Four legs across the ravine; write pin 1a's hole | `SW1: button @ e5` |
| Microcontroller board | Write pin 1's hole; pin names match the silkscreen | `MCU: pico2 @ h5` |
| Shorthand | Common types have a short spelling | `R1: r a5 a10 10k` |
| Title | One line at the top left of the drawing | `title: 図01 LED を点ける` |
| Note | Marks and text laid over the drawing | `- circle R1` |
| Named point | Give a hole address a name with `points:` | `vin: a5` |

Two-lead types are resistor / capacitor / led / diode / buzzer / crystal /
inductor / photoresistor / thermistor / thermistor-ntc / thermistor-ptc /
varistor / zener / schottky / photodiode / varicap / diac / reed / fuse / lamp;
three-lead types are transistor / potentiometer / slide-switch / thyristor /
triac; the packaged ones are button (a tactile switch) / dipN / sipN;
the boards are pico / pico-w / pico2 / pico2-w; and off-board things are device.
The names match the schematic fence
([circuit-fence](https://github.com/tommie-jp/circuit-fence)), so writing both in
the same note does not mean learning two vocabularies.

A resistor's value is drawn as its colour code, and a capacitor tagged `(+)` `(-)`
is drawn as an electrolytic with its stripe. **For a two-lead part with a
polarity, the hole written first is the plus side (the anode)** unless you say
otherwise.

## Grabbing the drawing

Parts and holes can be dragged around while you look at the drawing. Because the
fence **writes positions as hole addresses**, moving something comes down to
swapping a spelling inside a line.

- Pick **`breadboard Editor`** from the list at the top of a `.md` tab and the
  tab itself becomes the drawing's editor. To open it beside the text instead:
  `Breadboard Fence: 図を掴んで動かす (マップ)`
- **You grab the drawing itself** — not a separate grid. A transparent hit layer
  sits over the holes, so what you see and what you grab never disagree
- The tool at the top decides **what you grab**. A part moves on its own and the
  connections change with it; a node (a hole) takes everything written at it, so
  the connections are kept
- **Nothing stops you before the move.** It compares the netlist before and after
  and lists the connections the move broke and the ones it made. Holes in the
  same column are already connected, so sliding within one strip says nothing
- Unreadable lines and notices land in the same band, and **clicking one jumps to
  that line**
- **The YAML is never rebuilt**: your comments and formatting survive

Placing, deleting and renaming are still done in text.
More in [docs/03-図を掴んで動かす.md](docs/03-図を掴んで動かす.md) (Japanese).

## Examples

**The numbers are the reading order**: the circuits get harder from top to
bottom. The index and the rules for the drawings are in
[examples/README.md](examples/README.md). The prose is in Japanese; the fences
and the drawings speak for themselves.

| File | What it shows |
| --- | --- |
| [01-led.md](examples/01-led.md) | The smallest example: a resistor and an LED |
| [02-themes.md](examples/02-themes.md) | The same circuit in all five themes (`style:`) |
| [03-board-variants.md](examples/03-board-variants.md) | Matching the silkscreen of the board on your desk (`board:` as a map) |
| [04-parts-list.md](examples/04-parts-list.md) | The parts list under the drawing, and how to drop it (`parts-list:`) |
| [05-capacitors.md](examples/05-capacitors.md) | Choosing a package (`capacitor/ceramic`, LED sizes, TO-220) |
| [06-switches.md](examples/06-switches.md) | Tactile switch, trimmer, slide switch |
| [07-pico.md](examples/07-pico.md) | An LED and a button on a Raspberry Pi Pico |
| [08-emitter-follower.md](examples/08-emitter-follower.md) | A 2SC1815 emitter follower (5V, into an 8Ω speaker) |
| [09-am-radio.md](examples/09-am-radio.md) | A one-transistor AM radio (RF stage + detector, ferrite rod and varicon) |
| [10-bh-ad2.md](examples/10-bh-ad2.md) | A B-H curve rig (op-amp, instrument, toroid) |
| [11-sensors.md](examples/11-sensors.md) | CdS and thermistor dividers, the diode family, glass-bodied parts |
| [12-notes.md](examples/12-notes.md) | Titles and notes (rings, boxes, arrows, text, writing the fence out) |
| [13-points.md](examples/13-points.md) | Naming hole addresses (`points:`), chained wires, `l=` |

![A one-transistor AM radio on a breadboard](examples/out/09-am-radio.png)

## How it works

The rendering core is a **synchronous pure function that touches neither the DOM
nor any Node API** —
`renderBreadboard(source) => { svg, netlist, errors, notices, errorHtml }` —
returning a self-contained SVG string that references nothing external. The VS
Code preview, the CLI and a server-side render in another app all get the same
picture.

**Nothing that failed to read is written into the SVG.** The drawing is only the
drawing, so pasting it into GitHub or another note does not drag the diagnostics
along. What it has to say lands in `errorHtml` (for the preview) and in `errors`
/ `notices` (as data). When no drawing could be assembled at all, `svg` is empty.

| Directory | What is in it |
| --- | --- |
| `src/core/` | The rendering core (parser / model / placement / router / render) |
| `src/extension/` | The VS Code extension (it only swaps markdown-it's fence rule) |
| `src/cli/` | The SVG writer |
| `syntaxes/` | Syntax highlighting for the YAML inside a fence (injection grammar) |

The only runtime dependency is a YAML parser. Both bundles come to about 180 KB
(the compressed `.vsix` is 133 KB).

## Development

Needs Node.js 20 or newer (not needed just to use the extension).

```bash
# all from the repository root; one npm install covers every package
npm install
npm test --workspace=breadboard-fence          # unit tests
npm run check --workspace=breadboard-fence     # type check + tests
npm run examples --workspace=breadboard-fence  # examples/*.md → examples/out/*.svg (+ PNG)
npm run docs --workspace=breadboard-fence      # docs/01-syntax.md → docs/out/*.svg
./doBuild.sh breadboard-fence                  # the above, through to reinstalling in VS Code
./doVersion.sh breadboard-fence minor          # bump the version (package.json and its copy together)
```

Pressing F5 in VS Code debugs the extension and opens a window on `examples/`.

Changing how things are drawn fails the `examples/out` snapshot tests. Rebuild
with `npm run examples` and `npm run docs`, then review the change with git diff
before committing.

**Japanese is the source of truth for this README; English follows it.** Edit
[README.ja.md](README.ja.md) first, then bring [README.md](README.md) into line.
Keep the two in the same sections.

### Releasing

Update the version in `package.json` and [CHANGELOG.md](CHANGELOG.md), then push
a matching tag. `.github/workflows/release.yml` runs the checks, builds the
`.vsix` and creates the Release; the release notes come from that version's
section of the CHANGELOG.

```bash
npm version 0.2.0 --no-git-tag-version   # package.json / package-lock.json
$EDITOR CHANGELOG.md                     # write the ## [0.2.0] section
npm run check
git commit -am "chore: v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin main v0.2.0
```

## License

[MIT](LICENSE)

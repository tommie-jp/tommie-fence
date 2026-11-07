# fence-check

Counts layout faults in `circuit` / `breadboard` / `perfboard` fences — the things a
reader trips over but a parser never sees:

1. `overlap` — two part bodies overlap
2. `wire-part` — a wire runs through a part body (wires that end on one of the part's pins are fine)
3. `crossing` — two wires cross mid-way; `junction4` — four arms meet at one point (schematics only)
4. `caption` — a part's caption overlaps a body (its own or another), a wire, or another caption

It draws nothing itself. Each fence's core returns the geometry it drew with
(`scenesOfCircuit` / `scenesOfBreadboard` / `scenesOfPerfboard`, type `Scene` in fence-kit),
so the check measures exactly what the picture shows.

```bash
npm run build -w fence-check
node packages/fence-check/dist/cli.cjs <markdown or directory...> [--json] [--only circuit,breadboard,perfboard] [--min <px>] [--top <n>] [--tex]
```

One line per finding:

```text
01-circuits/01-basics/03-rc-charge.md:84 breadboard 図2 スイッチで充電・放電を切り替える wire-part wire#4 × S1 32px
```

- `wire#N` is the N-th line under `wires:`; `caption:ID` is a caption; `ID(body)` is the caption's own part.
- A trailing `?` marks a finding on a schematic: `circuit` is drawn by TeX, so positions come from the
  address grid and two-terminal symbol sizes are estimated. Schematic captions are not checked yet.
- Wires to pins of multi-terminal parts (`Q1.C`) have no grid position. Without `--tex` they are counted
  as `skipped wires`, not checked. With `--tex` each schematic that has such wires is run through TeX
  once, which reports the pin anchors and the outline of each multi-terminal part (`\typeout` in the log);
  those wires and bodies are then checked too. It takes about a second per schematic.
- The exit code is 0 whatever is found (a fault makes a figure hard to read, not unreadable). Bad arguments exit 2.

`--json` prints `{ summary, findings, failures }` with the same fields as the text line.

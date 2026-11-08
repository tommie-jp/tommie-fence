# fence-check

Counts layout faults in `circuit` / `breadboard` / `perfboard` fences — the things a
reader trips over but a parser never sees:

1. `overlap` — two part bodies overlap
2. `wire-part` — a wire runs through a part body (wires that end on one of the part's pins are fine)
3. `crossing` — two wires cross mid-way; `junction4` — four arms meet at one point (schematics only)
4. `caption` — a part's caption overlaps a body (its own or another), a wire, or another caption
5. `wire-pin` — a wire runs over a hole that holds something else: a pin of a part, or the end of another wire
   (breadboard only; the amount is the number of holes). A wire routed half a hole aside is fine.
   Perfboards are left out: a bare wire running along the pins of its own net is normal there,
   and the scene does not carry nets yet
6. `device-side` — a wire from an off-board device box crosses the ravine in the middle of the breadboard,
   i.e. the box sits on the far side from the holes it goes to. Put the box on the side of its holes.
   One finding per wire; when the same box also has wires that stay on its side, the box serves both
   halves and the finding is `?` (split the box in two, or move an end — a person decides)
7. `wire-overlap` — two wires run on top of each other: parallel, at most 2 px apart, for 10 px or more
   (the amount is the shared length). One line hides the other, which `crossing` cannot see.
   Wires that share an end are left out (they meet at the same hole or node, so they are one net).
   Lanes the breadboard router lays side by side are 4 px apart and read as two wires, so they are fine.
   Wires on the same net (into the same strip of holes) are left out too, where the scene knows the nets
8. `power-branch` — a power or GND wire between a hole and a rail bends (breadboard only; the amount is
   the number of bends). Run it as one vertical line from the pin's column to the rail. Wires from an
   off-board supply or instrument, and wires joining two rails, may bend

It draws nothing itself. Each fence's core returns the geometry it drew with
(`scenesOfCircuit` / `scenesOfBreadboard` / `scenesOfPerfboard`, type `Scene` in fence-kit),
so the check measures exactly what the picture shows.

```bash
npm run build -w fence-check
node packages/fence-check/dist/cli.cjs <markdown or directory...> [--json] [--only circuit,breadboard,perfboard] [--min <px>] [--top <n>] [--tex]
    [--baseline <json> [--allow <json>] [--write]]
```

One line per finding:

```text
01-circuits/01-basics/03-rc-charge.md:84 breadboard 図2 スイッチで充電・放電を切り替える wire-part wire(d16-g16) × S1 32px
```

- A wire is named by its two ends as written (`wire(d16-g16)`, `wire(3,1-Q1.collector)`, `wire(AD.1+-a3)`);
  a second wire with the same ends is `wire(d16-g16)#2`. Adding a wire does not rename the others.
  `caption:ID` is a caption; `ID(body)` is the caption's own part.
- A trailing `?` marks an uncertain finding — on a schematic, or a `device-side` box serving both halves.
  On a schematic: `circuit` is drawn by TeX, so positions come from the
  address grid and two-terminal symbol sizes are estimated. Schematic captions are not checked yet.
- Wires to pins of multi-terminal parts (`Q1.C`) have no grid position. Without `--tex` they are counted
  as `skipped wires`, not checked. With `--tex` each schematic that has such wires is run through TeX
  once, which reports the pin anchors and the outline of each multi-terminal part (`\typeout` in the log);
  those wires and bodies are then checked too. It takes about a second per schematic.
- Without `--baseline` the exit code is 0 whatever is found (a fault makes a figure hard to read, not unreadable).
  Bad arguments or unreadable baseline files exit 2.

`--json` prints `{ summary, findings, failures }` with the same fields as the text line.

## Baseline: fail only on new faults

A book with hundreds of known faults cannot wait until they are all fixed before the check guards
new figures. Record today's findings once and fail only on findings that are not in that record:

```bash
fence-check . --json > fence-check.json                # once: today's findings are the baseline
fence-check . --baseline fence-check.json --write      # once more: rewrite it one finding per line
fence-check . --baseline fence-check.json              # from then on: only new findings, exit 1 if any
fence-check . --baseline fence-check.json --write      # after fixing figures: drop what has gone
```

- A finding is matched by **file, figure title, sheet, kind, a and b** — not by line number or amount,
  so adding a paragraph above a figure or a 1 px change in drawing does not make a finding new.
  Keys are counted: if the same two wires now cross twice instead of once, the second crossing is new.
- `--write` only removes. It writes the current lines (current line numbers and amounts) of the findings
  still present, sorted by key, one per line, so `git diff` reads as the list of fixed findings.
  A finding is never added to the baseline this way.
- A new finding that is meant to stay goes in the allow list, with a reason:

  ```json
  { "allow": [
    { "file": "a.md", "title": "図3 比較", "sheet": null, "kind": "crossing", "a": "wire(a1-a9)", "b": "wire(c3-g3)", "reason": "the crossing is the point of the figure" }
  ] }
  ```

- New findings marked `?` (estimated positions on schematics) are listed but never fail the run.
- When a new kind of check is added, take the baseline again with `--json` (the only time it grows).

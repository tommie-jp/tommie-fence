# tommie-fence

[English](README.md) | [日本語](README.ja.md)

A family of Markdown fence languages that draw electronics, kept in one
monorepo: schematic, breadboard, and perfboard.

| Package | Fence | Draws |
| --- | --- | --- |
| circuit-fence | ` ```circuit ` | Schematics — parts placed by grid address, netlist derived |
| breadboard-fence | ` ```breadboard ` | Breadboard wiring diagrams — netlist derived from the strips inside the board |
| perfboard-fence (planned) | ` ```perfboard ` | Perfboard layouts, built on the breadboard model |

The languages are separate; the manners are shared: YAML-hosted fences,
positions written as addresses, and mistakes reported with Markdown line
numbers and the content of the offending line.

## Status

This repository is being assembled. The histories of
[circuit-fence](https://github.com/tommie-jp/circuit-fence) and
[breadboard-fence](https://github.com/tommie-jp/breadboard-fence) have been
imported under `packages/` — every commit is here, so
`git log packages/circuit-fence` reaches back to the first one. The releases
and version tags stay in those repositories; versions tagged here are prefixed
with the package name (`circuit-fence-v0.4.0`). The three packages build, test
and package from the repository root through npm workspaces;
`perfboard-fence` does not exist yet.

```text
tommie-fence
├── packages/fence-kit          shared: newline normalisation, fence extraction, markup escaping
├── packages/circuit-fence
├── packages/breadboard-fence
└── packages/perfboard-fence    (planned)
```

`fence-kit` only holds code that was **already duplicated** — nothing is put
there in advance. The packages that use it bundle it with esbuild, so it has
no build step and no runtime dependency of its own.

## Documentation

Each package carries its own reference and a set of worked examples. The prose
is Japanese; the fences themselves are language-neutral. **[examples/](examples/README.md)
is the gallery** — every fence next to the drawing it produces.

[![RC low-pass](packages/circuit-fence/examples/out/01-rc-lowpass.png)](examples/README.md)

[![An LED and a resistor on a breadboard](packages/breadboard-fence/examples/out/01-led.png)](examples/README.md)

| Package | Reference | Cheatsheet | Examples |
| --- | --- | --- | --- |
| circuit-fence | [docs/01-syntax.md](packages/circuit-fence/docs/01-syntax.md) | [docs/02-cheatsheet.md](packages/circuit-fence/docs/02-cheatsheet.md) | [examples/](packages/circuit-fence/examples/) — 15 circuits, 5 error cases |
| breadboard-fence | [docs/01-syntax.md](packages/breadboard-fence/docs/01-syntax.md) | [docs/02-cheatsheet.md](packages/breadboard-fence/docs/02-cheatsheet.md) | [examples/](packages/breadboard-fence/examples/) — 13 circuits, 2 error cases |

Every example is followed by the drawing it produces (`examples/out/`), so the
files read as documentation in the Markdown preview. Rebuild them with
`npm run examples --workspace=<package>`.

## Development

One `npm install` at the root covers every package, and there is a single
lockfile.

```bash
npm install
npm run check                                # typecheck + tests, all packages
npm run check --workspace=circuit-fence      # just one
npm run examples --workspace=circuit-fence   # rebuild the drawings
./doBuild.sh circuit-fence                   # build the .vsix, reinstall into VS Code
./doVersion.sh circuit-fence minor           # bump the version
```

**Do not call `vsce` directly.** Workspaces hoist dependencies to the root
`node_modules`, and `vsce package` then walks outside the package and picks up
the same file by two routes, refusing to pack. `doBuild.sh` copies the package
out and installs it on its own first, which is why it is the only supported way
to build a `.vsix`.

## License

MIT

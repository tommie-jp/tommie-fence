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
with the package name (`circuit-fence-v0.4.0`). The build is not wired up
across packages yet.

```text
tommie-fence
├── packages/fence-kit          shared: fence extraction, line-numbered errors, SVG/theme, CLI scaffold
├── packages/circuit-fence
├── packages/breadboard-fence
└── packages/perfboard-fence
```

## License

MIT

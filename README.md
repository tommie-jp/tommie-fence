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

This repository is being assembled. The extensions still live in their
original repositories —
[circuit-fence](https://github.com/tommie-jp/circuit-fence) and
[breadboard-fence](https://github.com/tommie-jp/breadboard-fence) —
and their histories will be imported here under `packages/`.

```text
tommie-fence
├── packages/fence-kit          shared: fence extraction, line-numbered errors, SVG/theme, CLI scaffold
├── packages/circuit-fence
├── packages/breadboard-fence
└── packages/perfboard-fence
```

## License

MIT

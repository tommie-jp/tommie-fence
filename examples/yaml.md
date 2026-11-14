# Writing YAML

[English](yaml.md) | [日本語](yaml.ja.md)

The fences in tommie-fence are written in YAML, and all nine share the same
manners. This page covers only what you need to read and fix a fence. What the
keys mean (`parts:`, `wires:`, …) is in each package's README and syntax reference.

## 1. Three shapes

YAML is nearly all of these three.

```bread
# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)
title: An LED and a resistor
board: half
parts:
  R1: resistor a5 a10 330
  D1: led b12(A) b13(K) red
wires:
  - +t5 -- a5 red
  - a10 -- b12
```

| Shape | Written as | In the example |
| --- | --- | --- |
| key and value | `key: value` (a space after the colon) | `title: An LED and a resistor` |
| nesting | on the lines under the key, **indented with spaces** | `R1: ...` under `parts:` |
| list | `-` and a space at the start of a line | the two lines under `wires:` |

A `#` after a space starts a comment that runs to the end of the line. The
first line of a fence in the examples (`# ブレッドボードの実体配線図 (...)`) is such
a comment and does not show in the drawing.

## 2. Indentation

- Indent with **spaces only**. Tabs are not allowed.
- Keep the same depth for the same level. Two spaces is the convention.
- When a key holds a list, the `-` may sit at the parent's indent or one level in.

## 3. One-line form (flow style)

Nesting and lists can be written on one line with `{ }` and `[ ]`. Each pair
below means the same thing.

```yaml
parts:
  R1: resistor a5 a10 330
```

```yaml
parts: {R1: resistor a5 a10 330}
```

```yaml
wires:
  - a10 -- b12
  - c13 -- -t13
```

```yaml
wires: [a10 -- b12, c13 -- -t13]
```

Short things on one line, long things on separate lines, reads best.

## 4. Where people trip

| Written | What happens | Fix |
| --- | --- | --- |
| `title: 5 V: supply` | a `:` followed by a space inside the value is read as a key separator and fails | quote it: `title: "5 V: supply"` |
| `title: use R1 #1` | everything after a `#` that follows a space becomes a comment and disappears | quote it, or avoid `#` |
| `label: @in`, `label: %x` | a value starting with `@` `%` `*` `&` `!` `[` `{` has a special meaning | quote it |
| a tab for indentation | cannot be read | use spaces |
| `a5`, `10k`, `1.5,2.1` | read as plain text (addresses, values and coordinates are fine as they are) | — |

Quotes may be `"..."` or `'...'`. When unsure, quote — the value is then read as text.

## 5. A line it cannot read does not stop the editor

If a line inside a fence cannot be read, the tommie-fence editor **keeps drawing
what it could read**. The unreadable lines stay exactly as you wrote them and are
listed under the drawing with their line numbers. Fix the listed line and see
whether the drawing comes back. (A line that reads as YAML but is wrong for the
fence is reported instead of the drawing, with the line number, the line itself
and a caret under the spelling at fault.)

## More

- The YAML spec: [YAML 1.2](https://yaml.org/spec/1.2.2/). tommie-fence reads
  YAML 1.2, so `on`, `no` and `yes` are text, not booleans.
- Hands on: open [Try me](try-me.md) and edit the fences.

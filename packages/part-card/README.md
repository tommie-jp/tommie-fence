# part-card

部品カード (`*.part.yaml`) を読むパッケージ。YAML の字を読み、fence-kit の検査 (`readCard`) に渡して、
言うことを行番号つきで返す。

- `part-card` — 字の読み取り (`readCardText`)。Node の API を使わない
- `part-card/node` — 置き場 (`.tommie-fence/parts/`) を探して読む (`findCardDir` `loadCardDir`)
- `part-card/cli` — 3 つのフェンスの CLI が使う口 (`--cards <dir>` `--no-cards` `--strict-cards`)
- `part-card/schema.json` — エディタの補完と赤線に使う JSON Schema

カードを確かめる CLI (`part-card check` / `part-card preview`) は fence-check のパッケージにある
(3 つのフェンスを束ねるため)。書き方は [docs/part-card.md](../../docs/part-card.md)。

# 部品カード — コードを書かずに部品を足す

[English](README.md) | [日本語](README.ja.md)

フェンスに `U1: dip14 e5 74LS00` と型番を書くと、ピンの名前が部品の表から引かれて図に刷られます。
表に無い部品は、**部品カード** (`*.part.yaml`) を 1 枚書けば足せます。コードもビルドも要りません。

カードは絵を持ちません。姿は、フェンスに既にある物 (DIP・1 列・TO-92・TO-220・機器の箱・2 列のボード) から選びます。

## まず: カードが要るか

| 順 | 問い | はい | いいえ |
| --- | --- | --- | --- |
| 1 | 型番でピンの名前が変わるか | 次へ | 何も足さない (抵抗・LED などの 2 ピンは種類を書くだけで描ける) |
| 2 | この図 1 枚でしか使わないか | 足さない。フェンスの中で `pins:` を書く (下) | 次へ |
| 3 | 既にある姿で、実物と同じ穴に挿さるか | **部品カード** | コードで足す (リレー・7 セグ・コネクタなど、穴の位置や胴の絵が部品ごとに違う物) |

図 1 枚だけなら、登録せずに書けます:

```yaml
parts:
  M1:
    type: device
    label: 手元のセンサ
    pins: [VCC, SDA, SCL, GND]
```

## カードを書く

ワークスペースに `.tommie-fence/parts/` を作り、`型番.part.yaml` を置きます。

```yaml
# .tommie-fence/parts/74LS00.part.yaml
models: [74LS00, SN74LS00, SN74LS00N]   # 書ける型番。先頭が代表の綴り
package: dip14                          # 姿 (下の表)
role: 2 入力 NAND ×4                    # 部品表に出る働き
pins: [1A, 1B, 1Y, 2A, 2B, 2Y, GND, 3Y, 3A, 3B, 4Y, 4A, 4B, VCC]
source: TI SN74LS00 (SDLS025)、端子図 (N)   # 並びを確かめた資料 (必須)
```

VS Code に YAML 拡張 (Red Hat) が入っていれば、`*.part.yaml` に補完と赤線が出ます。
YAML のファイルで `part-card` と打つと、骨組みのスニペットが出ます。

### 姿 (`package:`)

フェンスに書く「種類/姿」の綴りをそのまま書きます。

| `package:` | 部品 | ピンを並べる順 |
| --- | --- | --- |
| `dipN` (`dip28/wide` `dip8/sop`) | DIP の IC・変換基板 | 1 番から番号順 (切り欠きを上にして左上から反時計回り) |
| `sipN` | 1 列のモジュール・センサ | 1 番から。基板の印字を手前にして左から |
| `transistor/to92` `transistor/to220` `regulator/to220` | 3 ピン | 印字面を手前、ピンを下にして左から右 |
| `device` | 基板の外の機器 (挿せない物) | `view:` に書いた向きで、ヘッダ・端子の物理の並び |
| `board` | 2 列のマイコンボード | 1 番から反時計回り。型番がそのまま種類の名前 (`B1: arduino-nano @ h5`) |

### 欄

| 欄 | 要るか | 中身 |
| --- | --- | --- |
| `models:` | 必須 | 書ける型番。先頭が代表の綴り |
| `package:` | 必須 | 姿 (上の表) |
| `pins:` | 必須 | ピンの名前 |
| `role:` | 必須 | 一言で言う働き |
| `source:` | 必須 | 並びを確かめた資料。無いカードは読まない |
| `role-en:` | 省ける | 働きの英語 (`lang: en` の部品表) |
| `note:` | 省ける | 早見表に添える一言 |
| `kind:` | 3 ピンで必須 | `npn` `pnp` `nch-mos` `pch-mos` `nch-jfet` `pch-jfet` `regulator` |
| `case:` | 省ける | パッケージの名前 (`TO-92MOD`)。省けば `package:` の姿から |
| `view:` `product:` | `device` で必須 | 並びを見る向き、標準に決めた品 |
| `chip:` `row-span:` `usb:` | `board` で必須 | 載っているチップ、列の間のピッチの数、USB の口 (`micro-b` `usb-c` `usb-a`) |
| `name:` `reach:` `mark:` `hdmi:` `wireless:` | `board` で省ける | 図に刷る名前、縁の張り出し (既定 0.55)、チップの刷り字など |
| `look:` | 省ける | 1 列のモジュールの基板の色 (`body:` `edge:`、`#rrggbb`) |
| `outline:` | 省ける | ヘッダに載った基板と胴の外形 (mm) |
| `smd:` | 省ける | 変換基板に載せる面実装の胴の寸法 (mm) |
| `ic:` | 省ける | 回路図の `ic` の箱の `left:` `right:` `top:` `bottom:` に並べるピン。**全部のピンを 1 度ずつ**置く |
| `spice:` | 省ける | LTspice の模型 (`model:` `lib:` `nodes:`)。今は形だけ見る |

手本は同梱のカード [packages/fence-kit/parts/](../fence-kit/parts/) にあります。種類ごとに `chips/` (DIP・1 列。外形つきの `AE-DC-POWER-JACK-DIP`、面実装の `3SK291` もここ)・`discretes/` (3 ピン)・`modules/` (機器)・`boards/` (2 列のボード) に分けてあります。

### ピンの名前の決まり

データシートの端子図の印字をそのまま書きます。次だけ直します (`part-card check` が見ます)。

| 印字 | 書き方 |
| --- | --- |
| en dash の `–` | ASCII の `-` (`IN-`) |
| 空白・`,` を含む | 略すか落とす (`CARRY OUT` → `CO`、`1,2EN` → `12EN`) |
| 数字だけ (`0`〜`9`) | 字を前に付ける (`Q0`)。ピンの番号と取り違えるため |
| 大文字と小文字だけが違う 2 本 (`A` と `a`) | 両方を変える (`INA` と `Oa`)。回路図は同じピンに読む |
| 同じ名前の 2 本を別々に結ぶ | 番号を後ろに付ける (`GAIN1` `GAIN8`)。`NC` `GND` は同じ名前のままでよい |
| 上に線 (負論理) | 線を落とす。別のピンと同じ名前になるときだけ `/` を前に (`/Q1`) |

## 確かめる

保存すると、VS Code のプレビューは自分で描き直り、カードの誤りは Problems に行番号つきで出ます。

```bash
part-card check .tommie-fence/parts/              # 欄と決まりを検め、3 つのフェンスで組んでみる
part-card preview .tommie-fence/parts/74LS00.part.yaml   # 隣の preview/ に SVG を書く
```

**焼いた図とデータシートの端子図を並べ、1 番ピンの位置と全部のピンの名前を見比べてください。**
並びが正しいかは機械では見られません。資料どうしで並びが食い違う部品は、`note:` に「実物で確かめる」と書きます。

フェンスの CLI もカードを読みます (描くファイルから上へ辿って `.tommie-fence/parts/` を探す)。

| オプション | 働き |
| --- | --- |
| `--cards <dir>` | その置き場だけを読む |
| `--no-cards` | 読まない |
| `--strict-cards` | 手元のカードの型番を使った図を誤りにする (公開する図の確かめに) |

## うまくいかないとき

| 出ること | 直し方 |
| --- | --- |
| 「型番 … は表にありません」 | 置き場 (`.tommie-fence/parts/`) と拡張子 (`.part.yaml`) を見る。Problems にカードの誤りが出ていないか見る |
| 「ピンの数が合いません」 | `pins:` の本数と `package:` の数を合わせる |
| 「同梱の表にあります」 | その型番は既に表にある。カードは要らない。並びが違うと思うなら、公開側の表を直す |
| ほかの人の環境・web 版で図が誤りになる | 手元のカードはその場所に無い。下の「公開側へ足す」 |

## 手元だけか、公開側へ足すか

手元のカード (`.tommie-fence/parts/`) を読めるのは、VS Code のデスクトップ版とフェンスの CLI だけです。
web 版の VS Code・playground・フェンスを束ねて使うほかのアプリでは「表に無い」になります。ほかの場所でも使う部品は、公開側へ足します。

1. カードを `packages/fence-kit/parts/` の種類のディレクトリ (`chips/` `discretes/` `modules/` `boards/`) へ移す (手元のカードは消す)
2. `npm run cards` (表に焼く) → `npm run rows` (文書の部品の表を書き出す) → 各フェンスで `npm run gallery`
3. `npm run check`
4. CHANGELOG の `[Unreleased]` に 1 行 (fence-kit と、図の変わるフェンス)

## パッケージの中身

- `part-card` — 字の読み取り (`readCardText`)。Node の API を使わない
- `part-card/node` — 置き場を探して読む (`findCardDir` `loadCardDir`)
- `part-card/cli` — フェンスの CLI が使う口
- `part-card/schema.json` — JSON Schema
- `scripts/bake.mjs` `scripts/rows.mjs` — `npm run cards` `npm run rows` の中身

カードを確かめる CLI (`part-card check` / `preview`) は [fence-check](../fence-check/) のパッケージにあります
(3 つのフェンスを束ねるため)。

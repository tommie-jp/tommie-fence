---
name: tommie-fence
description: Markdown の ```circuit / ```bread / ```perf / ```copper / ```vna フェンス (回路図・ブレッドボードの実体配線図・ユニバーサル基板の実体配線図・銅張り基板のマイクロストリップの寸法図・VNA (NanoVNA) の画面) を書く・直す・読むときに使う。文法リファレンスの所在、CLI の check で読めたか・つながったかを確かめる手順、図を PNG に焼いて目で確かめる手順、フェンスどうしで取り違えやすい書き方をまとめてある。Use when writing or fixing circuit schematics, breadboard diagrams, perfboard layouts, copper-clad board (microstrip) drawings, or VNA (NanoVNA) screens — Log Mag, Smith chart, SWR, TDR — in these Markdown fences.
---

# tommie-fence のフェンスを書く

以下、`<root>` はこのリポジトリの直下 (この SKILL.md の 3 つ上)。

## 1. どのフェンスか

| 描きたいもの | フェンス | 文法 (先に読む順) | 例 |
| --- | --- | --- | --- |
| 回路図 | ` ```circuit ` | `packages/circuit-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/circuit-fence/examples/*.md` |
| ブレッドボードの実体配線図 | ` ```bread ` | `packages/breadboard-fence/docs/02-cheatsheet.md` → `01-syntax.md` | `packages/breadboard-fence/examples/*.md` |
| ユニバーサル基板の実体配線図 | ` ```perf ` | `packages/perfboard-fence/docs/01-syntax.md` (早見表は無い。目次から要る節だけ) | `packages/perfboard-fence/examples/*.md` |
| 銅張り基板 (マイクロストリップ・CPW・Manhattan の島) の寸法図 | ` ```copper ` | `packages/copper-fence/docs/01-syntax.md` (早見表は無い) | `packages/copper-fence/examples/*.md` |
| VNA (NanoVNA) の画面 (S21 / S11 の Log Mag・Smith・SWR・TDR) | ` ```vna ` | `packages/vna-fence/docs/01-syntax.md` (早見表は無い) | `packages/vna-fence/examples/*.md` |

**書く前に文法を読む。** 5 つは似ているが同じではない (§4)。
記憶や別のフェンスの感覚で書かない。例の中から近いものを写して直すのが早い。

## 2. 書いたら check

```bash
node <root>/packages/<x>-fence/dist/cli.cjs check <file.md> 2>&1
```

- 見出しとネットリストは標準出力、読めなかった行・お知らせ・ERC は標準エラー
  (5 つとも同じ。vna はネットリストの代わりにマーカーの読み値を標準出力に出す)。
  まとめて読むので `2>&1` を付ける
- 読めなかった行は、行番号・その行・綴りを指す `^` つきで出る。
  1 つでもあれば終了コードは 0 以外
- ネットリスト (どの足がどのネットか) は標準出力。**意図した回路と突き合わせる**
- ERC (つながっていない足、線で跨いだ部品など) は終了コードを変えない。
  **読めない行があるうちは ERC を掛けない**ので、読めない行から直す
- **何も出ずに終了コード 0** は、フェンスが 1 つも見つからなかったということ。
  フェンス名を確かめる (§4)
- `dist/cli.cjs` が無いときは `<root>` で `npm install` → `npm run build -w <x>-fence`。
  文法リファレンスにある書き方が「知らない」と言われたら dist が古いので組み直す

## 3. 図を PNG に焼いて見る

check が通っても、字の重なり・部品の胴の重なり・注釈の置き場所は分からない。
SVG は画像として読めないので PNG に焼いてから見る。
**`render` には必ず `--out` で作業用のディレクトリを渡す** (省くと入力の隣に書き出す)。

```bash
# 板の 2 つ
node <root>/packages/<x>-fence/dist/cli.cjs render <file.md> --out <tmp>
node <root>/packages/<x>-fence/scripts/png.mjs <tmp>

# circuit (TeX を回すので 1 枚 1 秒ほど。figures.mjs は SVG に地の色を焼き込んでから PNG にする)
node <root>/packages/circuit-fence/dist/cli.cjs render <file.md> --out <tmp>
node <root>/packages/circuit-fence/scripts/figures.mjs <file.md> <tmp>
```

できた `<tmp>/*.png` を画像として読む。見るもの: 題・注釈・ラベルの重なり、
板の外の機器の箱が板や部品に被っていないか、配線が部品の胴を横切っていないか、
手書きや元の回路図と向き・並びが合っているか。**「重なりなし」と報告する前に、
字の 1 つ 1 つが読めるかを見る** (見落としやすい)。

人が読む図なら、配置の流儀 (出典つき) と PNG の点検表は
[electronics-drawing-skills](https://github.com/tommie-jp/electronics-drawing-skills) にある
(回路図・ブレッドボード・ユニバーサル基板・銅張り基板の 4 つ)。circuit フェンスでの番地の間の目安は
[readable-schematic](../readable-schematic/SKILL.md)。

## 4. 取り違えやすい所

| | circuit | breadboard | perfboard |
| --- | --- | --- | --- |
| 番地 | 升目の交点 `a1`。行 `a`〜`cu`、列 `1`〜`99`。升目の宣言は要らない | 穴 `a`〜`j` + 列、レール `+t5` `-b20` | `board:` の穴の中。板の外は `a0` `-a1` (4 つ先まで) |
| `board:` | 無い | `mini` / `half` / `full`。省くと `half` | **要る** (`20x4` は列 × 行、`akizuki-c` など) |
| 印の注釈 | `circle 部品ID か番地` | `circle 部品ID か番地` | **`mark 番地`** (`circle` は無く、部品 ID は指せない) |
| 注釈の種類 | circle box arrow line text source | circle box arrow line text source | mark box arrow text source parts |
| DIP・SIP | 多端子部品 `ID: 種類 番地 [向き] [型番]` | 胴の左端の列の穴 1 つ (e でも f でも同じ)。文法表は `dip8 @ e5` (`@` は省いても読む)。足は実物を上から見た並びで **1 番は左下の f 行** | 胴の左上の穴 1 つ。**`dip8 e5`** (`@` を付けると読めない)。**1 番は 3 行下の左下** (e5 なら h5)。DIP に `mirror` は書けない |
| 足に名前のある DIP 型 (`relay` `photocoupler` `seg7`) | 多端子部品と同じ。足は名前でも DIP の番号でも (`K1.COM1` = `K1.4`) | DIP と同じ置き方。**7 セグだけ列の間が 6 穴**で、`@ b5`〜`@ e5` か `@ f5`〜`@ i5` (リレーとフォトカプラは e / f だけ)。1 番は下の列 | DIP と同じ (`relay c3`)。1 番は下の列。板からはみ出すと断られる |
| ERC | `check` だけが掛ける (`render` は掛けない)。DIP・SIP・機器・リレーなどの使わない足は言わない | 無い | `check` と `render` の両方に出る |
| 面実装 | 無い。記号はパッケージに依らず、型番 1 語だけ書ける (`Q1: npn b3 2SC2712`)。`npn/sot346` も `2SC2712 S-Mini` も読めない | 変換基板に載せた姿だけ (`transistor/sot346-dip f3 f4 f5`、`dip8/sop @ e5`)。直付けの `transistor/sot346` は書き直し先を添えて断られる | 変換基板 (`-dip`、`dip8/sop b7`) と直付け (`transistor/sot346 d2 d3 c3` は三角、`resistor/2012 f2 f3` は隣の穴)。S-Mini は `sot346` |
| 板の外の機器 | `type: device` + `at: 番地` + `pins: [名前, …]` (**箱の片側に足**。`label` は箱の中の名前、`turn: mirror` で足が右)。1 行では書けない | `type: device` + `at: top` / `bottom` (帯に並ぶ) | `at: top` / `bottom` か番地。**番地は箱の左上**で、板の上なら `-b` 行より上 (`-a` や `0` は箱が板に被り、お知らせが出る) |

copper (銅張り基板) は**位置が穴ではなく mm** で、上の表の書き方はほぼ当てはまらない:

| | copper |
| --- | --- |
| 番地 | **mm の `x,y`** (板の左上から。`20,10`)。小数は 2 桁まで (`0,10.125` は読めない) |
| `board:` | 省くと 40×20mm・h 1.6・εr 4.4・裏ベタで描く (お知らせが出る)。**大きさに単位が要る** (`40x20mm`。`40x20` は断られる)。マップ形式 (`size:` の並び) で `h` `er` `ground` `cut` も書ける |
| 銅 | `copper:` に `L1: line 0,10 40,10 3.06` (点を並べて最後に幅)。**縦横だけ**。`pad` `via` `slot` も |
| 部品 | 端面 SMA は `sma left 10` (辺と位置。`sma/female` は断られる)、面実装は中心の点 (`capacitor/1608 20,10`)、足のある部品は端 2 つ (島の名前か点) |
| 印の注釈 | `mark 点` (部品名は指せない)。寸法線 `dim 点 点` がある |
| ERC | `check` と `render` の両方に出る。**銅に乗っていない足**が多い — 線路の上に置いた 2 本足のチップは線路を切るので、シャントは `r90` で直角に置く |

vna (VNA の画面) は**板も部品も無い**。位置の代わりに周波数:

| | vna |
| --- | --- |
| 書くもの | `sweep: 1M-300M 101` (開始-終了 点数)、`dut:` (理想の模型。`series R 100` / `shunt C 47p` / `line 50 1m vf 0.66` / 最後に `open` か `short`)、`traces:` (`S21 logmag` のように S11 か S21 と NanoVNA の形式名)、`markers:` (周波数) |
| 値の綴り | R は板と同じ (`4k7`)。**L と C は接頭辞が要る** (`47p` `100n`。`C 47` は 47 F で断られる)。長さは単位が要る (`25cm`) |
| 測った値 | `data: <名前>.s2p` は **`.md` と同じ場所のファイルだけ** (`/` `..` は書けない)。CLI は入力の隣を読む。読めない・見つからないはお知らせ (図は理想だけで出る) |
| 部品の Z を見る | 最後に `short` を書いて 1 端子にする。書かないと CH1 の 50 Ω が直列に見える |
| 注釈 | `mark 100M -6dB` / `text 100M -20dB: 字` / `band 88M 108M`。**値の単位で枠が決まる** (dB・deg・ns・Ω・単位なしは SWR) |
| ネットリスト・ERC・マップ | 無い。`check` は読み値の表を出す。お知らせ (機種の範囲の外など) は終了コードを変えない |

5 つに共通:

- **フェンス名は `circuit` / `bread` / `perf` / `copper` / `vna`。** 板の 2 つは長い綴り
  (`breadboard` / `perfboard`) も同じに読む (拡張 0.15.0・breadboard-fence 0.13.0・
  perfboard-fence 0.11.0 から。報告の名札は短い綴り)。新しく書くなら短い綴り。
  **これ以外の綴りは**、プレビューでは灰色のコードブロック、CLI では黙って素通りする
- **`text` の字は `:` の後ろ**: `- text c3 red: ここから電源`。
  番地の後ろに引用で字を書く (`- text c3 "R1: 抵抗"`) と、字の頭が色や向きの語として読まれて通らない。
  字の中にコロンと空白の並びがあるなら、`:` の後ろを囲む (`- text c3: "R1: 抵抗"`)
- circuit と breadboard の向きのある 2 端子は**先に書いた番地が + 側** (アノード)
- 板の 2 つは**部品面**を描く。裏面から描いた手書きを写すときは列を反転する
  (列数 + 1 − 手書きの列)。perfboard は `style: back: on` で裏返した板を下に足せる
- 承知のうえで残す未接続 (抜いたピンなど) は、ERC が言い続けるので本文に理由を書く

## 5. 返すとき

- どのフェンスで何を描いたか、check の結果 (読めない行 0、ネットリストの要点、
  残した ERC とその理由)、PNG で見て直した所を短く伝える
- PNG と SVG は作業用のディレクトリに置いたままにし、リポジトリには足さない
  (`docs/out` と `examples/out` は `npm run docs` / `npm run examples` が作る)

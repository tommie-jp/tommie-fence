# circuit フェンス 早見表

1 画面ぶんの文法。詳しい説明と図は [01-syntax.md](01-syntax.md)。
LLM に書かせるときは、この 1 枚をそのまま渡せる。

## 全体の形

````text
```circuit
title: 図01 …     # 任意。図の上に載せる 1 行の題
points:            # 任意。番地に名前を付ける
  fb: d4
parts:             # ID: 種類 番地 …
  R1: resistor a1 a3 10k
wires:             # - 端点 -- 端点 [-- 端点 …]
  - a3 -- fb
notes:             # 任意。図に重ねる印と字
  - circle R1
style:             # 任意。見た目
  grid: on
```
````

## 番地

- 行は `a`〜`z` (上から下)、列は `1`〜`99` (左から右)。`a1` が左上
- 大文字でもよい (`A1` = `a1`)。宣言は要らない
- 交点の間は `_` で行と列を切って小数 (`a_1.5` `a.5_1` `a.5_1.5`、2 桁まで)。
  `a1.5` は足 (`U1.5`) と読み分けられないので通さない。`a_1` も通さない
- `points:` に付けた名前は、**番地を書ける場所ならどこでも**使える

## 部品 (`parts:`)

| 形 | 書き方 | 例 |
| --- | --- | --- |
| 2 端子 | `ID: 種類 番地 番地 [値] [i=字] [v=字]` | `R1: resistor a1 a3 10k` |
| 1 端子 | `ID: 種類 番地` | `G1: ground c3` |
| 多端子 | `ID: 種類 番地 [向き] [型番]` | `U1: opamp c5 +up` |

- **向きのある部品は、先に書いた番地が + 側 (アノード)**。例外なし
- `i=字` は電流の矢 (先に書いた番地 → 後の番地の向き)、`v=字` は電圧の符号
  (先に書いた番地が +)。字は ID と同じで先頭 1 文字が本体・残りが添字。
  **`v=` は値とも `i=` とも並べられない** (図の同じ側に出る)
- 値は種類から単位を補う (抵抗の `10k` → 10 kΩ)。使える字は英数字と
  `. + - / ( ) _ %` (日本語は `--emit-tex` でだけ通る)
- 足は名前で指す (`Q1.B` `U1.out` `U1.1`)

### 種類

- 抵抗系 `resistor` `resistor-var` `potentiometer` `photoresistor`
  `thermistor` `thermistor-ntc` `thermistor-ptc` `varistor`
- 容量・コイル `capacitor` `ecap` `varicap` `inductor` `crystal`
- ダイオード系 `diode` `led` `zener` `schottky` `photodiode` `diac`
  `thyristor` `triac`
- 電源 `vsource` `sine` `square` `triangle` `isource` `battery` `solar`
- 開閉・出力・計器 `switch` `switch-nc` `button` `button-nc` `reed` `fuse`
  `lamp` `speaker` `mic` `ammeter` `voltmeter` `ohmmeter`
- 1 端子 `port` `ground` `vcc` `vee`
- 能動 `npn` `pnp` `nigbt` `pigbt` `nmos` `pmos` `njfet` `pjfet`
  `nmos-e` `pmos-e` `nmos-d` `pmos-d` `opamp` `transformer`
- 論理 `and` `or` `nand` `nor` `xor` `xnor` `not` `buffer` `spdt`
  `dip8` `dip14` `dip16` `dip20` `dip28` `dip40`

略記: `r` `c` `l` `d` `i` `v` `dc` `ac` `gnd` `op` `ec` `pot` `ldr` `ntc`
`ptc` `xtal` `scr` `bat` `sw` `btn`

### 足の名前

| 種類 | 足 |
| --- | --- |
| `npn` / `pnp` | `B` `C` `E` |
| `nigbt` / `pigbt` | `G` `C` `E` |
| FET 各種 | `G` `D` `S` |
| `opamp` | `+` `-` `out` |
| `transformer` | `A1` `A2` `B1` `B2` |
| 2 入力ゲート | `a` `b` (`1` `2`) / `out` |
| `not` / `buffer` | `in` / `out` |
| `spdt` | `in` (`c`) / `1` `2` |
| `dipNN` | `1` 〜 足の本数 |
| `potentiometer` | `w` |
| `thyristor` / `triac` | `g` |

## 配線 (`wires:`)

| 演算子 | 引き方 |
| --- | --- |
| `--` | 2 点をまっすぐ (斜めもそのまま) |
| `-\|` | 先に横、それから縦 |
| `\|-` | 先に縦、それから横 |

- 端点は番地か足 (`U1.out`)。**3 つ以上つないで書ける** (`b1 -- b3 |- U1.+`)
- 端が 3 つ以上集まる交点と T 字には、分岐の黒丸が自動で付く
- **足へは `|-` か `-|` で引く** (`--` だと斜めに入る)。中心線に出る足
  (`B` `C` `E` / `G` `D` `S` / `out` / `in`) へ軸を揃えて引くときだけ `--` でよい
- 足へ引いた線の途中には当てられない。当てたい番地を通る配線に分ける

## 注釈 (`notes:`)

| 書き方 | 何が出るか |
| --- | --- |
| `- circle 部品IDか番地 [色]` | 囲む丸 |
| `- box 番地 番地 [色]` | 破線の枠 |
| `- arrow 起点 終点 [色]` | 指し棒 |
| `- text 番地 [語]: 文字` | 図に重ねる字 |
| `- source 番地 [語]` | フェンスの中身そのもの |

- 語は順不同。色 `red` / `blue` / `green` / `orange`、図の線と同じ色は `ink`、
  大きさ `tiny` / `small` / `normal` / `large` / `huge`、
  寄せ `left` / `center` / `right`、太字 `bold`
- 行送り `tight` / `loose` は `source` にだけ書ける (既定はその中間)
- 字に `:` を含むときは `"…"` で囲む (YAML がマップとして読むため)
- 注釈は回路の一員ではない (ネットリストにも黒丸にも数えない)

## 題 (`title:`)

- `title: 図01 circuit フェンスの書き方` の 1 行。図の左上に載る
- 大きさ・太さ・色は選べない (`large` の太字、図のほかの文字と同じ色)
- 60 文字まで。折り返さない
- **`notes:` の字では置けない** (番地は `a1` が最上段で、その上が無い)

## 見た目 (`style:`)

| 項目 | 値 | 既定 |
| --- | --- | --- |
| `theme` | `auto` / `light` / `dark` / `mono` | `auto` |
| `grid` | `on` / `off` | `off` |
| `grid-to` | 番地 | 使っている範囲 |
| `pitch` | 0.5〜5 (cm) | `2` |
| `standard` | `american` / `european` | `american` |
| `wire-width` | 0.2〜4 (pt) | `0.8` |
| `width` | 120〜4000 (ドット) | 読み手の字に合わせる |
| `stamp` | `on` / `off` | `off` |
| `ink-color` / `paper-color` / `grid-color` | `"#rgb"` / `"#rrggbb"` | テーマの色 |

テーマだけなら `style: dark` の 1 行でよい。
**色は `"…"` で囲む** (`#` から先は YAML のコメント)。
`stamp: on` は処理系の版を右下に刻む (**字は書かない**。処理系が埋める)。

## よく踏むところ

- `ink-color: #333` → 値が消える。`"#333"` と囲む
- `- text b1: R1: resistor a1 a3` → YAML がマップとして読む。字を `"…"` で囲む
- `U1.+ -- c3` → 斜めに入る。`U1.+ |- c3` と書く
- 部品 ID と `points:` の名前は重ねられない (注釈の指し先が決まらない)
- 番地の形 (`a1`) は `points:` の名前に使えない

## 確かめる

```bash
circuit-fence check <ファイルかディレクトリ...>
circuit-fence --version
```

`check` は図を描かず、読めなかった行とネットリストだけを出す (速い)。
読めなかった行があれば 0 以外で終わる。
`--version` は処理系の版を出す。

図を書き出すのは `render`、手元の LaTeX 用の `.tex` は `render --emit-tex`。

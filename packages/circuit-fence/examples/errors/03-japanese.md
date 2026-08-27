# 日本語の値と `--emit-tex`

プレビューの TeX (WASM) にはフォントが無いので、日本語の値は描けない。
黙って落とさず、行番号つきで返して `.tex` に書き出す道を伝える。

**この例もわざと壊してある。** プレビューでは `V1` の値が落ちて、
部品だけが描かれる。

写しの先頭に付けた数字は、分かりやすくするために添えた行番号。
**ソースに行番号はない**。

```circuit
title: 図01 日本語の値
parts:
  V1: vsource a1 a3 電池9V
  R1: resistor a1 c1 10k
  G1: ground c1
```

書いたのはこれ。

```text
13 title: 図01 日本語の値
14 parts:
15   V1: vsource a1 a3 電池9V
16   R1: resistor a1 c1 10k
17   G1: ground c1
```

帯にはこう出る。

```text
circuit: 15 行目: 部品 V1: 値 9V はプレビューの TeX にフォントがありません (circuit-fence render --emit-tex で .tex に書き出すと LaTeX で組めます)
```

文面に出るのは値のうち**そのまま出しても安全な字だけ** (`9V`)。
書いたとおりの値を帯に echo すると、そこが次のエスケープ漏れの入口になる。

## 書き出すと組める

同じフェンスを `--emit-tex` に通すと、手元の xelatex で組める `.tex` が出る。

```bash
circuit-fence render examples/errors/03-japanese.md --emit-tex --out tex
xelatex -output-directory tex tex/03-japanese.tex
```

書き出したほうはフォントもパッケージも積めるので、フェンスとは 3 つだけ違う。

| | プレビュー (フェンス) | `--emit-tex` |
| --- | --- | --- |
| 日本語の値 | 描けない (行番号つきで返す) | 描ける |
| 単位 | `100 uF` (字のまま) | `100 µF` (siunitx) |
| オペアンプ | 三角形 + 手描きの ± | 本物の `op amp` |

**違うのはこの 3 つだけ。** 番地も配線も黒丸も同じなので、プレビューで
位置を確かめてから書き出せる。

日本語のフォントは `\newfontfamily` の 1 行に書いてある (既定は
`Noto Sans CJK JP`)。手元に無ければその 1 行だけを書き換える。
値が全部 ASCII のときは、その行を書かない — **落ちうる 1 行を、
要らないときにまで置かない**ため。

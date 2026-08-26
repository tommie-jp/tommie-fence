# 読めなかったとき

読めた部品は描き、読めなかった行は図の下に**行番号つき**で出る。
行番号は Markdown の行なので、そのまま直しに行ける。

**この例はわざと壊してある。** `npm run examples` は `examples/` の直下しか
見ないので、ここの図は書き出されない。プレビュー (`Ctrl+Shift+V`) で開くと、
図の下にエラーの帯が出る。

写しの先頭に付けた数字は、分かりやすくするために添えた行番号。
**ソースに行番号はない**。

```circuit
parts:
  IN: port a1
  R1: resistr a1 a3 10k
  C1: capacitor z0 z2 100n
  L1: inductor a5 a5
  V1: vsource c1 c3 五ボルト
wires:
  - a3 -- a4
```

書いたのはこれ。

```text
14 parts:
15   IN: port a1
16   R1: resistr a1 a3 10k
17   C1: capacitor z0 z2 100n
18   L1: inductor a5 a5
19   V1: vsource c1 c3 五ボルト
20 wires:
21   - a3 -- a4
```

帯にはこう出る。

```text
circuit: 16 行目: 種類 resistr は知りません (resistor のことですか?)
circuit: 17 行目: z0 は番地の形ではありません (行 a〜z + 列 1〜99)
circuit: 18 行目: inductor の両端が同じ番地です (a5)
circuit: 19 行目: 部品 V1: 値はプレビューの TeX にフォントがありません (circuit-fence render --emit-tex で .tex に書き出すと LaTeX で組めます)
```

- **種類の綴り違い**は近い名前を 1 つだけ添える (全部並べるより読みやすい)。
- **番地の形**が違うと、使える範囲を添える。
- **両端が同じ番地**の部品は向きも長さも決まらないので描けない。
- **日本語の値**はフェンスの TeX にフォントが無い。値だけ落として部品は描き、
  `circuit-fence render --emit-tex` で `.tex` に書き出せば LaTeX で組めることを伝える
  (書き出したほうは日本語も単位も組める)。

`IN` と `R1` は読めているので、図には出る。読めたところは捨てない。

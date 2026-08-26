# 注釈の直し方

`notes:` でよくつまずくのは、字の `:` を引用符なしで書いたとき。
YAML は `:` のあとに空白が続くとマップの区切りとして読むので、
**エラーにならずマップになってしまう**。
yaml 自身の言い分は英語で「Nested mappings are not allowed」だけなので、
直し方を添えて返す。

**この例もわざと壊してある。**

```circuit
parts:
  R1: resistor a1 a3 10k
notes:
  - text b1: R1: resistor a1 a3 10k
```

```text
circuit: 15 行目: YAML の構文エラー: Nested mappings are not allowed in compact mappings (`:` を含む文字は "…" で囲みます)
```

字は YAML の値なので、`"R1: resistor a1 a3 10k"` と囲めば通る。

## 指し先と色と字

印の指し先は部品 ID か番地。どちらでもない名前は行番号つきで返る。
色はパレットの 4 つだけ。字に使えない字も、使える字を添えて返す。

```circuit
parts:
  R1: resistor a1 a3 10k
notes:
  - circle Rload
  - circle R1 rainbow
  - text b1: gain = 10
```

```text
circuit: 34 行目: 注釈の色 rainbow は知りません (red / blue / green / orange が使えます)
circuit: 35 行目: 注釈の文字に使えない文字があります (英数字と . + - / ( ) _ % : 、日本語、µ Ω ° が使えます)
circuit: 33 行目: 注釈の指す先 Rload がありません (部品 ID か番地で書きます)
```

読めた注釈は描き、読めなかった 1 つだけを落とす。行番号が前後しているのは、
読む段階ごとにまとめて出しているため (1 行ずつ読む → 図に組む、の順)。
`=` が通らないのは値と同じ理由で、**注釈から任意の TeX を作らせない**ため。

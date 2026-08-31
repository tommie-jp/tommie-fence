# わざと読めなく書いた例

**この下のフェンスは、直さずに置いてある。** どう報告されるかを見るための例なので、
プレビューで開くと図の下 (か、図の代わり) に帯が出る。

`npm run examples` の対象ではない (図にならない行を含むため)。

## 読めた部分は描き、読めなかった行だけ帯に出す

```breadboard
parts:
  R1: resistr a5 a10 10k
  D1: led a14(A) a17(K) red
wires:
  - +t5 -- b5 red
  - b10 -- nowhere
```

図は R1 抜きで組み上がり、下に帯が出る。

```text
breadboard: 2 行目: 知らない部品の種類です: resistr (resistor のことですか?)
      R1: resistr a5 a10 10k
          ^^^^^^^
breadboard: 6 行目: 配線の端点として読めません: nowhere
      - b10 -- nowhere
               ^^^^^^^
```

- 頭の `breadboard:` は**どの道具が言っているか**の名札。図は他人のノートに
  埋め込まれるので、名札が無いと直す場所を探せない。
- 行番号のあとに**行の中身**が続き、読めなかった綴りの下に印が付く。
- 綴りが行の中に 2 つあるときは印を付けない。
  どちらでもない場所を指すより、指さないほうがまだ正しい。

## 図が 1 つも組めないとき

```breadboard
parts:
  R1: [unclosed
```

YAML として読めないと図は 1 枚も出ない。SVG は空になり、
代わりに「breadboard フェンスを読めませんでした」のカードが出る。

```text
breadboard: 3 行目: YAML の構文エラー: Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 1:
```

YAML パーサの言葉はそのまま載せる (どこが閉じていないかは、あちらのほうが詳しい)。

**図の SVG には報告を書き込まない。** 書き出した SVG を GitHub や別のノートに
貼ったときに、報告まで付いてくると図として使えないため。

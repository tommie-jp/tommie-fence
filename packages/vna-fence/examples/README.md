# 例

[docs/01-syntax.md](../docs/01-syntax.md) に出てくる項目を、測る物 1 つずつの形で
見せたもの。プレビュー (`Ctrl+Shift+V`) で開くとフェンスがそのまま図になる。

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。

| ファイル | 内容 |
| --- | --- |
| [00-series.md](00-series.md) | 直列治具 — 理想 (`dut:`) と実測 (`data:`) を重ねる |
| [01-traces.md](01-traces.md) | トレースの形式 — 振幅・位相・群遅延、SWR・Smith・極 |
| [02-parts.md](02-parts.md) | 寄生分のある部品 — コンデンサの SRF、コイルの並列共振、水晶 |
| [03-lines.md](03-lines.md) | 伝送線路とスタブ、TDR |
| [04-notes.md](04-notes.md) | 注釈 (`notes:`) と見た目 (`style:`) |

`dut:` の**等価回路** (` ```circuit ` の回路図) を vna の図の前に添えてある
(何も入れない治具と、DUT の形がほかの例と同じ 04-notes は除く)。線路は伝送線路 (`tline`、値は Z0) で描く。
回路図の作り直しは `npm run schematics --workspace=vna-fence`
(circuit-fence を先に `npm run build` しておく)。
回路図は `<img width>` で**PNG の半分の幅** (回路図の実寸。字が vna の図と同じくらいになる) に
表示している。作り直して PNG の大きさが変わったら `width` も合わせる。

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではない。

## 図の付け方

作り直しは `npm run examples --workspace=vna-fence`
(`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショット
テストの期待値であり、貼ってある図でもある。

`.s2p` は `node scripts/fakeData.mjs` が**計算で**書く (実測ではない)。
どの図にも `title: 図NN タイトル` を付けてある。**番号は .md ごとに 01 から数え直す**。

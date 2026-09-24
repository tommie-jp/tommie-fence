# 例

[docs/01-syntax.md](../docs/01-syntax.md) に出てくる項目を、治具 1 つずつの形で
見せたもの。プレビュー (`Ctrl+Shift+V`) で開くとフェンスがそのまま図になる。

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。

| ファイル | 内容 |
| --- | --- |
| [00-through.md](00-through.md) | いちばん小さな治具 — 50Ω のスルー線路と端面 SMA |
| [01-board.md](01-board.md) | 板 (`board:`) の実寸・厚さ・誘電率と、地の在りか (`ground:`) |
| [02-lines.md](02-lines.md) | 線路の折れ線・スタブ・幅の段差 (ステップインピーダンス LPF) |
| [03-parts.md](03-parts.md) | 部品 — 線路を切るチップ、シャント、SOT-89 の MMIC |
| [04-manhattan.md](04-manhattan.md) | Manhattan の島と、島から島へ渡す部品・ジャンパ |
| [05-coupled.md](05-coupled.md) | 結合線路の隙間 (ヘアピン BPF) |
| [06-ground.md](06-ground.md) | 地の加工 — via・切り欠き・パッチアンテナ |
| [07-notes.md](07-notes.md) | 注釈 (`notes:`。寸法線 `dim`) と見た目 (`style:`) |
| [08-check.md](08-check.md) | 図のとおりに組むと動かないところ (ERC) |

どの例にも**等価回路** (` ```circuit ` の回路図) を添えてある。線路は伝送線路
(`tline`、値は Z0) で描く。回路図の作り直しは `npm run schematics --workspace=copper-fence`
(circuit-fence を先に `npm run build` しておく)。

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではない。

## 図の付け方

作り直しは `npm run examples --workspace=copper-fence`
(`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショット
テストの期待値であり、貼ってある図でもある。

どの図にも `title: 図NN タイトル` を付けてある。**番号は .md ごとに 01 から数え直す**。

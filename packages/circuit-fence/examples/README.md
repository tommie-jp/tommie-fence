# 例

[docs/syntax.md](../docs/syntax.md) に出てくる項目を 1 つずつ図にしたもの。
プレビュー (`Ctrl+Shift+V`) で開くとそのまま図になる。

図の作り直しは `npm run examples` (1 枚につき `.tex` / `.svg` / `.png` が
[out/](out/) に出る)。**描画を変えたら作り直して出力もコミットする** —
`.tex` はスナップショットテストの期待値であり、ドキュメントが貼る図でもある。

| 例 | syntax.md の項目 |
| --- | --- |
| [01-rc-lowpass.md](01-rc-lowpass.md) | 番地 / 部品 / 配線 / ネットリスト |
| [02-parts.md](02-parts.md) | 2 端子部品 37 種、1 端子の記号 4 種 |
| [03-multi-terminal.md](03-multi-terminal.md) | 多端子部品と足の名前、型番、FET の種類、2 端子の足 |
| [04-non-inverting-amp.md](04-non-inverting-amp.md) | オペアンプの向き (`+up`)、足への引き方 |
| [05-labels.md](05-labels.md) | ID の出方 / 値の出方 |
| [06-bends.md](06-bends.md) | 配線の `--` / `-\|` / `\|-`、分岐の黒丸と T 字、1 行につないで書く |
| [07-diagonal.md](07-diagonal.md) | 斜めに置く |
| [08-themes.md](08-themes.md) | `theme` (`auto` / `light` / `dark` / `mono`) |
| [09-style.md](09-style.md) | 色の上書き / `pitch` / `wire-width` / `standard` / `width` |
| [10-grid.md](10-grid.md) | `grid` / `grid-to` |
| [11-logic.md](11-logic.md) | ロジックゲート / DIP の IC / 切り替えスイッチ |
| [12-notes.md](12-notes.md) | `notes:` の印・枠・指し棒・字、色、大きさ、寄せ、日本語 |

## わざと壊してある例

[errors/](errors/) は「読めなかったときに何が出るか」の見本。

| 例 | syntax.md の項目 |
| --- | --- |
| [errors/01-unreadable.md](errors/01-unreadable.md) | 読めなかったとき (行番号つきのエラー) |
| [errors/02-overlap.md](errors/02-overlap.md) | 重なりの検出 |
| [errors/03-japanese.md](errors/03-japanese.md) | 日本語の値と `--emit-tex` |
| [errors/04-notes.md](errors/04-notes.md) | 注釈 (`:` の引用符 / 指し先 / 色 / 使える字 / 見た目の言葉) |

図にならない行が入っているので、`npm run examples` の対象からは外してある
(CLI は `examples/` の直下しか見ない)。貼ってあるエラーの文面が古びないよう、
実際に出る文言と一致するかをテストで見ている。

プレビューではフェンスが図 (か図にできなかったときのカード) に差し替わるので、
**書いた中身は ` ```text ` にも写してある**。ほかの図のように `- source` で
書き出さないのは、図が出ないフェンスがあるため。写しはずれるので、
フェンスの中身と一致するかもテストで見ている。

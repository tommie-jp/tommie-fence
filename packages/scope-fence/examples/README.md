# 例

計器の設定の表と同じ語で書いた ` ```scope ` の例。プレビュー (`Ctrl+Shift+V`) で開くと
フェンスがそのまま図になる。
文法の全部は [docs/01-syntax.md](../docs/01-syntax.md)、1 画面の早見表は
[docs/02-cheatsheet.md](../docs/02-cheatsheet.md)。

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。

| ファイル | 内容 |
| --- | --- |
| [00-rc-charging.md](00-rc-charging.md) | RC の充電 (電験 5-1) — 入力、入出力、カーソルで 1 τ を読む |
| [01-phase.md](01-phase.md) | RC 直列の位相 (電験 3-4) — `phase -58deg` と `rc 1ms` |
| [02-clipper.md](02-clipper.md) | クリッパとクランパ (回路 1-9) — `clip` と `offset` |
| [03-rectifier.md](03-rectifier.md) | 半波・全波整流と平滑 — `clip 0V`・`abs`・`rc`・`peak` (コンデンサ入力) |
| [04-power.md](04-power.md) | 交流の電力 (電験 3-6) — `math: ch1 * ch2 / 10` と `unit: W`、Avg が P |
| [04-waves.md](04-waves.md) | 波形発生器の波 6 種と、V/div を手で決める並びの形 |
| [05-xy.md](05-xy.md) | リサージュ (AD 2-5) — `view: xy` と `xy: ch1 ch2` |
| [06-diode.md](06-diode.md) | ダイオードの V–I (AD 2-13) — ch の行の式 (`= …`) を XY で |
| [07-notes.md](07-notes.md) | 注釈 (電験 5-1) — `notes:` の `text` `band` `mark`、微分 `hp`・積分 `integrate`・`delay` |
| [08-trigger-lc.md](08-trigger-lc.md) | トリガの位置 (電験 3-1) と 2 次の低域 (電験 10-3) — `trigger: … at -5div` で正の半周期、`lc` でチョッパのリップル |

00-rc-charging の図 04 は `data:` で CSV を重ねる。`00-rc-charging-ch.csv` は
`node scripts/fakeData.mjs` が**計算で**書く (実測ではない)。

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではない。

## 図の付け方

作り直しは `npm run examples --workspace=scope-fence`
(`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショット
テストの期待値であり、貼ってある図でもある。
どの図にも `title: 図NN タイトル` を付けてある。**番号は .md ごとに 01 から数え直す**。

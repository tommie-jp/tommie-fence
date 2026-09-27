# 例

計器の設定の表と同じ語で書いた ` ```spectrum ` の例。プレビュー (`Ctrl+Shift+V`) で開くと
フェンスがそのまま図になる。

どのフェンスの直後にも、**そのフェンスを描いた図** ([out/](out/)) を貼ってある。

| ファイル | 内容 |
| --- | --- |
| [00-harmonics.md](00-harmonics.md) | NanoVNA の出力の高調波 (本の 11-4) — tinySA Ultra、0〜960 MHz |
| [01-rbw-floor.md](01-rbw-floor.md) | RBW とノイズフロア、アッテネータ (11-2・11-3) |
| [02-ad-harmonics.md](02-ad-harmonics.md) | 方形波の高調波 (AD の 4-2) — FFT 型、dBV |
| [03-windows.md](03-windows.md) | 窓関数 (AD の 4-3) — bin の間の正弦を 3 つの窓で |
| [04-two-paths.md](04-two-paths.md) | FFT 型と掃引型 (11-5) — 同じ方形波が同じ dBm になる |
| [05-antenna.md](05-antenna.md) | アンテナで受けた FM 放送帯 (11-12) — `data:` で実測を重ねる |

05-antenna の `05-antenna-fm.csv` は `node scripts/fakeData.mjs` が**計算で**書く (実測ではない)。

わざと読めなく書いたものは [errors/](errors/) にある。
図にならない行を含むので `npm run examples` の対象ではない。

## 図の付け方

作り直しは `npm run examples --workspace=spectrum-fence`
(`.svg` と `.png` が [out/](out/) に出る)。
**描画を変えたら作り直して出力もコミットする** — `.svg` はスナップショット
テストの期待値であり、貼ってある図でもある。
どの図にも `title: 図NN タイトル` を付けてある。**番号は .md ごとに 01 から数え直す**。

# プロファイルの道具

フェンスを速く・軽くする前に、どこに時間とメモリが掛かっているかを測る道具。**本体には手を入れない** —
外から入口の関数や CLI を呼んで測るだけなので、束も太らない。結果は `.build/profile/*.json` (追跡しない) に置き、
標準出力には Markdown の表を出す。

| 命令 | 測る物 |
| --- | --- |
| `npm run profile:build` | ビルドの段 (`build` `typecheck` `test` `types`) の時間と最大のメモリを、パッケージごとに |
| `npm run profile:bundle` | 束の大きさ (minify・gzip) と、中身の内訳 (どのディレクトリ・ファイルが何 KB か) |
| `npm run profile:render -- <ディレクトリ…>` | フェンス 1 つを描く時間 (中央値と 95 %)、遅い図の上位、大きさとの伸び方、時間の掛かっている関数とファイル、ヒープの増え方 |
| `npm run profile:tex -- <ディレクトリ…>` | 回路図の TeX → SVG の時間 (初回と 2 枚め以降) |
| `npm run profile:editor -- <ディレクトリ…>` | マップのエディタの殻 (`view` `problems`) の 1 回の時間 |
| `npm run profile:cli -- <ディレクトリ>` | CLI で 1 冊を `check` (`--render` で `render` も) する時間と最大のメモリ |

```bash
npm run build                                                   # profile:cli は dist/cli.cjs を使う
npm run profile:render -- packages/breadboard-fence/examples    # 例の図で
npm run profile:render -- ../tommie-circuit-workbook/01-circuits --runs=15
```

## 読み方

- **時間は 1 回の値で判断しない。** `profile:render` と `profile:editor` は暖めてから何十回も回し、中央値と 95 パーセンタイルを出す
- `profile:render` は**毎回 1 字違う本文**で描く (読み取りの控えを外す。プレビューは打鍵のたびに本文が変わる)。
  同じ本文で繰り返した値は「控えが当たるとき」の欄
- 関数の上位は V8 の CPU プロファイラで取る。ソースの `.ts` をそのまま読むので (`node --experimental-transform-types`)、
  ファイルと行の単位で出る。**自分の中で使った時間** (呼んだ先は含まない)
- ヒープは、全部の図を何巡も描いて GC したあとの大きさ。後ろ半分の傾きが 0 に近ければ漏れていない
- 回路図の `profile:render` は TeX を書き出すまで。TeX を SVG にする時間 (1 枚が秒の桁) は `profile:tex`
- 機械で速さが揺れるので、CI では時間を見張らない。見張るなら揺れない数 (束の大きさ・出力の大きさ)

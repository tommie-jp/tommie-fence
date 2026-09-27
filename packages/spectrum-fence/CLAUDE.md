# プロジェクト指示 (spectrum-fence)

Markdown の ` ```spectrum ` フェンスをスペクトラムの画面として描くライブラリ + CLI。
横断の作法は[リポジトリ直下の CLAUDE.md](../../CLAUDE.md)、
**このパッケージについてはここが正**。起こした経緯と決めは
`~/52-tommie-fence/docs/86`・`88` にある (private)。

## この図の物理 (設計が板の 3 つと分かれる理由)

**図の中に部品も板も無い。** 描くのは周波数ごとのレベルで、**計器の型で計算の道が 2 つ**ある。

- **`device:` は必須** (既定を作らない)。FFT 型 (`ad2` `ad3` — Analog Discovery の Spectrum) は
  波を標本化して窓を掛け FFT、掃引型 (`tinysa` `tinysa-ultra` `generic`) は線スペクトルを受信機
  (RBW・ATT・LNA・フロア) でなぞる。**同じ波が 2 つの道で同じ数になる**ことを試験で縛る
  (`square 1MHz -10dBm` の 1・3・5 次)
- **キーの意味は型で変わらない。** 片方の型にしか無いキー (`samples:` `window:` / `rbw:` `atten:`
  `lna:` `points:`) は、もう片方の機種では断って理由を言う (`KEY_KINDS`)
- 波の読み (`parseWave` `parseVolts` `linesOf`) は **fence-kit の `wave.ts` `units.ts`**。
  scope と同じ綴りで書き、振幅は peak (`-10dBm` は 50 Ω の正弦の電力)。FFT と窓は fence-kit の `dsp.ts`
- **ネットリストも ERC もマップ (エディタの殻) も無い** (vna・scope と同じ)。拡張には
  `FenceEditor` を渡さず、Problems に出す口 (`problemsOf`) だけを渡す

## 約束

1. **core はファイルを開かない**。`data:` は宿主が `DataSource` で渡す (CLI は `.md`
   の隣、拡張は `env.currentDocument` の隣)。**名前は `DATA_NAME` 1 か所で絞る**
   (`/` も `..` も通さない)。宿主の読み口は fence-kit の `readNeighbor` (vna・scope と共用)
2. **エスケープが唯一の防御** (板のフェンスと同じ)。図と帯に載る字は `escapeMarkup`、
   入力の断片を報告に載せる入口は `safeToken` だけ。CSV から読んだ字は `dropInvisible` を
   通してから言う。CSV の `#` の頭書きは描かない
3. **読めなかったところは図の外に出す**。**格子は必ず描く** (空でも。54)
4. **SVG に `NaN` / `Infinity` を書かない**。描く値は格子の縁に寄せる。レベルは −200 で頭打ち
5. **上限を置く** (`limits.ts`)。波・線・点数・標本の数・マーカー・ファイルの大きさと列の数
6. **単位の無い数は断る** (直下の CLAUDE.md の文法の方針 1)。`-10dBm` `300kHz` `20dB` と書く
7. **理想も実測も同じ算法で読む** (マーカーは点の列から)。道を 1 つにする
8. **補った既定のうち図の中身を決める物は言う** (`sweep:` `points:` `samples:` `window:` `rbw:` の
   auto、generic のフロア)。見た目の既定 (`ref:` `scale:` `unit:` は状態の行と目盛に出る) は言わない
9. **「要確認」の既定** (`model/device.ts`) は実機で確かめてから直す

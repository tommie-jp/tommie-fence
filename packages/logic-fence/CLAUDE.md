# プロジェクト指示 (logic-fence)

Markdown の ` ```logic ` フェンスをロジックアナライザの画面として描くライブラリ + CLI。
横断の作法は[リポジトリ直下の CLAUDE.md](../../CLAUDE.md)、
**このパッケージについてはここが正**。起こした経緯と決めは `~/52-tommie-fence/docs/` (private) にある。

## この図の物理 (設計が scope・spectrum と分かれる理由)

**図の中に部品も基板も無い。** 描くのは**ディジタル信号の高低 (レーン)** と、束ねたレーンの値 (バス)、
時間軸 (10 目盛)、カーソル、トリガの印。scope の ch は電圧の波、logic のレーンは 0 / 1。

- **`device:` は必須** (既定を作らない)。`ad3` は DIO 16 本・標本化 125 MS/s・1 本 32,768 標本
  (Digilent AD3 Specifications Rev. 11/2023)。`generic` は本数 32・標本化と標本数は検査しない
- **波は時間の関数 (`levelAt`) と窓の中の変わり目 (`edges`) の 2 つの道を同じ物から出す** (`model/wave.ts`)。
  絵は `edges`、読み値 (カーソル) は `levelAt`。**変わり目ちょうどの時刻は新しい値**
- **counter は前のレーンの edge を数える** (`t ≥ 0` の edge。i 番目の edge の直後が i 番目の値)。
  元のレーンは前に書いたものだけ。レーンは `名前0`〜 (LSB が先頭の DIO)
- **変わり目が 3 px (60 px/目盛) より近いレーンは線でなく塗り** (`model/window.ts` の `PLOT`)。
  数えきれないほど密なら edge を数えず (`LIMITS.edges`)、カーソルは `levelAt` で正しく読める
- **バスはメンバーの変わり目の和**で区切り、窓の幅の 1e-9 以内の変化は同時とみなす
- **トリガは書いた edge が本当にあるか確かめる** (`model/trigger.ts`)。無ければお知らせ

## 約束

1. **core はファイルを開かない**。`data:` はまだ無い (WaveForms の CSV を重ねるときは scope・spectrum と同じ `DataSource`)
2. **エスケープが唯一の防御** (基板のフェンスと同じ)。図と帯に載る字は `escapeMarkup`、
   入力の断片を報告に載せる入口は `safeToken` だけ
3. **読めなかったところは図の外に出す**。**格子は必ず描く** (空でも。52 の docs/54)
4. **SVG に `NaN` / `Infinity` を書かない**
5. **上限を置く** (`limits.ts`)。行・レーン・バスのビット・edge・pattern・sequence・窓
6. **単位の無い数は断る** (直下の CLAUDE.md の文法の方針 1)。`1Hz` `500ms` と書く。`baud` だけは素の整数
7. **補うのは既定値だけで、補ったら言う** — 標本化は書かなければ検査しない (推測しない)。`time:` と `window:` は
   どちらも書かなければ断る (窓は仮で格子だけ描く)
8. **配色は theme.ts** (色は scope・spectrum の写し。fence-kit に配色の表は無い)。字は 12 px (graph・scope と同じ)

# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- **6 つ目のフェンス ` ```scope `** — オシロスコープの画面 (時間波形)。
  空でも 10 × 8 目盛の格子を描き、読めなかった行は図の下の帯と Problems に出す。
- CLI `scope-fence check|render|version` (vna と同じ作法)。`check` は読み値
  (Measurements とカーソル) を字で出す — 本文の「見るべき値」の表と数で突き合わせる。
- **波と操作** — `ch1: square 100Hz 1V offset 1V`、`ch2: ch1 | rc 1ms | clip -0.7V 0.7V`。
  波は sine / square / triangle / sawtooth / pulse / dc (振幅は peak。`2Vpp` `0.707Vrms` も)、
  操作は rc / clip / offset / gain / abs。参照できるのは自分より前の ch だけ。
  理想は画面を 8192 点で標本化し、助走 (10 τ + 1 周期) から回した定常を破線で描く。
- **トリガ** (`trigger: ch1 rising 1V`) — 横切りを探して t = 0 を画面の中央に置く。
- **Auto の目盛** — V/div は Vpp が 6 目盛に入る 1-2-5、time/div は一番遅い波の 2 周期。
  `ch1: {wave: …, range: 500mV/div, position: -2div}` で手で決められる。
- **カーソルと Measurements** (`cursors: [0, 1ms]`、`measure: [vpp, freq, phase]`) を
  図の下の帯に表で出す。vpp / vmax / vmin / avg / rms / freq / period / duty / phase / rise。
- **単位の無い数は断る** (`sine 1000 1` → 「周波数は 1kHz / 100MHz / 960M のように単位か接頭辞を付けます」。周波数は `1kHz` でも `1k` でもよい)。
  `time:` と `trigger:` を書かなかったときは何で描いたかをお知らせで言う。
- 例 5 本 (電験 5-1 の RC の充電、3-4 の位相、回路 1-9 のクリッパとクランパ、整流、波 6 種)。
- **測った波を重ねる** (`data: 5-1-rc.csv`) — WaveForms の Scope の Export (CSV / TXT) を
  `.md` の隣から読み、同じ色の実線で重ねる。読み値は測った値になる (見出しが「実測」)。
  `#` の頭書きは読み捨て、`Channel N (V)` / `C1 (V)` / `CH1 (mV)`、`,` / タブ / `;`、
  `Time (ms)` を読む。時刻の逆行・間隔の揃わない記録・ロケールの小数点のコンマは断る。
  読むのは CLI (`.md` の隣) と VS Code の拡張 (文書の隣) だけ。web と playground は
  「この宿主では読めません」と言って理想だけを描く。
- **文法リファレンス** (`docs/01-syntax.md`、図 6 枚) と **早見表** (`docs/02-cheatsheet.md`。
  AI が毎回読む 1 画面)。早見表に載せた名前と例は `cheatsheet.test.ts` が実装と突き合わせる。

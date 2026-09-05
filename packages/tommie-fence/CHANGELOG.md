# 変更履歴

書き方は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
版のつけ方は [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [0.1.0] - 2026-09-05

### Added

- **3 つのフェンスを 1 つの拡張にした** (`circuit` / `breadboard` /
  `perfboard`)。「エディターで開く」に 3 つ並んでいたのが 1 つになり、
  選び間違いという状態が無くなる。中身は入口だけで、図を描くのは今までどおり
  3 つのコア (52 の docs/19)。

- **掴んで動かす editor が言語をまたぐ。** 1 つの `.md` に circuit と perfboard が
  並んでいても、いまのフェンスの言語で引く。一覧には言語が添う。
  パレットと候補の一覧も、いまのフェンスのものに入れ替わる。

- **命令は 1 つ** (`tommie-fence.openMap`)。**畳む前の id もそのまま効く**
  (`circuit-fence.openMap` など) ので、書いてあるキー割り当ては直さなくてよい。

### 入れ方

**畳む前の 3 つを先に消す。** 残っていると文法もプレビューも二重に登録され、
図が 2 つ出る。`make install` は消してから入れるので、そちらを使えば順番を
間違えようがない。手で入れるときは:

```bash
code --uninstall-extension tommie.circuit-fence
code --uninstall-extension tommie.breadboard-fence
code --uninstall-extension tommie.perfboard-fence
code --install-extension tommie-fence-0.1.0.vsix
```

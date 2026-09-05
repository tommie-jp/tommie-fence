# tommie Fence

circuit / breadboard / perfboard の 3 つのフェンスを **1 つの拡張**で扱う。
中身は入口だけで、図を描くのは今までどおり 3 つのコア
(`circuit-fence` / `breadboard-fence` / `perfboard-fence`)。

## 入れ方

```bash
./doBuild.sh           # .vsix を作って入れ直す (畳む前の 3 つは先に消える)
```

**畳む前の 3 つを先に消す。** 残っていると文法もプレビューも二重に登録され、
図が 2 つ出る。`make install` (= `./doBuild.sh`) が消してから入れるので、
そちらを使えば順番を間違えようがない。手で入れるときは:

```bash
code --uninstall-extension tommie.circuit-fence
code --uninstall-extension tommie.breadboard-fence
code --uninstall-extension tommie.perfboard-fence
code --install-extension packages/tommie-fence/tommie-fence-0.1.0.vsix
```

## 畳んで変わること

| | 前 (3 つ) | 後 (1 つ) |
| --- | --- | --- |
| 「エディターで開く」の一覧 | 3 つ並ぶ | **1 つ** |
| 命令 | 各フェンスに `openMap` | `tommie-fence.openMap` (旧 id もそのまま効く) |
| プレビュー・文法 | 3 つの拡張が出す | **1 つの拡張が 3 つとも出す** |
| CLI | 3 つのまま | **3 つのまま** (別々に呼ぶものなので畳む値打ちが無い) |
| 版 | コアごと | コアごと (図に刻む字は「どのフェンスが描いたか」を言う) |

判断の全文は 52 の `docs/19-フェンスeditorを1つに統一する.md`。

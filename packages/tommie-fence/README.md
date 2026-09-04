# tommie Fence

circuit / breadboard / perfboard の 3 つのフェンスを **1 つの拡張**で扱う。
中身は入口だけで、図を描くのは今までどおり 3 つのコア
(`circuit-fence` / `breadboard-fence` / `perfboard-fence`)。

## いまの立ち位置

**まだ配っていない。** 作れるが、既定のビルドからは外してある
(`package.json` の `"vsix": false`)。作るときは:

```bash
make tommie-fence      # packages/tommie-fence/tommie-fence-*.vsix ができる
```

## 入れる前に (**大事**)

古い 3 つの拡張を**先に消す**。残っていると文法もプレビューも二重に登録され、
図が 2 つ出る。

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
| プレビュー・文法・CLI | 3 つのまま | **3 つのまま** (畳むのは掴んで動かす editor だけ) |
| 版 | コアごと | コアごと (図に刻む字は「どのフェンスが描いたか」を言う) |

判断の全文は 52 の `docs/19-フェンスeditorを1つに統一する.md`。

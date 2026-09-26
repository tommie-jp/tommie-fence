<!-- markdownlint-disable-file MD041 -->

## インストール

VS Code 1.90 以降。まだ Marketplace には出していないので、下の Assets の
`tommie-fence-{{VER}}.vsix` を落として入れる。

**コマンドで入れる** (落としたフォルダで):

```bash
code --install-extension tommie-fence-{{VER}}.vsix      # VS Code
codium --install-extension tommie-fence-{{VER}}.vsix    # VSCodium
cursor --install-extension tommie-fence-{{VER}}.vsix    # Cursor
```

**画面から入れる**: 拡張機能ビュー (`Ctrl+Shift+X`) の右上の「…」→
「VSIX からのインストール…」(Install from VSIX...) → 落とした `.vsix` を選ぶ。

- **上書きで入る。** 前の版を消す必要はない。入れたら VS Code を再読み込み
  (コマンドパレットの「開発者: ウィンドウの再読み込み」) する
- **WSL / Remote SSH / Dev Container** では、リモート側のウィンドウで同じコマンドを
  実行する (Markdown の拡張はワークスペースの側で動くため)
- **フェンスごとの古い拡張** (`tommie.circuit-fence` / `tommie.breadboard-fence` /
  `tommie.perfboard-fence`) を入れていたら、先に消す (図が 2 枚ずつ出る):
  `code --uninstall-extension tommie.circuit-fence` など
- 落としたファイルの確かめ: `sha256sum -c SHA256SUMS` (Windows は
  `certutil -hashfile tommie-fence-{{VER}}.vsix SHA256` の値を `SHA256SUMS` と見比べる)

入れずに試すなら [playground](https://tommie-jp.github.io/tommie-fence/)。

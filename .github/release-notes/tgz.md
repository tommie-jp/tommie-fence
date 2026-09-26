<!-- markdownlint-disable-file MD041 -->

## 使い方

npm のレジストリには出していない。Release の tgz の URL を依存に書く:

```bash
npm install --save-dev https://github.com/tommie-jp/tommie-fence/releases/download/{{TAG}}/{{PKG}}-{{VER}}.tgz
```

CLI は `node node_modules/{{PKG}}/dist/cli.cjs` (`check` / `render` / `--version`)。
文法は [packages/{{PKG}}/docs](https://github.com/tommie-jp/tommie-fence/tree/{{TAG}}/packages/{{PKG}}/docs)。
落としたファイルの確かめは `sha256sum -c SHA256SUMS`。

#!/usr/bin/env bash
#
# 拡張をビルドして .vsix を作り、VS Code に入れ直す。
#
# なぜ要るか: ソースを直しただけでは、入っている拡張は変わらない。Markdown
# プレビューは前のビルドのまま動くので、ウィンドウを再読み込みしても直した
# ところが出てこない。作り直して入れ直すまでが 1 セットになる。
#
#   ./doBuild.sh              型チェックとテストを通してから作り直して入れ直す
#   ./doBuild.sh --fast       チェックを飛ばす (描画を何度も見比べるとき)
#   ./doBuild.sh --no-install .vsix を作るだけ (配布物を用意するとき)
#
set -euo pipefail

cd "$(dirname "$0")"

run_checks=1
do_install=1
for arg in "$@"; do
  case "$arg" in
    --fast) run_checks=0 ;;
    --no-install) do_install=0 ;;
    -h|--help) sed -n '3,12p' "$0"; exit 0 ;;
    *) echo "知らない引数です: $arg (--fast / --no-install が使えます)" >&2; exit 2 ;;
  esac
done

if [ "$run_checks" -eq 1 ]; then
  echo "==> 型チェックとテスト"
  npm run check
fi

vsix="$(node -p "const p = require('./package.json'); p.name + '-' + p.version + '.vsix'")"

echo "==> $vsix を作る"
# vsce package が vscode:prepublish (esbuild --production) を呼ぶ。
npx vsce package --out "$vsix"

if [ "$do_install" -eq 0 ]; then
  echo "==> できあがり: $PWD/$vsix"
  exit 0
fi

if ! command -v code >/dev/null 2>&1; then
  echo "==> code コマンドが PATH にありません。$PWD/$vsix を手で入れてください" >&2
  echo "    拡張ビュー (Ctrl+Shift+X) の右上 ... → 「VSIX からのインストール」" >&2
  exit 1
fi

echo "==> VS Code に入れ直す"
# バージョン番号を上げずに中身だけ差し替えるので --force が要る。
code --install-extension "$vsix" --force

echo
echo "==> 入れ直しました。最後にウィンドウを再読み込みしてください"
echo "    Ctrl+Shift+P → 「Developer: Reload Window」"

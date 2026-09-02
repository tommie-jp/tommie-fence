#!/usr/bin/env bash
#
# 拡張をビルドして .vsix を作り、VS Code に入れ直す。
#
# なぜ要るか: ソースを直しただけでは、入っている拡張は変わらない。Markdown
# プレビューは前のビルドのまま動くので、ウィンドウを再読み込みしても直した
# ところが出てこない。作り直して入れ直すまでが 1 セットになる。
#
#   ./doBuild.sh                             **全部**作り直して入れ直す (既定)
#   ./doBuild.sh circuit-fence               1 つだけ
#   ./doBuild.sh breadboard-fence --fast     チェックを飛ばす (描画を何度も見比べるとき)
#   ./doBuild.sh circuit-fence --no-install  .vsix を作るだけ (配布物を用意するとき)
#   ./doBuild.sh -h                          この説明を出す
#
# **触っていないものは作り直さない。** 段取りは Makefile が持っていて、ここは
# 引数を make の目標に訳すだけ。make を直に呼んでもよい (`make help`)。
# 拡張を持たないパッケージ (fence-kit) は飛ばす。package.json に
# contributes が無いものがそれ。
set -euo pipefail

cd "$(dirname "$0")"
self="$(basename "$0")"

run_checks=1
do_install=1
pkg=""
for arg in "$@"; do
  case "$arg" in
    --fast) run_checks=0 ;;
    --no-install) do_install=0 ;;
    -h|--help) sed -n '3,18p' "$self" | sed 's/^#\( \|$\)//'; exit 0 ;;
    -*) echo "知らない引数です: $arg (--fast / --no-install が使えます)" >&2; exit 2 ;;
    *)
      if [ -n "$pkg" ]; then
        echo "パッケージは 1 つだけです: $pkg と $arg" >&2
        exit 2
      fi
      pkg="$arg"
      ;;
  esac
done

# **拡張を持つものだけを受ける。** ディレクトリの有無だけ見ると、fence-kit を
# 渡されたときに写して install したあと vsce の中まで進んでから落ちる。
# 一覧の出所は package.json (Makefile 経由で scripts/packages.mjs が読む)。
if [ -n "$pkg" ]; then
  extensions="$(make -s print-extensions)"
  if ! printf '%s\n' $extensions | grep -qx "$pkg"; then
    echo "$pkg は .vsix にできません ($extensions から選んでください)" >&2
    exit 2
  fi
fi

# 目標の名前に訳す。install- が付くと VS Code に入れ直すところまで行く。
if [ -n "$pkg" ]; then
  goal="$pkg"
else
  goal="all"
fi
if [ "$do_install" -eq 1 ]; then
  goal="install${pkg:+-$pkg}"
fi

exec make CHECK="$run_checks" "$goal"

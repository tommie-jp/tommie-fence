#!/usr/bin/env bash
#
# 拡張をビルドして .vsix を作り、VS Code に入れ直す。
#
# なぜ要るか: ソースを直しただけでは、入っている拡張は変わらない。Markdown
# プレビューは前のビルドのまま動くので、ウィンドウを再読み込みしても直した
# ところが出てこない。作り直して入れ直すまでが 1 セットになる。
#
#   ./doBuild.sh                             **全部**作り直して入れ直す (既定)
#   ./doBuild.sh tommie-fence                名前で 1 つだけ (拡張は tommie-fence の 1 つ)
#   ./doBuild.sh --fast                      チェックを飛ばす (描画を何度も見比べるとき)
#   ./doBuild.sh --no-install                .vsix を作るだけ (配布物を用意するとき)
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

# **落ちたら、よくある原因を調べて直し方を出す。** make のエラーだけでは
# 「graph-fence/src/core が見つからない」のように、本当の原因 (新しい
# パッケージを取り込んだあと npm install していない) が読み取れない。
diagnose() {
  local hints=()
  # 1. ワークスペースのリンク: npm install のときにしか作られない
  local missing=()
  for pj in packages/*/package.json; do
    local name
    name="$(node -p "require('./$pj').name" 2>/dev/null)" || continue
    [ -e "node_modules/$name" ] || missing+=("$name")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    hints+=("node_modules に ${missing[*]} へのリンクがありません。新しいパッケージを取り込んだあと npm install していないはずです → npm install")
  fi
  # 2. 依存の定義が install より新しい
  if [ -f node_modules/.package-lock.json ] && [ package-lock.json -nt node_modules/.package-lock.json ]; then
    hints+=("package-lock.json が前の install より新しくなっています → npm install")
  fi
  # 3. main より遅れている (最後に fetch した時点で)
  local behind
  behind="$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)"
  if [ "${behind:-0}" -gt 0 ]; then
    hints+=("手元は $(git rev-parse --abbrev-ref @{u}) より ${behind} コミット遅れています → git pull --ff-only (未コミットの変更があれば先に退避)")
  fi
  # 4. 未コミットの変更 (ほかのセッションの書きかけが混ざっていることがある)
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    hints+=("未コミットの変更があります (git status)。書きかけが原因で落ちていないか確かめてください")
  fi

  echo >&2
  echo "==> $self: ビルドに失敗しました" >&2
  if [ ${#hints[@]} -eq 0 ]; then
    echo "    よくある原因には当たりませんでした。上の make のエラーを見てください" >&2
  else
    local h
    for h in "${hints[@]}"; do echo "    - $h" >&2; done
    echo "    直したら、もう一度 ./$self" >&2
  fi
}

if ! make CHECK="$run_checks" "$goal"; then
  diagnose
  exit 1
fi

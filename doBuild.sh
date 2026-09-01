#!/usr/bin/env bash
#
# パッケージをビルドして .vsix を作り、VS Code に入れ直す。
#
# なぜ要るか: ソースを直しただけでは、入っている拡張は変わらない。Markdown
# プレビューは前のビルドのまま動くので、ウィンドウを再読み込みしても直した
# ところが出てこない。作り直して入れ直すまでが 1 セットになる。
#
#   ./doBuild.sh circuit-fence               型チェックとテストを通してから作り直して入れ直す
#   ./doBuild.sh breadboard-fence --fast     チェックを飛ばす (描画を何度も見比べるとき)
#   ./doBuild.sh circuit-fence --no-install  .vsix を作るだけ (配布物を用意するとき)
#
# なぜ隔離して詰めるか (ここがモノレポ化で変わったところ):
# npm workspaces は依存をリポジトリ直下の node_modules へ巻き上げる。すると
# `vsce package` はパッケージの外へ依存を探しに行き、同じファイルを 2 通りの
# 経路で拾って「同じパスが 2 つある」と言って止まる。パッケージ単体を作業場へ
# 写して単独で install すれば、単一リポジトリだった頃と同じ形になり、これが
# 起きない。詳しくは 52 の docs/03。
#
set -euo pipefail

cd "$(dirname "$0")"
root="$PWD"

run_checks=1
do_install=1
pkg=""
for arg in "$@"; do
  case "$arg" in
    --fast) run_checks=0 ;;
    --no-install) do_install=0 ;;
    -h|--help) sed -n '3,13p' "$0"; exit 0 ;;
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

if [ -z "$pkg" ]; then
  echo "パッケージ名が要ります: $(ls packages | tr '\n' ' ')" >&2
  exit 2
fi
if [ ! -d "packages/$pkg" ]; then
  echo "packages/$pkg がありません ($(ls packages | tr '\n' ' ')から選んでください)" >&2
  exit 2
fi

if [ "$run_checks" -eq 1 ]; then
  echo "==> 型チェックとテスト ($pkg)"
  npm run check --workspace="$pkg"
fi

vsix="$(node -p "const p = require('./packages/$pkg/package.json'); p.name + '-' + p.version + '.vsix'")"
out="$root/packages/$pkg/$vsix"

stage="$(mktemp -d)"
# 作業場は必ず片付ける。途中で失敗しても残さない。
trap 'rm -rf "$stage"' EXIT

echo "==> $pkg を作業場へ写す"
# dist と生成物は写さない。vsce が prepublish で作り直す。
tar -C "packages/$pkg" \
  --exclude=./node_modules --exclude=./dist --exclude=./coverage \
  --exclude='./*.vsix' --exclude='./*.tgz' \
  -cf - . | tar -C "$stage" -xf -

echo "==> 作業場で依存を入れる (単独のリポジトリと同じ形にする)"
# devDependencies も要る。vsce が prepublish で esbuild を呼ぶため。
# パッケージが単体で install できる状態を保つのは、この段取りの前提。
(cd "$stage" && npm install --no-audit --no-fund --silent)

echo "==> $vsix を作る"
# vsce package が vscode:prepublish (esbuild --production) を呼ぶ。
(cd "$stage" && npx vsce package --out "$out")

if [ "$do_install" -eq 0 ]; then
  echo "==> できあがり: $out"
  exit 0
fi

if ! command -v code >/dev/null 2>&1; then
  echo "==> code コマンドが PATH にありません。$out を手で入れてください" >&2
  echo "    拡張ビュー (Ctrl+Shift+X) の右上 ... → 「VSIX からのインストール」" >&2
  exit 1
fi

echo "==> VS Code に入れ直す"
# バージョン番号を上げずに中身だけ差し替えるので --force が要る。
code --install-extension "$out" --force

echo
echo "==> 入れ直しました。最後にウィンドウを再読み込みしてください"
echo "    Ctrl+Shift+P → 「Developer: Reload Window」"

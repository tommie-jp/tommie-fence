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
# 拡張を持たないパッケージ (fence-kit) は飛ばす。package.json に
# contributes が無いものがそれ。
#
# なぜ隔離して詰めるか (ここがモノレポ化で変わったところ):
# npm workspaces は依存をリポジトリ直下の node_modules へ巻き上げる。すると
# `vsce package` はパッケージの外へ依存を探しに行き、同じファイルを 2 通りの
# 経路で拾って「同じパスが 2 つある」と言って止まる。パッケージ単体を作業場へ
# 写して単独で install すれば、単一リポジトリだった頃と同じ形になり、これが
# 起きない。詳しくは 52 の docs/03。
#
set -euo pipefail

# **自分の絶対パスを先に確定させる。** cd したあとの `$0` は、相対パスで
# 呼ばれると解決できない (`./tommie-fence/doBuild.sh` のように呼ばれると死ぬ)。
script="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$script")"
root="$PWD"

run_checks=1
do_install=1
pkg=""
for arg in "$@"; do
  case "$arg" in
    --fast) run_checks=0 ;;
    --no-install) do_install=0 ;;
    -h|--help) sed -n '3,16p' "$script" | sed 's/^#\( \|$\)//'; exit 0 ;;
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

# 拡張を持つパッケージだけを並べる (fence-kit は .vsix にならない)。
extension_packages() {
  for dir in packages/*/; do
    name="$(basename "$dir")"
    if node -e "process.exit(require('./packages/$name/package.json').contributes ? 0 : 1)" 2>/dev/null; then
      echo "$name"
    fi
  done
}

# **拡張を持つものだけを受ける。** ディレクトリの有無だけ見ると、fence-kit を
# 渡されたときに写して install したあと vsce の中まで進んでから落ちる。
if [ -n "$pkg" ] && ! extension_packages | grep -qx "$pkg"; then
  echo "$pkg は .vsix にできません ($(extension_packages | tr '\n' ' ')から選んでください)" >&2
  exit 2
fi

# パッケージを書かなければ全部。1 つだけ作りたいときに名前を書く。
if [ -z "$pkg" ]; then
  packages="$(extension_packages)"
  if [ -z "$packages" ]; then
    echo "拡張を持つパッケージがありません" >&2
    exit 1
  fi
  echo "==> 全部作り直します: $(echo "$packages" | tr '\n' ' ')"
  for one in $packages; do
    echo
    echo "############ $one ############"
    "$script" "$one" "$@"
  done
  exit 0
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

# パッケージを 1 つ、作業場の中の同名の場所へ写す。
# dist と生成物は写さない。vsce が prepublish で作り直す。
copy_package() {
  mkdir -p "$stage/$1"
  tar -C "packages/$1" \
    --exclude=./node_modules --exclude=./dist --exclude=./coverage \
    --exclude='./*.vsix' --exclude='./*.tgz' \
    -cf - . | tar -C "$stage/$1" -xf -
}

# 依存のうち、このモノレポの中にあるもの (fence-kit など)。
workspace_deps() {
  node -p "
    const pkg = require('./packages/$1/package.json');
    const fs = require('fs');
    Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter((name) => fs.existsSync('packages/' + name))
      .join('\n')
  "
}

echo "==> $pkg を作業場へ写す"
copy_package "$pkg"

deps="$(workspace_deps "$pkg")"
if [ -n "$deps" ]; then
  echo "==> 同じモノレポの依存も写す: $(echo "$deps" | tr '\n' ' ')"
  for dep in $deps; do
    copy_package "$dep"
    # 作業場には workspaces の親が無いので `*` は npm を探しに行って失敗する。
    # 隣に置いた実体を file: で指す形に書き換える。
    node -e "
      const fs = require('fs');
      const f = '$stage/$pkg/package.json';
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const field of ['dependencies', 'devDependencies']) {
        if (j[field]?.['$dep']) j[field]['$dep'] = 'file:../$dep';
      }
      fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
    "
    # 入れ子の依存までは面倒を見ない。増えたらここで気づけるように止める。
    nested="$(workspace_deps "$dep")"
    if [ -n "$nested" ]; then
      echo "$dep がモノレポ内の依存を持っている ($nested)。写す順番を考える必要がある" >&2
      exit 1
    fi
  done
fi

echo "==> 作業場で依存を入れる (単独のリポジトリと同じ形にする)"
# devDependencies も要る。vsce が prepublish で esbuild を呼ぶため。
# パッケージが単体で install できる状態を保つのは、この段取りの前提。
# --install-links: file: の依存を実体で置く (symlink だと vsce が辿れない)。
(cd "$stage/$pkg" && npm install --install-links --no-audit --no-fund --silent)

# vsce は README の相対リンクを絶対 URL へ書き換える。基準の既定はリポジトリの
# 直下なので、モノレポでは `packages/<パッケージ>` の分だけ足りず、Marketplace と
# 拡張ページの図が 404 になる (単一リポジトリだった頃は既定で合っていた)。
# package.json の repository.directory から基準を作って渡す。
read -r base_content base_images <<<"$(node -p "
  const p = require('./packages/$pkg/package.json');
  const url = String(p.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git\$/, '');
  if (!url) throw new Error('packages/$pkg/package.json に repository.url がありません');
  const dir = p.repository?.directory ? '/' + p.repository.directory : '';
  [url + '/blob/HEAD' + dir, url + '/raw/HEAD' + dir].join(' ');
")"

echo "==> $vsix を作る (README の相対リンクの基準: $base_content)"
# vsce package が vscode:prepublish (esbuild --production) を呼ぶ。
(cd "$stage/$pkg" && npx vsce package \
  --baseContentUrl "$base_content" \
  --baseImagesUrl "$base_images" \
  --out "$out")

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

#!/usr/bin/env bash
#
# パッケージのバージョン番号を上げる。
#
# なぜ要るか: 番号の持ち主は package.json だが、core は Node を使えないので
# (各パッケージの CLAUDE.md 設計上の約束 1) src/core/version.ts が写しを定数で
# 持っている。手で直すと片方だけ上がる事故が起きる。写しがずれると図に古い
# 番号が焼き付くので、package.json・package-lock.json・写しを一度に書き換える。
#
# 版はパッケージごとに独立している。モノレポにしても番号は揃えない
# (揃えると、直していないパッケージまで版が上がって CHANGELOG が嘘になる)。
#
#   ./doVersion.sh circuit-fence           z を +1 する (0.1.0 → 0.1.1)
#   ./doVersion.sh circuit-fence minor     y を +1 して z を 0 に戻す (0.1.3 → 0.2.0)
#   ./doVersion.sh circuit-fence patch     引数なしと同じ (z を +1)
#   ./doVersion.sh circuit-fence 1.2.3     その番号にする
#   ./doVersion.sh -h                      この説明を出す
#
set -euo pipefail

cd "$(dirname "$0")"

HELP_LINES='3,17p'

if [ "${1-}" = "-h" ] || [ "${1-}" = "--help" ]; then
  sed -n "$HELP_LINES" "$0"
  exit 0
fi

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "使い方: ./doVersion.sh <パッケージ> [minor|patch|x.y.z]" >&2
  echo "パッケージ: $(ls packages | tr '\n' ' ')" >&2
  exit 2
fi

pkg="$1"
if [ ! -d "packages/$pkg" ]; then
  echo "packages/$pkg がありません ($(ls packages | tr '\n' ' ')から選んでください)" >&2
  exit 2
fi

COPY="packages/$pkg/src/core/version.ts"
if [ ! -f "$COPY" ]; then
  echo "$COPY がありません。写しの置き場が変わっていませんか" >&2
  exit 1
fi

spec=patch
case "${2-}" in
  '' | patch) spec=patch ;;
  minor) spec=minor ;;
  *)
    if [[ $2 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      spec="$2"
    else
      echo "知らない引数です: $2 (minor / patch / x.y.z が使えます)" >&2
      exit 2
    fi
    ;;
esac

old="$(node -p "require('./packages/$pkg/package.json').version")"

echo "==> package.json と package-lock.json を書き換える ($pkg $spec)"
# --no-git-tag-version: コミットもタグも npm には作らせない。
# 作業ブランチを切ってコミットするのはこちらの流儀。
# --workspace: パッケージの package.json と、リポジトリ直下の lock を両方直す。
npm version "$spec" --workspace="$pkg" --no-git-tag-version --allow-same-version >/dev/null

new="$(node -p "require('./packages/$pkg/package.json').version")"

echo "==> $COPY の写しを合わせる"
sed -i "s/^export const VERSION = '.*';$/export const VERSION = '$new';/" "$COPY"

if ! grep -q "^export const VERSION = '$new';\$" "$COPY"; then
  echo "$COPY を書き換えられませんでした。VERSION の行の形が変わっていませんか" >&2
  exit 1
fi

echo "==> 写しがずれていないか確かめる"
npm exec --workspace="$pkg" -- vitest run src/core/version.test.ts

echo
echo "==> $pkg $old → $new"

cd "packages/$pkg"
if grep -rFq -- "$old" README.md README.ja.md CHANGELOG.md docs/*.md 2>/dev/null; then
  echo "    まだ $old と書いてある文書があります (手で直してください):"
  grep -rFn -- "$old" README.md README.ja.md CHANGELOG.md docs/*.md 2>/dev/null |
    sed "s|^|      packages/$pkg/|"
fi
echo "    CHANGELOG.md の [Unreleased] を $new の節に移すのも手作業です"
echo "    タグはパッケージ名を接頭辞にします: $pkg-v$new"

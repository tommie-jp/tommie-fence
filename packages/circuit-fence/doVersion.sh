#!/usr/bin/env bash
#
# バージョン番号を上げる。
#
# なぜ要るか: 番号の持ち主は package.json だが、core は Node を使えないので
# (CLAUDE.md 設計上の約束 1) src/core/version.ts が写しを定数で持っている。
# 手で直すと片方だけ上がる事故が起きる。写しがずれると図に古い番号が焼き付く
# ので、package.json・package-lock.json・写しの 3 か所を一度に書き換える。
#
#   ./doVersion.sh           z を +1 する (0.1.0 → 0.1.1)
#   ./doVersion.sh minor     y を +1 して z を 0 に戻す (0.1.3 → 0.2.0)
#   ./doVersion.sh patch     引数なしと同じ (z を +1)
#   ./doVersion.sh 1.2.3     その番号にする
#   ./doVersion.sh -h        この説明を出す
#
set -euo pipefail

cd "$(dirname "$0")"

HELP_LINES='3,14p'
COPY=src/core/version.ts

if [ "$#" -gt 1 ]; then
  echo "引数は 1 つだけです: $*" >&2
  exit 2
fi

spec=patch
case "${1-}" in
  '' | patch) spec=patch ;;
  minor) spec=minor ;;
  -h | --help)
    sed -n "$HELP_LINES" "$0"
    exit 0
    ;;
  *)
    if [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      spec="$1"
    else
      echo "知らない引数です: $1 (minor / patch / x.y.z が使えます)" >&2
      exit 2
    fi
    ;;
esac

old="$(node -p "require('./package.json').version")"

echo "==> package.json と package-lock.json を書き換える ($spec)"
# --no-git-tag-version: コミットもタグも npm には作らせない。
# 作業ブランチを切ってコミットするのはこちらの流儀 (CLAUDE.md 運用ルール 1)。
npm version "$spec" --no-git-tag-version --allow-same-version >/dev/null

new="$(node -p "require('./package.json').version")"

echo "==> $COPY の写しを合わせる"
sed -i "s/^export const VERSION = '.*';$/export const VERSION = '$new';/" "$COPY"

if ! grep -q "^export const VERSION = '$new';\$" "$COPY"; then
  echo "$COPY を書き換えられませんでした。VERSION の行の形が変わっていませんか" >&2
  exit 1
fi

echo "==> 写しがずれていないか確かめる"
npx vitest run src/core/version.test.ts

echo
echo "==> $old → $new"

if grep -rFq -- "$old" README.md README.ja.md CHANGELOG.md docs/*.md; then
  echo "    まだ $old と書いてある文書があります (手で直してください):"
  grep -rFn -- "$old" README.md README.ja.md CHANGELOG.md docs/*.md | sed 's/^/      /'
fi
echo "    CHANGELOG.md の [Unreleased] を $new の節に移すのも手作業です"

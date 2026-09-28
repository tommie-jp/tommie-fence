#!/usr/bin/env bash
#
# リリースを一式で行う。版上げ・CHANGELOG の節・図の焼き直し・試験・コミット・
# main への push・タグ・Release の確認・Latest の付け直しまで。
#
# なぜ要るか: 手でやると、版の写し (doVersion.sh)、CHANGELOG の [Unreleased] の
# 移し替え、刻印の入った図、タグを 4 本以上まとめて送ると release.yml が
# 動かない件、Latest が最後にできたライブラリに移る件を、毎回思い出す必要がある。
#
#   ./doRelease.sh                         [Unreleased] に項目があるパッケージを並べるだけ
#   ./doRelease.sh circuit-fence=minor spectrum-fence=keep tommie-fence=minor
#                                          ローカルで版上げ〜コミットまで (push しない)
#   ./doRelease.sh --push circuit-fence=minor ...
#                                          main へ push し、タグを 1 本ずつ出して Release を待つ
#   ./doRelease.sh --push-only             上のローカルのコミットを後から出す
#   ./doRelease.sh -h                      この説明を出す
#
# 段階: minor / patch / x.y.z / keep (keep は今の版のまま出す = 初版)。
# 拡張 (tommie-fence) を含めると、最後に拡張の Release を Latest に付け直す。
#
set -euo pipefail

cd "$(dirname "$0")"

HELP_LINES='3,21p'
KEEP_PNG_LIST='.release-keep-png'   # 焼き直しても残す PNG (刻印が見える図) の一覧
SKIP_PKGS='playground'              # リリースしないパッケージ

die() { echo "doRelease: $*" >&2; exit 1; }

push=0; push_only=0; specs=()
for a in "$@"; do
  case "$a" in
    -h | --help) sed -n "$HELP_LINES" "$0" | sed 's/^#\( \|$\)//'; exit 0 ;;
    --push) push=1 ;;
    --push-only) push_only=1 ;;
    *=*) specs+=("$a") ;;
    *) die "知らない引数です: $a (pkg=minor / --push / -h)" ;;
  esac
done

unreleased_count() {
  awk '/^## \[Unreleased\]/{on=1;next} /^## \[/{on=0} on && /^- /{n++} END{print n+0}' \
    "packages/$1/CHANGELOG.md"
}

version_of() { node -p "require('./packages/$1/package.json').version"; }

# ---- 何も指定しなければ、出すべきパッケージを並べて終わる ----
if [ ${#specs[@]} -eq 0 ] && [ "$push_only" -eq 0 ]; then
  echo "[Unreleased] に項目があるパッケージ:"
  for d in packages/*/; do
    p="$(basename "$d")"
    case " $SKIP_PKGS " in *" $p "*) continue ;; esac
    [ -f "$d/CHANGELOG.md" ] || continue
    n="$(unreleased_count "$p")"
    [ "$n" -gt 0 ] && printf '  %-18s %s  (%s 項目)\n' "$p" "$(version_of "$p")" "$n"
  done
  echo
  echo "出すには: ./doRelease.sh <pkg>=<minor|patch|x.y.z|keep> ... [--push]"
  exit 0
fi

tags_file="$(git rev-parse --absolute-git-dir)/release-tags"   # 作業ツリーに置くと add -A で混ざる

# ---- 1. ローカル: 版上げ〜コミット ----
if [ "$push_only" -eq 0 ]; then
  [ -z "$(git status --porcelain)" ] || die "作業ツリーに未コミットの変更があります"
  git fetch -q origin
  git merge-base --is-ancestor origin/main HEAD || die "origin/main より古い枝です。rebase してから"

  today="$(date +%F)"
  : > "$tags_file"
  summary=()
  for s in "${specs[@]}"; do
    pkg="${s%%=*}"; level="${s#*=}"
    [ -d "packages/$pkg" ] || die "packages/$pkg がありません"
    [ "$(unreleased_count "$pkg")" -gt 0 ] || die "$pkg の [Unreleased] が空です"
    old="$(version_of "$pkg")"
    if [ "$level" != keep ]; then
      ./doVersion.sh "$pkg" "$level" >/dev/null
    fi
    ver="$(version_of "$pkg")"
    # 文書に書いた刻印の例 (`breadboard-fence 0.14.0`) を新しい版に合わせる。
    # 「名前 + 空白 + 版」の形だけを置き換え、CHANGELOG の過去の節には触らない
    if [ "$old" != "$ver" ]; then
      for f in packages/"$pkg"/README*.md packages/"$pkg"/docs/*.md; do
        if [ -f "$f" ]; then sed -i "s/$pkg ${old//./\\.}/$pkg $ver/g" "$f"; fi
      done
    fi
    git rev-parse -q --verify "refs/tags/$pkg-v$ver" >/dev/null && die "タグ $pkg-v$ver は既にあります"
    # [Unreleased] の中身を新しい節へ移し、空の [Unreleased] を残す
    node - "$pkg" "$ver" "$today" <<'EOF'
const fs = require('fs');
const [pkg, ver, day] = process.argv.slice(2);
const p = `packages/${pkg}/CHANGELOG.md`;
const s = fs.readFileSync(p, 'utf8');
if (!s.includes('## [Unreleased]')) throw new Error(`${p} に [Unreleased] がありません`);
fs.writeFileSync(p, s.replace('## [Unreleased]', `## [Unreleased]\n\n## [${ver}] - ${day}`));
EOF
    echo "$pkg-v$ver" >> "$tags_file"
    summary+=("$pkg $ver")
    echo "==> $pkg $ver"
  done

  echo "==> 図を焼き直す (刻印の版を合わせる)"
  npm run -s build >/dev/null
  for s in "${specs[@]}"; do
    pkg="${s%%=*}"
    for task in examples schematics docs; do
      if node -e "process.exit(require('./packages/$pkg/package.json').scripts?.['$task'] ? 0 : 1)"; then
        npm run -s "$task" --workspace="$pkg" >/dev/null
      fi
    done
  done
  # 焼き方の差で変わるだけの PNG は戻す。一覧にある PNG (刻印が見える図) だけ残す
  keep=()
  [ -f "$KEEP_PNG_LIST" ] && mapfile -t keep < <(grep -v '^\s*\(#\|$\)' "$KEEP_PNG_LIST")
  # 一覧を先に読み切ってから戻す (読みながら checkout すると index.lock がぶつかる)
  mapfile -t changed < <(git diff --name-only -- '*.png')
  for f in "${changed[@]}"; do
    case " ${keep[*]-} " in *" $f "*) continue ;; esac
    git checkout -q -- "$f"
  done
  # 新しく増えた図は残す (untracked のまま add される)

  echo "==> 試験"
  npm run -s check >/dev/null || die "npm run check が落ちました (コミットはしていません)"

  git add -A
  joined="$(printf '%s / ' "${summary[@]}")"
  msg="chore: 版を上げる (${joined% / })"
  git commit -q -m "$msg" -m "doRelease.sh で作った。"
  echo "==> コミット: $(git log --oneline -1)"
fi

[ "$push" -eq 1 ] || [ "$push_only" -eq 1 ] || { echo "push はしていません。出すには ./doRelease.sh --push-only"; exit 0; }

# ---- 2. 公開: main への push → タグを 1 本ずつ → Release を待つ ----
[ -s "$tags_file" ] || die "出すタグの一覧 ($tags_file) がありません。先にローカルの段を"
mapfile -t tags < "$tags_file"

echo "==> main へ push"
git push -q origin HEAD:main

wait_release() {  # タグの release.yml が終わるまで待つ
  local tag="$1" id=""
  for _ in $(seq 1 30); do
    id="$(gh run list --workflow release.yml --branch "$tag" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
    [ -n "$id" ] && break
    sleep 5
  done
  [ -n "$id" ] || die "$tag の release.yml が起動しません (gh run list --workflow release.yml で確かめて)"
  gh run watch "$id" --exit-status >/dev/null || die "$tag の Release が失敗しました (gh run view $id)"
}

latest=""
for tag in "${tags[@]}"; do
  echo "==> タグ $tag"
  # 途中で止まったあとの再実行: 既に出したタグは飛ばし、Release の完了だけ待つ
  if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    echo "    既に push 済み"
  else
    git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git tag "$tag"
    git push -q origin "refs/tags/$tag"   # 1 本ずつ (4 本以上まとめると release.yml が動かない)
  fi
  wait_release "$tag"
  case "$tag" in tommie-fence-v*) latest="$tag" ;; esac
done

# Latest は最後にできた Release に付くので、拡張の Release に付け直す
if [ -n "$latest" ]; then
  gh release edit "$latest" --latest >/dev/null
  echo "==> Latest: $latest"
fi
rm -f "$tags_file"
echo "==> 完了: ${tags[*]}"

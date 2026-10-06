#!/usr/bin/env bash
#
# リリースを一式で行う。版上げ・CHANGELOG の節・図の焼き直し・試験・コミット・
# main への push・タグ・Release の確認・Latest の付け直しまで。
#
# なぜ要るか: 手でやると、版の写し (doVersion.sh)、CHANGELOG の [Unreleased] の
# 移し替え、刻印の入った図、タグを 4 本以上まとめて送ると release.yml が
# 動かない件、Latest が最後にできたライブラリに移る件を、毎回思い出す必要がある。
#
#   ./doRelease.sh                  出すべきものを全部出す (下の「自動で決めること」)
#   ./doRelease.sh -n               何を出すかを並べるだけ (何も変えない)
#   ./doRelease.sh --no-push        ローカルで版上げ〜コミットまで (push しない)
#   ./doRelease.sh circuit-fence=minor tommie-fence=minor
#                                   出すものと段階を手で決める (段階: minor / patch /
#                                   x.y.z / keep。keep は今の版のまま出す = 初版)
#   ./doRelease.sh --push-only      コミット済みで、まだ出していないタグだけを出す
#   ./doRelease.sh -h               この説明を出す
#
# 自動で決めること (引数に pkg=段階 が無いとき):
#   - 出すのは [Unreleased] に項目があるパッケージ (playground は除く)
#   - 段階は [Unreleased] の小見出しで決める。Added / Changed / Removed / Deprecated
#     があれば minor、Fixed などだけなら patch。まだタグが 1 本も無ければ keep (初版)
#   - 拡張 (tommie-fence) が束ねるパッケージを出すなら、拡張も一緒に出す。拡張の
#     [Unreleased] が空なら「束ねるフェンスを上げた」の 1 行を足す
#   - 前回 push の途中で止まったタグ (.git/release-tags) があれば、それも出す
#
# 最後に、一番新しい拡張の Release を Latest に付け直す。
#
set -euo pipefail

cd "$(dirname "$0")"

HELP_LINES='3,28p'
KEEP_PNG_LIST='.release-keep-png'   # 焼き直しても残す PNG (刻印が見える図) の一覧
SKIP_PKGS='playground'              # リリースしないパッケージ
EXT='tommie-fence'                  # 拡張 (ほかのパッケージを束ねる)

die() { echo "doRelease: $*" >&2; exit 1; }

push=1; push_only=0; dry=0; specs=()
for a in "$@"; do
  case "$a" in
    -h | --help) sed -n "$HELP_LINES" "$0" | sed 's/^#\( \|$\)//'; exit 0 ;;
    -n | --dry-run) dry=1 ;;
    --push) push=1 ;;          # 既定。doDeploy.sh など前の書き方のために受ける
    --no-push) push=0 ;;
    --push-only) push_only=1 ;;
    *=*) specs+=("$a") ;;
    *) die "知らない引数です: $a (pkg=minor / -n / --no-push / --push-only / -h)" ;;
  esac
done

unreleased_count() {
  awk '/^## \[Unreleased\]/{on=1;next} /^## \[/{on=0} on && /^- /{n++} END{print n+0}' \
    "packages/$1/CHANGELOG.md"
}

version_of() { node -p "require('./packages/$1/package.json').version"; }

# [Unreleased] の小見出しから段階を決める (上の「自動で決めること」)
auto_level() {
  [ -n "$(git tag -l "$1-v*")" ] || { echo keep; return; }
  if awk '/^## \[Unreleased\]/{on=1;next} /^## \[/{on=0} on' "packages/$1/CHANGELOG.md" |
    grep -qE '^### (Added|Changed|Removed|Deprecated)'; then
    echo minor
  else
    echo patch
  fi
}

bundled_by_ext() {  # 拡張がこのパッケージを束ねるか
  node -e "const p=require('./packages/$EXT/package.json');
    process.exit({...p.dependencies,...p.devDependencies}['$1'] ? 0 : 1)"
}

tags_file="$(git rev-parse --absolute-git-dir)/release-tags"   # 作業ツリーに置くと add -A で混ざる
pending_tags() { [ -s "$tags_file" ] && cat "$tags_file" || true; }

# ---- 0. 段階を指定しなければ、出すものを [Unreleased] から決める ----
add_bundle_note=0   # 拡張の [Unreleased] に「束ねるフェンスを上げた」を足すか
if [ ${#specs[@]} -eq 0 ] && [ "$push_only" -eq 0 ]; then
  git fetch -q --tags origin
  ext_level=""
  for d in packages/*/; do
    p="$(basename "$d")"
    case " $SKIP_PKGS $EXT " in *" $p "*) continue ;; esac
    [ -f "$d/CHANGELOG.md" ] && [ "$(unreleased_count "$p")" -gt 0 ] || continue
    level="$(auto_level "$p")"
    specs+=("$p=$level")
    # 束ねるものが新しい機能 (minor・初版) を持つなら拡張も minor
    if bundled_by_ext "$p"; then
      case "$level" in minor | keep) ext_level=minor ;; *) ext_level="${ext_level:-patch}" ;; esac
    fi
  done
  if [ "$(unreleased_count "$EXT")" -gt 0 ]; then
    own="$(auto_level "$EXT")"
    case "$own" in minor | keep) ext_level="$own" ;; *) ext_level="${ext_level:-$own}" ;; esac
  elif [ -n "$ext_level" ]; then
    add_bundle_note=1
  fi
  [ -n "$ext_level" ] && specs+=("$EXT=$ext_level")   # 拡張は最後 (束ねる版が決まってから)

  mapfile -t pending < <(pending_tags)
  if [ ${#specs[@]} -eq 0 ] && [ ${#pending[@]} -eq 0 ]; then
    echo "出すものはありません ([Unreleased] はどれも空、止まったタグも無し)"
    exit 0
  fi
  [ ${#pending[@]} -gt 0 ] && echo "前回止まったタグ: ${pending[*]}"
  [ ${#specs[@]} -gt 0 ] && echo "出すもの: ${specs[*]}"
  [ "$add_bundle_note" -eq 1 ] && echo "  ($EXT の [Unreleased] に「束ねるフェンスを上げた」を足す)"
  [ "$dry" -eq 0 ] || exit 0
  [ ${#specs[@]} -gt 0 ] || push_only=1   # 止まったタグを出すだけ
elif [ "$dry" -eq 1 ]; then
  echo "出すもの: ${specs[*]:-(無し。止まったタグだけ: $(pending_tags | tr '\n' ' '))}"
  exit 0
fi

# ---- 1. ローカル: 版上げ〜コミット ----
if [ "$push_only" -eq 0 ]; then
  [ -z "$(git status --porcelain)" ] || die "作業ツリーに未コミットの変更があります"
  git fetch -q origin
  git merge-base --is-ancestor origin/main HEAD || die "origin/main より古い枝です。rebase してから"

  today="$(date +%F)"
  touch "$tags_file"   # 前回止まったタグは残したまま足す (まとめて出す)
  summary=()
  for s in "${specs[@]}"; do
    pkg="${s%%=*}"; level="${s#*=}"
    [ -d "packages/$pkg" ] || die "packages/$pkg がありません"
    if [ "$pkg" = "$EXT" ] && [ "$add_bundle_note" -eq 1 ]; then
      note="$(printf '%s / ' "${summary[@]}")"
      node - "$EXT" "${note% / }" <<'EOF'
const fs = require('fs');
const [pkg, list] = process.argv.slice(2);
const p = `packages/${pkg}/CHANGELOG.md`;
const s = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, s.replace('## [Unreleased]',
  `## [Unreleased]\n\n### Changed\n\n- **束ねるフェンスを上げた** (${list})。詳しくは各パッケージの CHANGELOG。`));
EOF
    fi
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

for tag in "${tags[@]}"; do
  echo "==> タグ $tag"
  # 途中で止まったあとの再実行: 既に出したタグは飛ばし、Release の完了だけ待つ
  if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    echo "    既に push 済み"
  else
    if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      # **打つ前に版を照らす。** 前回止まった回の続きでタグがローカルに無いと、今の HEAD
      # (次の版上げのあと) に打ってしまい、release.yml が版の食い違いで落ちる (52 の docs/118 の 4.8)。
      pkg="${tag%-v*}" ver="${tag##*-v}"
      have="$(node -p "require('./packages/$pkg/package.json').version")"
      [ "$have" = "$ver" ] || die "$tag を HEAD に打てません (packages/$pkg は $have)。版上げのコミットで git tag $tag <コミット> を打ってから ./doRelease.sh --push-only"
      git tag "$tag"
    fi
    git push -q origin "refs/tags/$tag"   # 1 本ずつ (4 本以上まとめると release.yml が動かない)
  fi
  wait_release "$tag"
done

# Latest は最後にできた Release に付くので、一番新しい拡張の Release に付け直す
# (拡張を出さない回でも。ライブラリだけ出すと Latest がライブラリに移る)
latest="$(git tag -l "$EXT-v*" --sort=-v:refname | head -1)"
if [ -n "$latest" ]; then
  gh release edit "$latest" --latest >/dev/null
  echo "==> Latest: $latest"
fi
rm -f "$tags_file"
echo "==> 完了: ${tags[*]}"

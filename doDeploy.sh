#!/usr/bin/env bash
#
# Release して、教科書 (tommie-circuit-workbook) が使うフェンスの版を上げるまでを一式で行う。
#
# なぜ要るか: Release しただけでは、教科書の package.json は古い版の tgz を指したまま。
# GitHub Pages の図は古い版で描かれ、VS Code のプレビュー (新しい拡張) と食い違う。
#
#   ./doDeploy.sh circuit-fence=minor tommie-fence=minor
#                              doRelease.sh --push のあと、教科書の版を上げて push
#   ./doDeploy.sh              Release はせず、教科書を今の最新の Release に揃えるだけ
#   ./doDeploy.sh --no-push …  教科書はコミットまで (push しない)
#   ./doDeploy.sh --book DIR … 教科書の置き場 (既定: この直下から見た ../tommie-circuit-workbook
#                              か、環境変数 WORKBOOK_DIR)
#   ./doDeploy.sh -h           この説明を出す
#
# 教科書の package.json にあるフェンスだけを上げる (使っていないフェンスは足さない)。
# 教科書の検査 (npm run all) が落ちたら、コミットせずに止まる。版上げで増えた
# お知らせは直さないので、落ちた所を直してから ./doDeploy.sh をもう一度。
#
set -euo pipefail

cd "$(dirname "$0")"
TF="$PWD"

HELP_LINES='3,19p'
die() { echo "doDeploy: $*" >&2; exit 1; }

book="${WORKBOOK_DIR:-$TF/../tommie-circuit-workbook}"
push=1; specs=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help) sed -n "$HELP_LINES" "$0" | sed 's/^#\( \|$\)//'; exit 0 ;;
    --no-push) push=0 ;;
    --book) shift; book="${1:?--book には置き場を}" ;;
    *=*) specs+=("$1") ;;
    *) die "知らない引数です: $1 (pkg=minor / --no-push / --book DIR / -h)" ;;
  esac
  shift
done

[ -f "$book/package.json" ] || die "教科書が見つかりません: $book (--book か WORKBOOK_DIR で指定)"
book="$(cd "$book" && pwd)"

# ---- 1. Release ----
if [ ${#specs[@]} -gt 0 ]; then
  echo "==> 1. Release: ${specs[*]}"
  ./doRelease.sh "${specs[@]}" --push
else
  echo "==> 1. Release はしない (教科書を今の最新に揃えるだけ)"
fi

# ---- 2. 教科書の版を上げる ----
echo "==> 2. 教科書: $book"
git fetch -q --tags origin
cd "$book"
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "教科書に未コミットの変更があります"
git pull -q --ff-only

# package.json の Release の URL を、各パッケージの最新のタグに書き換える
changes="$(TF="$TF" node - <<'EOF'
const fs = require('fs');
const { execSync } = require('child_process');
const pj = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const re = /releases\/download\/([a-z-]+)-v(\d+\.\d+\.\d+)\/\1-\2\.tgz$/;
const out = [];
for (const field of ['dependencies', 'devDependencies']) {
  for (const [name, url] of Object.entries(pj[field] ?? {})) {
    const m = re.exec(url);
    if (!m) continue;
    const [, pkg, ver] = m;
    const latest = execSync(
      `git -C "${process.env.TF}" tag -l "${pkg}-v*" --sort=-v:refname`,
      { encoding: 'utf8' }).split('\n')[0].replace(`${pkg}-v`, '');
    if (!latest || latest === ver) continue;
    pj[field][name] = url.replace(re, `releases/download/${pkg}-v${latest}/${pkg}-${latest}.tgz`);
    out.push(`${pkg} ${latest}`);
  }
}
if (out.length) fs.writeFileSync('package.json', JSON.stringify(pj, null, 2) + '\n');
console.log(out.join(' / '));
EOF
)"

if [ -z "$changes" ]; then
  echo "==> 教科書はもう最新の Release を使っています"
  exit 0
fi
echo "    $changes"

npm install --silent
echo "==> 3. 教科書の検査 (npm run all)"
if ! npm run -s all; then
  git checkout -q -- package.json package-lock.json
  npm install --silent   # node_modules も元の版へ
  die "教科書の検査が落ちました。版上げは戻しました (上のエラーを直してから、もう一度)"
fi

git add package.json package-lock.json
git commit -q -m "chore: フェンスの版を上げる ($changes)" -m "doDeploy.sh で作った。"
echo "==> コミット: $(git log --oneline -1)"
if [ "$push" -eq 1 ]; then
  git push -q origin HEAD:main
  echo "==> 教科書を push しました。Pages の図は CI が新しい版で描き直します"
else
  echo "==> push はしていません"
fi

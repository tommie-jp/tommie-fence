#!/usr/bin/env bash
#
# playground を手元のブラウザで動かす。
#
# なぜ要るか: dist を file:// で開いても動かない。app.js (ES モジュール) も
# examples.json も TeX の資材も**同じ出所 (origin)** を要るので、直に開くと
# CORS と fetch で断られ、例の一覧が空になり circuit の図が出ない。
# 組み立てとサーバ起動が 1 セットなので、その 1 セットをここに置く。
#
#   ./doPlayground.sh                 組み立ててから 8765 番で出す (既定)
#   ./doPlayground.sh --port 9000     番号を変える
#   ./doPlayground.sh --no-build      組み立てずに、今の dist をそのまま出す
#   ./doPlayground.sh --tailscale     tailnet からも開けるようにする (iPad・スマホ)
#   ./doPlayground.sh --stop          出しているサーバを止める (tailnet の道も畳む)
#   ./doPlayground.sh -h              この説明を出す
#
# 止めるのは Ctrl+C か、別の端末から ./doPlayground.sh --stop。
# **同じ番号で前に出した分は、始めるときに自分で畳む。** それでも塞がって
# いたら、誰が掴んでいるかを言って断る (python の例外を出さない)。
# **組み直したらブラウザを強制リロードする** (チャンク名が中身のハッシュなので、
# 古い app.js を持っていると消えた名前を取りに行って 404 になる)。
#
# --tailscale は tailscale serve に**同じ番号の HTTPS ポート**で出す
# (8765 番なら https://<この機械>:8765/)。**127.0.0.1 に出したまま**なので、
# 外に開くのは tailnet の中だけ。既にある道 (443 の / など) は触らない。
#
# 道 (/playground) ではなく**ポートを分ける**のは、道を分けると URL の末尾の /
# を落としたときに style.css や app.js を 1 つ上の階層に探しに行き、
# **別のサービスのファイルを掴んで黙って壊れる**ため (実測)。
set -euo pipefail

cd "$(dirname "$0")"
self="$(basename "$0")"

port=8765
do_build=1
do_stop=0
do_tailscale=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      port="${2-}"
      [ -n "$port" ] || { echo "--port には番号が要ります" >&2; exit 2; }
      shift
      ;;
    --port=*) port="${1#--port=}" ;;
    --no-build) do_build=0 ;;
    --tailscale) do_tailscale=1 ;;
    --stop) do_stop=1 ;;
    -h|--help) sed -n '3,21p' "$self" | sed 's/^#\( \|$\)//'; exit 0 ;;
    *) echo "知らない引数です: $1 (--port / --no-build / --tailscale / --stop)" >&2; exit 2 ;;
  esac
  shift
done

case "$port" in
  ''|*[!0-9]*) echo "番号が数ではありません: $port" >&2; exit 2 ;;
esac

# 出しっぱなしのサーバを畳む。**番号で見分ける** — 別の番号で出している
# playground は残す (2 つ並べて見比べることがある)。
# 出しっぱなしを畳む。**番号で見つけて、その中の `http.server` だけ止める。**
#
# 命令の字で探す (`pkill -f`) と、`--bind` を付けずに手で出したものを
# 取りこぼすうえ、**その字を含むだけの別のもの (打った端末そのものなど) まで
# 巻き込む** (実際に自分の親シェルを殺して踏んだ)。
# 番号で引けば取りこぼさず、`http.server` かどうかを見れば巻き込まない。
stop_server() {
  if ! command -v ss >/dev/null 2>&1; then
    pkill -f "http.server $port --bind" 2>/dev/null || true
    return
  fi
  local pid
  for pid in $(ss -ltnp 2>/dev/null | grep -E "[:.]${port}[[:space:]]" \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u); do
    # **こちらの出したものだけ。** 番号だけで殺すと、たまたま同じ番号を
    # 使っている別のものを巻き込む。
    if tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'http\.server'; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

# その番号を誰かが掴んでいるか。**確かめる手立てが無い機械では黙って進む**
# (確かめられないことを、使われている扱いにしない)。
port_taken() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1
  fi
}

# 掴んでいる相手の pid (分かれば)。
holder_pid() {
  command -v ss >/dev/null 2>&1 || return 0
  ss -ltnp 2>/dev/null | grep -E "[:.]${port}[[:space:]]" \
    | grep -oE 'pid=[0-9]+' | cut -d= -f2 | head -1
}

# 掴んでいる相手を「名前 (pid N)」で。**誰が塞いでいるかまで言う** —
# 「使われています」だけでは、次に何をすればよいか分からない。
port_holder() {
  local pid name
  pid="$(holder_pid)"
  [ -n "$pid" ] || return 0
  # **1 行に潰す。** 命令の字に改行が混ざっていると (python -c など)、
  # 断りの並びが崩れて読みにくい。
  name="$(tr '\0\n\t' '   ' < "/proc/$pid/cmdline" 2>/dev/null | tr -s ' ' | cut -c1-56)"
  [ -n "$name" ] || name="(名前を読めません)"
  echo "$name (pid $pid)"
}

# tailnet の口を畳む。**自分のポートだけ**を消すので、ほかの道 (443 の / など)
# は残る。入れていなくても叩けるように、断られても黙って進む。
stop_tailscale() {
  command -v tailscale >/dev/null 2>&1 || return 0
  tailscale serve --https="$port" off >/dev/null 2>&1 || true
}

# tailnet に出す。**127.0.0.1 のサーバへの入口を足すだけ** (出所は変えない)。
start_tailscale() {
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "tailscale がありません (--tailscale は使えません)" >&2
    return 1
  fi
  if ! tailscale serve --bg --https="$port" "http://127.0.0.1:$port" >/dev/null; then
    echo "tailnet に出せませんでした (tailscale up は済んでいますか)" >&2
    return 1
  fi
  # この機械の tailnet 名は serve の控えが知っている。
  local host
  host="$(tailscale serve status 2>/dev/null | sed -n 's|^https://\([^ :/]*\).*|\1|p' | head -1)"
  if [ -n "$host" ]; then
    echo "tailnet からは https://$host:$port/ を開いてください (QR ボタンが使えます)"
  fi
}

if [ "$do_stop" -eq 1 ]; then
  stop_server
  stop_tailscale
  echo "$port 番のサーバを止めました (tailnet の口も畳みました)"
  exit 0
fi

dist="packages/playground/dist"

if [ "$do_build" -eq 1 ]; then
  npm run build --workspace=playground
fi

if [ ! -f "$dist/index.html" ]; then
  echo "$dist/index.html がありません (--no-build を外して組み立ててください)" >&2
  exit 1
fi

# 前に出したものが残っていると「番号が使われています」で落ちるので、先に畳む。
stop_server

# **畳んでも塞がっているなら、こちらの出したものではない。** そのまま python に
# 投げると意味の取りにくい例外 (Address already in use のスタック) が出るので、
# その手前で、誰が掴んでいるかを言って断る。
if port_taken; then
  {
    echo "$port 番は既に使われています。"
    holder="$(port_holder)"
    [ -n "$holder" ] && echo "  掴んでいるのは: $holder"
    echo
    echo "  別の番号で出すなら  ./$self --port 8766"
    pid="$(holder_pid)"
    if [ -n "$pid" ]; then
      echo "  その相手を止めるなら kill $pid"
    fi
    echo
    echo "(この番号で前に出した $self は自分で畳みます。"
    echo " ここまで来たのは、別のものが掴んでいるときです)"
  } >&2
  exit 2
fi

echo "http://127.0.0.1:$port/ を開いてください (止めるのは Ctrl+C)"
if [ "$do_tailscale" -eq 1 ]; then
  start_tailscale || true
  # Ctrl+C で止めたときも道を畳む (出しっぱなしにしない)。
  trap 'stop_tailscale' EXIT INT TERM
fi
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dist"

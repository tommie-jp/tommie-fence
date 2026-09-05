# tommie-fence のビルド。**何をいつ作り直すかはここが決める。**
#
#   make                        .vsix を全部作る (変わったものだけ)
#   make install                上に加えて VS Code に入れ直す (doBuild.sh の既定)
#   make circuit-fence          1 つだけ作る
#   make tommie-fence           3 つを畳んだ拡張を作る (既定では作らない。52 の docs/19)
#   make install-circuit-fence  1 つだけ作って入れ直す
#   make check                  型チェックとテスト (全パッケージ)
#   make CHECK=0 install        チェックを飛ばす (描画を何度も見比べるとき)
#   make clean                  作り直しの記録・作業場・.vsix を捨てる
#   make help                   この説明を出す
#
# なぜ Make か: 作り直しが要るかどうかは「入力の方が新しいか」で決まる。これを
# シェルで自前に持つと、結局は毎回全部作り直すことになる (以前がそうだった)。
# Make に任せると、触っていないパッケージは丸ごと飛ばせて、3 つを並べて走らせられる。
# 実測 (このリポジトリ): 全部 26 秒 → 変更なし 0.1 秒 / 1 つ直したとき 5 秒 /
# 全部作り直しても 10 秒。
#
# 詰め方 (作業場へ写して単独で install する理由) は scripts/vsix.sh に書いてある。

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

BUILD ?= .build
JOBS  ?= $(shell nproc 2>/dev/null || echo 4)
CHECK ?= 1
export BUILD

# 入れ直したあとの一言。VS Code は読み込み直すまで前のビルドのまま動く。
# 作り直しが無かったときも出す (「今入っているのは最新か」への答えになる)。
RELOAD_HINT := '==> 入っているのは今の .vsix です。ウィンドウを読み込み直してください (Ctrl+Shift+P →「Developer: Reload Window」)'

# パッケージどうしに依存が無いので、既定で並べて走らせる。
# --output-sync=target: 並べても、1 つのパッケージの出力はひとまとまりで出る。
MAKEFLAGS += --jobs=$(JOBS) --output-sync=target --no-builtin-rules
.SUFFIXES:

# 途中で失敗した .vsix を残さない (次に作り直せなくなるため)。
.DELETE_ON_ERROR:

# 入力ファイルの一覧は git に出してもらう。find で数えると、dist や node_modules や
# .vsix を除く条件をここと .gitignore の 2 か所で持つことになる。
ifeq ($(strip $(shell git rev-parse --is-inside-work-tree 2>/dev/null)),)
$(error git のある作業ツリーで実行してください (入力の一覧に git ls-files を使います))
endif

# パッケージの入力ファイル。追跡されているものと、まだ追跡されていないが
# .gitignore にも載っていないもの (書いたばかりのソース) の両方を数える。
# core.quotepath=off: 既定では日本語のファイル名が "\346\274\242..." に化けて、
# Make が同じ名前のファイルを探しに行って落ちる (docs/ の見出しが日本語なので踏む)。
# $(wildcard): 消したがまだ `git rm` していないファイルを落とす。落とさないと
# 「そんなファイルを作る規則は無い」と言って Make が止まる (消した日に必ず踏む)。
sources = $(wildcard $(shell git -c core.quotepath=off ls-files \
            --cached --others --exclude-standard -- packages/$(1)))

# 空白を含むファイル名は Make の前提条件に書けない (2 つに割れて、片方が
# 「そんなファイルは無い」になる)。置いてしまった日に黙って通さない。
space_in_names := $(shell git -c core.quotepath=off ls-files --cached --others --exclude-standard -- packages | grep ' ' | head -1)
ifneq ($(strip $(space_in_names)),)
$(error ファイル名に空白があります ($(space_in_names))。Make が入力として数えられません)
endif

# パッケージ一覧・.vsix の名前・モノレポ内の依存は package.json から作る。
# clean と help **だけ**を頼まれたときは要らない (作ってすぐ消すことになる)。
# 「だけ」が肝: `make clean install` でも飛ばすと EXTENSIONS が空のまま進み、
# 全部消したうえで何も作らずに「入っているのは今の .vsix です」と言う。
ifneq ($(filter-out clean help,$(or $(MAKECMDGOALS),all)),)
include $(BUILD)/packages.mk
endif

$(BUILD)/packages.mk: $(wildcard packages/*/package.json) scripts/packages.mjs
	@mkdir -p $(@D)
	@node scripts/packages.mjs > $@

# **畳む前の 3 つ。** 入れ直す前に消す — 残っていると文法もプレビューも二重に
# 登録され、図が 2 つ出る (52 の docs/19)。手で消してもらう手順を README に
# 書くだけだと、忘れたときの壊れ方が分かりにくい。
# 入っていなければ何も起きない (`|| true`)。
RETIRED := tommie.circuit-fence tommie.breadboard-fence tommie.perfboard-fence

KIT_SOURCES := $(call sources,fence-kit)
VSIX_FILES  := $(foreach p,$(EXTENSIONS),packages/$(p)/$(VSIX_$(p)))

# --- パッケージごとの規則 ---------------------------------------------------

# **入力の一覧そのものも入力に数える。** Make は「消えた前提条件」に気づけない。
# 一覧を持たないと、ファイルを 1 つ消しただけのとき (例で使わなくなった図を
# 片付けたときなど) に、古いものが入ったままの .vsix が残る。
# 中身が変わったときだけ書き換える。毎回書き換えると毎回作り直しになる。
.PHONY: FORCE
FORCE:

$(BUILD)/%/sources.list: FORCE
	@mkdir -p $(@D)
	@printf '%s\n' $(call sources,$*) | sort > $@.new
	@cmp -s $@.new $@ || mv $@.new $@
	@rm -f $@.new

# パターン規則で作ったファイルは既定で「途中の産物」と見なされて消される。
# 消されると次に必ず作り直しになるので残す。
.PRECIOUS: $(BUILD)/%/sources.list

KIT_LIST := $(BUILD)/fence-kit/sources.list

# **段取りそのものも入力に数える。** 詰め方を直したのに作り直しが走らないと、
# 古い経路で作った .vsix が入ったまま残る。
BUILD_RULES := Makefile scripts/vsix.sh

# **VS Code への入れ直しだけは 1 つずつ。** `code --install-extension` は
# extensions.json を読んで書き直すので、3 つ同時に呼ぶと取りこぼす
# (最後に書いたものだけが残り、他の拡張が一覧から消える)。
# flock が無い環境 (macOS など) では素通し。並べても壊れるのは一覧だけで、
# 入れ直せば戻る。
CODE_LOCK := $(if $(shell command -v flock 2>/dev/null),flock $(BUILD)/code-install.lock,)

# 型チェックとテスト。通ったら印を置く。ソースが変わらなければ二度と走らない。
# fence-kit のソースも入力に数える。束ねて 1 つの .vsix になるので、あちらを
# 直したらこちらのテストも通し直す必要がある。
define check_rules

$$(BUILD)/$(1)/check.stamp: $$(call sources,$(1)) $$(KIT_SOURCES) \
                           $$(BUILD)/$(1)/sources.list $$(KIT_LIST) $$(BUILD_RULES)
	@mkdir -p $$(@D)
	npm run check --workspace=$(1)
	@touch $$@

.PHONY: check-$(1)
check-$(1): $$(BUILD)/$(1)/check.stamp

endef

define extension_rules

# 作業場に依存を入れる。**manifest が変わったときだけ**やり直す。
$$(BUILD)/$(1)/install.stamp: packages/$(1)/package.json \
                              $$(foreach d,$$(WSDEPS_$(1)),packages/$$(d)/package.json) \
                              $$(BUILD_RULES)
	@mkdir -p $$(@D)
	scripts/vsix.sh install $(1)
	@touch $$@

packages/$(1)/$$(VSIX_$(1)): $$(call sources,$(1)) $$(KIT_SOURCES) \
                             $$(BUILD)/$(1)/sources.list $$(KIT_LIST) \
                             $$(BUILD)/$(1)/install.stamp $$(BUILD_RULES) \
                             $$(if $$(filter 0,$$(CHECK)),,$$(BUILD)/$(1)/check.stamp)
	scripts/vsix.sh package $(1) $$@

# バージョン番号を上げずに中身だけ差し替えるので --force が要る。
$$(BUILD)/$(1)/installed.stamp: packages/$(1)/$$(VSIX_$(1))
	@mkdir -p $$(@D)
	@command -v code >/dev/null 2>&1 || { \
	  echo "==> code コマンドが PATH にありません。$$< を手で入れてください" >&2; \
	  echo "    拡張ビュー (Ctrl+Shift+X) の右上 ... → 「VSIX からのインストール」" >&2; \
	  exit 1; \
	}
	@$$(foreach old,$$(RETIRED),$$(CODE_LOCK) code --uninstall-extension $$(old) >/dev/null 2>&1 || true;)
	$$(CODE_LOCK) code --install-extension $$< --force
	@touch $$@

.PHONY: $(1) install-$(1)
$(1): packages/$(1)/$$(VSIX_$(1))
install-$(1): $$(BUILD)/$(1)/installed.stamp
	@echo $$(RELOAD_HINT)

endef

$(foreach p,$(PACKAGES),$(eval $(call check_rules,$(p))))
$(foreach p,$(EXTENSIONS) $(HELD),$(eval $(call extension_rules,$(p))))

# --- まとめた目標 -----------------------------------------------------------

.PHONY: all
all: $(VSIX_FILES)

.PHONY: install
install: $(foreach p,$(EXTENSIONS),$(BUILD)/$(p)/installed.stamp)
	@echo $(RELOAD_HINT)

.PHONY: check
check: $(foreach p,$(PACKAGES),$(BUILD)/$(p)/check.stamp)

# doBuild.sh が名前の間違いを見つけるのに使う。
.PHONY: print-extensions
print-extensions:
	@echo $(EXTENSIONS)

.PHONY: clean
clean:
	rm -rf $(BUILD)
	rm -f packages/*/*.vsix

.PHONY: help
help:
	@sed -n '3,10p' $(firstword $(MAKEFILE_LIST)) | sed 's/^#\( \|$$\)//'

.DEFAULT_GOAL := all

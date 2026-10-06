/**
 * 1 つのフェンスに複数の基板 (枚) を持たせる (52 の docs/118)。
 *
 * **枚ごとの図は今までの 1 枚の図のまま描く。** このファイルがするのは
 * (1) `sheets:` を見つけて枚ごとの YAML に切り分ける、(2) 枚ごとに描いた SVG を縦に積む、
 * (3) 枚ごとのネットリストを `links:` でつなぐ、の 3 つだけ。`sheets:` を書かない図は
 * ここを通らない (後方互換)。
 *
 * **盤面には依らない。** 切り分けは行ごとの走査 (YAML の写しを作らない) なので、
 * 枚の中の行番号は元のフェンスの行へ戻せる。
 */
import type { Net } from './nets.ts';
import { wireColor } from './colors.ts';
import { linkColorOf, planLinks } from './sheetLinks.ts';
import type { LinkLook, SheetPoint, StackLink } from './sheetLinks.ts';

/** 枚の外 (一番外側) に書けるキー。`board` と `style` は枚が書かなかったときの既定になる。 */
export const SHEET_TOP_KEYS = ['title', 'sheets', 'links', 'board', 'style'] as const;
const SHARED_KEYS = ['board', 'style'] as const;

/** フェンスごとに足せる、枚が書かなかったときの既定になるキー (copper の `f:` など)。 */
export type SheetOptions = { readonly shared?: readonly string[] };

/** 枚どうしの間の隙間 (SVG の単位)。**どこまでが 1 枚か**が一目で分かる幅。 */
const SHEET_GAP = 32;

/** これより多い枚はお知らせする。縦に積むと画面何個ぶんにもなり、「図NN」で指しにくい。 */
export const SHEETS_ADVISED = 3;

type TopBlock = { readonly key: string; readonly rest: string; readonly start: number; readonly end: number };

export type SheetSource = {
  readonly name: string;
  /** その枚だけの YAML (インデントを外してある)。 */
  readonly text: string;
  /** 元のフェンスでの先頭の行 (1 始まり)。枚の行 k は元の行 `firstLine + k - 1`。 */
  readonly firstLine: number;
  /** 既定 (`board:` `style:`) を足す前の行数。これより後ろの行は足した既定の行。 */
  readonly ownLines: number;
  /** 足した既定の行 → 元の行 (足した行は共通のキーの行を指す)。 */
  readonly sharedLine: number | null;
};

/** 枚をまたぐ線。`color` は書いた色の名前 (書かなければ節点の名前で決める)。 */
export type SheetLink = { readonly tokens: readonly string[]; readonly line: number; readonly color?: string | null };
export type SheetProblem = { readonly message: string; readonly line: number | null };

export type SheetSplit = {
  readonly sheets: readonly SheetSource[];
  readonly links: readonly SheetLink[];
  readonly problems: readonly SheetProblem[];
  /** `sheets:` の行 (1 始まり)。 */
  readonly sheetsLine: number | null;
};

const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/;
const ITEM_LINE = /^(\s*)-(?:\s+|$)/;

const blocksOf = (lines: readonly string[]): TopBlock[] => {
  const keyed = lines.flatMap((line, index) => {
    const match = KEY_LINE.exec(line);
    return match === null ? [] : [{ key: match[1] ?? '', rest: (match[2] ?? '').trim(), start: index }];
  });
  return keyed.map((one, at) => ({ ...one, end: keyed[at + 1]?.start ?? lines.length }));
};

/** 空行と注釈だけの行。 */
const isBlank = (line: string): boolean => line.trim() === '' || line.trim().startsWith('#');

/** `sheets:` を一番外側のキーに書いているフェンスか。 */
export function hasSheets(source: string): boolean {
  return blocksOf(source.split('\n')).some((block) => block.key === 'sheets');
}

const unquote = (text: string): string => {
  const trimmed = text.trim();
  const quote = trimmed[0];
  return trimmed.length >= 2 && (quote === '"' || quote === "'") && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
};

const hasTopKey = (lines: readonly string[], key: string): boolean =>
  lines.some((line) => {
    const match = KEY_LINE.exec(line);
    return match !== null && match[1] === key;
  });

/** 名前に使えない字 (links の `枚.ネット` で区切れなくなる)。 */
const BAD_NAME = /[\s.]/;

function splitItems(lines: readonly string[], block: TopBlock): { items: { from: number; to: number }[]; stray: number | null } {
  let indent: number | null = null;
  const starts: number[] = [];
  let stray: number | null = null;
  for (let at = block.start + 1; at < block.end; at += 1) {
    const line = lines[at] ?? '';
    const match = ITEM_LINE.exec(line);
    if (match !== null && (indent === null || (match[1] ?? '').length === indent)) {
      indent ??= (match[1] ?? '').length;
      starts.push(at);
    } else if (starts.length === 0 && !isBlank(line)) {
      stray ??= at;
    }
  }
  const items = starts.map((from, i) => {
    let to = starts[i + 1] ?? block.end;
    // 次の項目までの空行と注釈は、前の項目ではなく間の字として落とす。
    while (to > from + 1 && isBlank(lines[to - 1] ?? '')) to -= 1;
    return { from, to };
  });
  return { items, stray };
}

/**
 * フェンスを枚に切り分ける。`sheets:` が無いときは呼ばないこと (`hasSheets`)。
 * 読めなかったところは `problems` に行番号つきで返し、読めた枚は返す。
 */
export function splitSheets(source: string, extra: SheetOptions = {}): SheetSplit {
  const sharedKeys: readonly string[] = [...SHARED_KEYS, ...(extra.shared ?? [])];
  const lines = source.split('\n');
  const blocks = blocksOf(lines);
  const problems: SheetProblem[] = [];
  const shared = new Map<string, { readonly lines: readonly string[]; readonly line: number }>();
  const links: SheetLink[] = [];
  let figureTitle: string | null = null;
  let sheetsLine: number | null = null;
  const raw: { readonly name: string | null; readonly lines: string[]; readonly firstLine: number }[] = [];

  for (const block of blocks) {
    const line = block.start + 1;
    if (block.key === 'sheets') {
      sheetsLine ??= line;
      if (block.rest !== '') {
        problems.push({ message: 'sheets: は次の行から `- ` で枚を並べて書きます (1 行に並べる書き方は使えません)', line });
        continue;
      }
      const { items, stray } = splitItems(lines, block);
      if (stray !== null) problems.push({ message: 'sheets: の下は `- ` で始まる枚の並びにします', line: stray + 1 });
      if (items.length === 0) problems.push({ message: 'sheets: に枚が 1 つもありません (`- ` で始めて、枚の中身を書きます)', line });
      for (const item of items) {
        const first = lines[item.from] ?? '';
        const marker = ITEM_LINE.exec(first)?.[0].length ?? 2;
        const body = lines.slice(item.from, item.to).map((text, at) => {
          if (at === 0) return text.slice(marker);
          const lead = /^\s*/.exec(text)?.[0].length ?? 0;
          return text.slice(Math.min(marker, lead));
        });
        raw.push({ name: null, lines: body, firstLine: item.from + 1 });
      }
    } else if (block.key === 'links') {
      if (block.rest !== '') {
        problems.push({ message: 'links: は次の行から `- ` で 1 本ずつ並べて書きます', line });
        continue;
      }
      const { items, stray } = splitItems(lines, block);
      if (stray !== null) problems.push({ message: 'links: の下は `- ` で始まる並びにします', line: stray + 1 });
      for (const item of items) {
        const text = (lines[item.from] ?? '').replace(ITEM_LINE, '').replace(/\s+#.*$/, '');
        const tokens = unquote(text).split(/\s+/).filter((t) => t !== '');
        // 末尾の色の名前 (`red`) は線の色。`.` を含まない語で、色の名前として読めるものだけ。
        const last = tokens[tokens.length - 1] ?? '';
        const color = !last.includes('.') && wireColor(last) !== null ? last : null;
        links.push({ tokens: color === null ? tokens : tokens.slice(0, -1), line: item.from + 1, color });
      }
    } else if (block.key === 'title') {
      figureTitle = unquote(block.rest.replace(/\s+#.*$/, ''));
    } else if (sharedKeys.includes(block.key)) {
      if (shared.has(block.key)) {
        problems.push({ message: `${block.key}: が 2 つあります`, line });
        continue;
      }
      let end = block.end;
      while (end > block.start + 1 && isBlank(lines[end - 1] ?? '')) end -= 1;
      shared.set(block.key, { lines: lines.slice(block.start, end), line });
    } else {
      problems.push({
        message: `複数の基板を書くフェンスの一番外側に書けるのは ${[...SHEET_TOP_KEYS, ...(extra.shared ?? [])].join(' / ')} だけです: ${block.key} (枚の中に書きます)`,
        line,
      });
    }
  }

  const taken = new Set<string>();
  /**
   * 枚の題。**末尾に必ず `(N枚め)` を付ける** — 本文から「図01 (2枚め)」と指せ、
   * 名前を書いた枚と書かなかった枚で題の形が変わらない。枚の名前があれば外の
   * `title:` に `・名前` で続ける。枚が自分で `title:` を書けば、その題に付ける。
   */
  const titleLine = (base: string | null, index: number): string => {
    const nth = `(${index + 1}枚め)`;
    return `title: ${JSON.stringify(base === null || base === '' ? `${index + 1}枚め` : `${base} ${nth}`)}`;
  };
  const sheets = raw.map((one, index): SheetSource => {
    const body = [...one.lines];
    let name: string | null = null;
    const titled = hasTopKey(body, 'title');
    for (let at = 0; at < body.length; at += 1) {
      const match = /^name:(.*)$/.exec(body[at] ?? '');
      if (match === null) continue;
      name = unquote((match[1] ?? '').replace(/\s+#.*$/, ''));
      // 枚が `title:` を持つならそちらを使う。
      body[at] = titled || name === '' ? '' : titleLine(figureTitle === null ? name : `${figureTitle}・${name}`, index);
      break;
    }
    if (titled) {
      // 枚が書いた題にも `(N枚め)` を付ける。行の数は変えない (行番号を元のフェンスへ戻すため)。
      const at = body.findIndex((text) => /^title:/.test(text));
      body[at] = titleLine(unquote((body[at] ?? '').slice('title:'.length).replace(/\s+#.*$/, '')), index);
    }
    // **名前を書かなかった枚は `1枚め` `2枚め`。** links でもこの名前で指す。
    const unnamed = name === null || name === '';
    const sheetName = unnamed ? `${index + 1}枚め` : name ?? '';
    if (BAD_NAME.test(sheetName)) {
      problems.push({ message: `枚の名前に空白と . は使えません (links で枚と節点を区切るため): ${sheetName}`, line: one.firstLine });
    }
    if (taken.has(sheetName)) {
      problems.push({ message: `枚の名前が重なっています: ${sheetName}`, line: one.firstLine });
    }
    taken.add(sheetName);

    const ownLines = body.length;
    const extra: string[] = [];
    if (unnamed && !titled) extra.push(titleLine(figureTitle, index));
    let sharedLine: number | null = null;
    for (const key of sharedKeys) {
      const block = shared.get(key);
      if (block === undefined || hasTopKey(body, key)) continue;
      extra.push(...block.lines);
      sharedLine ??= block.line;
    }
    return {
      name: sheetName,
      text: [...body, ...extra].join('\n'),
      firstLine: one.firstLine,
      ownLines,
      sharedLine,
    };
  });
  return { sheets, links, problems, sheetsLine };
}

/** 枚の中の行 (1 始まり) を元のフェンスの行へ戻す。 */
export const sourceLineOf = (sheet: SheetSource, line: number): number =>
  line > sheet.ownLines && sheet.sharedLine !== null ? sheet.sharedLine : sheet.firstLine + line - 1;

// ---- ネットリスト ----

type SheetNets = { readonly sheet: string; readonly nets: readonly Net[] };

const netId = (sheet: string, name: string): string => `${sheet}.${name}`;

/**
 * 枚ごとのネットリストを 1 つにする。**枚の名前を頭に付けて**ネットの名前と
 * ストリップを区別し (どの枚にも `N1` がある)、`links:` で名指された組だけを 1 つに併せる。
 */
export function mergeNetlists(
  parts: readonly SheetNets[],
  links: readonly SheetLink[],
): { readonly netlist: Net[]; readonly problems: readonly SheetProblem[] } {
  const problems: SheetProblem[] = [];
  const all = parts.flatMap(({ sheet, nets }) => nets.map((net) => ({ sheet, net })));
  const parent = new Map(all.map(({ sheet, net }) => [netId(sheet, net.name), netId(sheet, net.name)]));
  const find = (id: string): string => {
    let root = id;
    for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) root = next;
    return root;
  };
  const written = new Map<string, string>();
  const labelled: { readonly ids: readonly string[]; readonly label: string }[] = [];

  for (const link of links) {
    const ids: string[] = [];
    for (const token of link.tokens) {
      const dot = token.indexOf('.');
      const sheet = dot < 0 ? '' : token.slice(0, dot);
      const name = dot < 0 ? '' : token.slice(dot + 1);
      const found = parts.find((part) => part.sheet === sheet);
      if (dot < 0 || name === '') {
        problems.push({ message: `links は 枚の名前.節点の名前 で書きます: ${token}`, line: link.line });
      } else if (found === undefined) {
        problems.push({
          message: `links が指す枚がありません: ${token} (枚: ${parts.map((p) => p.sheet).join(' / ')})`,
          line: link.line,
        });
      } else if (!found.nets.some((net) => net.name === name)) {
        problems.push({
          message: `links が指す節点が ${sheet} にありません: ${name} (節点は points: に書いた名前、あるいはネットの名前: ${found.nets.map((n) => n.name).join(' / ') || 'なし'})`,
          line: link.line,
        });
      } else {
        ids.push(netId(sheet, name));
        written.set(netId(sheet, name), token);
      }
    }
    if (link.tokens.length < 2) {
      problems.push({ message: 'links は 2 つ以上の節点を並べます (例: - 電源.GND アンプ.GND)', line: link.line });
    }
    const [head, ...rest] = ids;
    if (head === undefined) continue;
    const first = written.get(head) ?? head;
    for (const id of rest) parent.set(find(id), find(head));
    // 併せた名前は、全部同じ名前ならその名前、違うなら先頭に書いたもの。
    const names = ids.map((id) => id.slice(id.indexOf('.') + 1));
    const label = names.every((n) => n === names[0]) ? names[0] ?? first : first;
    labelled.push({ ids, label });
  }

  const groups = new Map<string, { net: Net; sheet: string }[]>();
  for (const one of all) {
    const root = find(netId(one.sheet, one.net.name));
    groups.set(root, [...(groups.get(root) ?? []), one]);
  }
  const netlist = [...groups].map(([root, members]): Net => {
    const [only] = members;
    const merged = members.length > 1;
    const label = labelled.find((one) => one.ids.some((id) => find(id) === root))?.label;
    return {
      name: merged && label !== undefined ? label : netId(only?.sheet ?? '', only?.net.name ?? ''),
      strips: members.flatMap(({ sheet, net }) => net.strips.map((strip) => `${sheet}/${strip}`)),
      refs: members.flatMap(({ net }) => net.refs),
    };
  });
  return { netlist, problems };
}

// ---- 図 ----

type Frame = { readonly attrs: string; readonly inner: string; readonly width: number; readonly height: number };

const attrOf = (attrs: string, name: string): string | null =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;

function frameOf(svg: string): Frame | null {
  const open = /^<svg\b([^>]*)>/.exec(svg);
  const close = svg.lastIndexOf('</svg>');
  if (open === null || close < 0) return null;
  const attrs = open[1] ?? '';
  const box = (attrOf(attrs, 'viewBox') ?? '').split(/\s+/).map(Number);
  const width = Number(attrOf(attrs, 'width') ?? box[2]);
  const height = Number(attrOf(attrs, 'height') ?? box[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { attrs, inner: svg.slice(open[0].length, close), width, height };
}

/** 枚ごとに同じ id (網の `hatch-…` など) が出ても取り違えないよう、id と参照に枚の番号を付ける。 */
function prefixIds(inner: string, index: number): string {
  const ids = [...inner.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] ?? '');
  return ids.reduce((text, id) => {
    const next = `s${index}-${id}`;
    return text.replaceAll(`id="${id}"`, `id="${next}"`)
      .replaceAll(`url(#${id})`, `url(#${next})`)
      .replaceAll(`href="#${id}"`, `href="#${next}"`);
  }, inner);
}

const roundNum = (value: number): string => String(Math.round(value * 100) / 100);

/** 枚をまたぐ線を描くのに要るもの。`links` の `sheet` は `svgs` の添字。 */
export type StackOptions = { readonly links: readonly StackLink[]; readonly look: LinkLook };

/**
 * 枚ごとの SVG を左を揃えて縦に積む。**1 枚も描けなかったときは空文字列。**
 * `options` を渡すと、枚をまたぐ線と札を左右の通り道に描く (`sheetLinks.ts`)。
 */
export function stackSheets(svgs: readonly string[], options: StackOptions | null = null): string {
  const frames = svgs.map(frameOf).map((frame, index) => ({ frame, index })).filter(
    (one): one is { frame: Frame; index: number } => one.frame !== null,
  );
  if (frames.length === 0) return '';
  const width = Math.max(...frames.map(({ frame }) => frame.width));
  let top = 0;
  const tops = frames.map(({ frame }) => {
    const at = top;
    top += frame.height + SHEET_GAP;
    return at;
  });
  const height = top - SHEET_GAP;
  // 線の端は枚の viewBox の単位で来る。積んだ図の単位へ直す倍率 (`style: width:` で縮めた枚)。
  const placedFrames = svgs.map((_, index) => {
    const at = frames.findIndex((one) => one.index === index);
    const frame = frames[at]?.frame;
    if (frame === undefined) return undefined;
    const box = (attrOf(frame.attrs, 'viewBox') ?? '').split(/\s+/).map(Number);
    const scale = (size: number, boxSize: number | undefined): number =>
      boxSize !== undefined && Number.isFinite(boxSize) && boxSize > 0 ? size / boxSize : 1;
    return { top: tops[at] ?? 0, width: frame.width, scaleX: scale(frame.width, box[2]), scaleY: scale(frame.height, box[3]) };
  });
  const plan = options === null || options.links.length === 0
    ? null
    : planLinks(
      options.links.filter((link) => link.ends.every((end) => placedFrames[end.sheet] !== undefined)),
      placedFrames.map((one) => one ?? { top: 0, width: 0, scaleX: 1, scaleY: 1 }),
      scaledLook(options.look, placedFrames.find((one) => one !== undefined)?.scaleX ?? 1),
    );
  const shift = plan?.left ?? 0;
  const placed = frames.map(({ frame, index }, at) => {
    const box = attrOf(frame.attrs, 'viewBox') ?? `0 0 ${roundNum(frame.width)} ${roundNum(frame.height)}`;
    return `<svg x="${roundNum(shift)}" y="${roundNum(tops[at] ?? 0)}" width="${roundNum(frame.width)}" height="${roundNum(frame.height)}" viewBox="${box}">${prefixIds(frame.inner, index)}</svg>`;
  });
  const total = shift + width + (plan?.right ?? 0);
  // 根の属性 (xmlns・版の印・role) は先頭の枚のものをそのまま使う。
  const keep = (frames[0]?.frame.attrs ?? '')
    .replace(/(?:^|\s)(?:viewBox|width|height)="[^"]*"/g, '')
    .trim();
  return `<svg ${keep} viewBox="0 0 ${roundNum(total)} ${roundNum(height)}" width="${roundNum(total)}" height="${roundNum(height)}">${placed.join('')}${plan?.draw(width) ?? ''}</svg>`;
}

/** 線の太さと字の大きさを、積んだ図の単位へ。 */
const scaledLook = (look: LinkLook, scale: number): LinkLook => ({
  ...look, wire: look.wire * scale, textSize: look.textSize * scale,
});

// ---- 全体 ----

type SheetError = { readonly message: string; readonly line: number | null; readonly notice?: boolean };

type SheetResult<E extends SheetError> = {
  readonly svg: string;
  readonly netlist: readonly Net[];
  readonly errors: readonly E[];
  readonly notices: readonly E[];
  readonly errorHtml: string;
};

/**
 * 枚 1 つを描いた結果に、枚をまたぐ線のために足すもの。**`sheets:` の図の中でだけ使い、
 * 外へは返さない** (`renderSheets` が落とす)。
 */
export type SheetExtras = {
  /** 節点の名前 → 枚の中の座標 (その枚の viewBox の単位)。links の線と札はここから出る。 */
  readonly anchors?: Readonly<Record<string, SheetPoint>>;
  /** 線と札の描き方 (先頭の枚のものを使う)。 */
  readonly look?: LinkLook;
};

/** 枚を描くときに渡すもの。`stamp: false` の枚は版の印を出さない (印は最後の枚にだけ)。 */
export type SheetRenderOptions = { readonly offset: number; readonly stamp: boolean };

export type SheetKit<E extends SheetError> = {
  /** 元のフェンスの行 (オフセットを足す前) で、言うことを 1 件つくる。 */
  readonly makeError: (message: string, line: number | null, notice: boolean) => E;
  /** 枚の外のことを言う帯。 */
  readonly banner: (errors: readonly E[]) => string;
};

/**
 * `sheets:` を書いたフェンスを描く。**枚の中は渡された `renderOne` (今までの 1 枚の描き方)
 * のまま**で、行番号は元のフェンスの行に直して返す。
 */
export function renderSheets<E extends SheetError, R extends SheetResult<E>>(
  source: string,
  options: { readonly offset?: number },
  renderOne: (text: string, options: SheetRenderOptions) => R & SheetExtras,
  kit: SheetKit<E>,
  sheetOptions: SheetOptions = {},
): R {
  const offset = options.offset ?? 0;
  const split = splitSheets(source, sheetOptions);
  const own: E[] = split.problems.map((problem) => kit.makeError(problem.message, problem.line, false));

  if (split.sheets.length > SHEETS_ADVISED) {
    own.push(kit.makeError(
      `基板が ${split.sheets.length} 枚あります。1 つの図は ${SHEETS_ADVISED} 枚までを勧めます (縦に長くなり、図の番号で指しにくい。図を分けます)`,
      split.sheetsLine,
      true,
    ));
  }

  const results = split.sheets.map((sheet, index) => {
    // 枚の中の行 k は元の行 firstLine + k - 1。足した既定の行の誤りは、あとで共通のキーの行へ寄せる。
    // **版の印は最後の枚 (積んだ図の右下) にだけ** 出す。枚ごとに出すと同じ印が並ぶ。
    const result = renderOne(sheet.text, { offset: offset + sheet.firstLine - 1, stamp: index === split.sheets.length - 1 });
    const fix = (list: readonly E[]): E[] => list.map((error) => {
      const local = error.line === null ? null : error.line - offset - sheet.firstLine + 1;
      return local !== null && local > sheet.ownLines && sheet.sharedLine !== null
        ? { ...error, line: sheet.sharedLine + offset }
        : error;
    });
    return { sheet, result: { ...result, errors: fix(result.errors), notices: fix(result.notices) } };
  });

  const merged = mergeNetlists(
    results.map(({ sheet, result }) => ({ sheet: sheet.name, nets: result.netlist })),
    split.links,
  );
  own.push(...merged.problems.map((problem) => kit.makeError(problem.message, problem.line, false)));

  // 部品の名前は図全体で 1 つ (枚をまたいで同じ名前が出ると、links で 1 つにした回路が読めなくなる)。
  const seen = new Map<string, string>();
  for (const { sheet, result } of results) {
    // ネットリストの `refs` は `R1.2` のようにピンまで書く。部品の名前はその前。
    for (const ref of new Set(result.netlist.flatMap((net) => net.refs.map((pin) => pin.split('.')[0] ?? pin)))) {
      const before = seen.get(ref);
      // **誤りとして数える。** links で 1 つにした回路では、どちらの R1 か読めない。
      if (before !== undefined && before !== sheet.name) {
        own.push(kit.makeError(`部品の名前が 2 枚にあります: ${ref} (${before} と ${sheet.name}。図全体で 1 つにします)`, sheet.firstLine, false));
      }
      seen.set(ref, sheet.name);
    }
  }

  const drawn = linksToDraw(split, results.map(({ result }) => ({
    anchors: result.anchors,
    nets: new Set(result.netlist.map((one) => one.name)),
  })));
  own.push(...drawn.problems.map((problem) => kit.makeError(problem.message, problem.line, true)));
  const look = results.find(({ result }) => result.look !== undefined)?.result.look;

  const shift = (list: readonly E[]): E[] => list.map((error) => (error.line === null ? error : { ...error, line: error.line + offset }));
  const ownErrors = shift(own.filter((error) => error.notice !== true));
  const ownNotices = shift(own.filter((error) => error.notice === true));

  const first = results[0]?.result;
  const empty = first === undefined ? renderOne('', { offset, stamp: true }) : null;
  const base = (first ?? empty) as R;
  const extra = [...ownErrors, ...ownNotices];
  const svgs = results.map(({ result }) => result.svg);
  const combined: Record<string, unknown> = {
    ...base,
    svg: results.length === 0
      ? base.svg
      : stackSheets(svgs, look === undefined ? null : { links: drawn.links, look }) || base.svg,
    netlist: merged.netlist,
    errors: [...results.flatMap(({ result }) => result.errors), ...ownErrors],
    notices: [...results.flatMap(({ result }) => result.notices), ...ownNotices],
    errorHtml: [...results.map(({ result }) => result.errorHtml), extra.length > 0 ? kit.banner(extra) : ''].join(''),
  };
  // 枚の中でだけ使うもの。外へは返さない。
  delete combined.anchors;
  delete combined.look;
  if ('erc' in base) {
    combined.erc = results.flatMap(({ result }) => (result as unknown as { erc: readonly E[] }).erc);
  }
  return combined as R;
}

/**
 * `links:` を描く線に直す。**名前は合っているのに座標が無い節点** (`points:` で
 * 名前を付けていないネット) は線を引けないので、そう言う。名前の誤りは
 * `mergeNetlists` が言うので、ここでは黙って飛ばす。
 */
function linksToDraw(
  split: SheetSplit,
  // 座標を返さない盤面 (`anchors` が無い) の枚は線を引かず、黙っている。
  sheets: readonly { readonly anchors: Readonly<Record<string, SheetPoint>> | undefined; readonly nets: ReadonlySet<string> }[],
): { readonly links: readonly StackLink[]; readonly problems: readonly SheetProblem[] } {
  const problems: SheetProblem[] = [];
  const links = split.links.flatMap((link): StackLink[] => {
    const ends = link.tokens.flatMap((token) => {
      const dot = token.indexOf('.');
      const sheet = split.sheets.findIndex((one) => one.name === token.slice(0, dot));
      const name = token.slice(dot + 1);
      const own = sheets[sheet];
      if (dot < 0 || own?.anchors === undefined || !own.nets.has(name)) return [];
      const point = Object.hasOwn(own.anchors, name) ? own.anchors[name] : undefined;
      if (point === undefined) {
        // ネットリストに無い名前は mergeNetlists が言う。ここで言うのは「ネットはあるが穴が決まらない」だけ。
        problems.push({ message: `links の ${token} は穴が決まらないので線を引いていません (points: で穴に名前を付けると引けます)`, line: link.line });
        return [];
      }
      return [{ sheet, point, token }];
    });
    if (ends.length < 2) return [];
    const color = link.color === undefined || link.color === null ? null : wireColor(link.color);
    return [{
      color: color ?? linkColorOf(ends.map((end) => end.token.slice(end.token.indexOf('.') + 1))),
      ends: ends.map((end) => ({
        sheet: end.sheet,
        point: end.point,
        tag: `→ ${ends.filter((other) => other !== end).map((other) => other.token).join('、')}`,
      })),
    }];
  });
  return { links, problems };
}

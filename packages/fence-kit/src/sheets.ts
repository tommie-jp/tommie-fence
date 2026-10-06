/**
 * 1 つのフェンスに複数の基板 (枚) を持たせる (52 の docs/117)。
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

/** 枚の外 (一番外側) に書けるキー。`board` と `style` は枚が書かなかったときの既定になる。 */
export const SHEET_TOP_KEYS = ['title', 'sheets', 'links', 'board', 'style'] as const;
const SHARED_KEYS = ['board', 'style'] as const;

/** フェンスごとに足せる、枚が書かなかったときの既定になるキー (copper の `f:` など)。 */
export type SheetOptions = { readonly shared?: readonly string[] };

/** 枚どうしの間の隙間 (SVG の単位)。 */
const SHEET_GAP = 16;

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

export type SheetLink = { readonly tokens: readonly string[]; readonly line: number };
export type SheetProblem = { readonly message: string; readonly line: number | null };

export type SheetSplit = {
  readonly sheets: readonly SheetSource[];
  readonly links: readonly SheetLink[];
  readonly problems: readonly SheetProblem[];
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
  const raw: { readonly name: string | null; readonly lines: string[]; readonly firstLine: number }[] = [];

  for (const block of blocks) {
    const line = block.start + 1;
    if (block.key === 'sheets') {
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
        links.push({ tokens: unquote(text).split(/\s+/).filter((t) => t !== ''), line: item.from + 1 });
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
  const sheets = raw.map((one, index): SheetSource => {
    const body = [...one.lines];
    let name: string | null = null;
    const titled = hasTopKey(body, 'title');
    for (let at = 0; at < body.length; at += 1) {
      const match = /^name:(.*)$/.exec(body[at] ?? '');
      if (match === null) continue;
      name = unquote((match[1] ?? '').replace(/\s+#.*$/, ''));
      // 枚の名前は図の題にもなる。外の `title:` があれば頭に付ける (枚が `title:` を持つならそちらを使う)。
      body[at] = titled || name === '' ? '' : `title: ${JSON.stringify(figureTitle === null ? name : `${figureTitle}・${name}`)}`;
      break;
    }
    const sheetName = name === null || name === '' ? `sheet${index + 1}` : name;
    if (BAD_NAME.test(sheetName)) {
      problems.push({ message: `枚の名前に空白と . は使えません (links で枚と節点を区切るため): ${sheetName}`, line: one.firstLine });
    }
    if (taken.has(sheetName)) {
      problems.push({ message: `枚の名前が重なっています: ${sheetName}`, line: one.firstLine });
    }
    taken.add(sheetName);

    const ownLines = body.length;
    const extra: string[] = [];
    if (name === null && figureTitle !== null && !titled) {
      extra.push(`title: ${JSON.stringify(`${figureTitle} (${index + 1}/${raw.length})`)}`);
    }
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
  return { sheets, links, problems };
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

/** 枚ごとの SVG を左を揃えて縦に積む。**1 枚も描けなかったときは空文字列。** */
export function stackSheets(svgs: readonly string[]): string {
  const frames = svgs.map(frameOf).map((frame, index) => ({ frame, index })).filter(
    (one): one is { frame: Frame; index: number } => one.frame !== null,
  );
  if (frames.length === 0) return '';
  const width = Math.max(...frames.map(({ frame }) => frame.width));
  let top = 0;
  const placed = frames.map(({ frame, index }) => {
    const box = attrOf(frame.attrs, 'viewBox') ?? `0 0 ${roundNum(frame.width)} ${roundNum(frame.height)}`;
    const body = `<svg x="0" y="${roundNum(top)}" width="${roundNum(frame.width)}" height="${roundNum(frame.height)}" viewBox="${box}">${prefixIds(frame.inner, index)}</svg>`;
    top += frame.height + SHEET_GAP;
    return body;
  });
  const height = top - SHEET_GAP;
  // 根の属性 (xmlns・版の印・role) は先頭の枚のものをそのまま使う。
  const keep = (frames[0]?.frame.attrs ?? '')
    .replace(/(?:^|\s)(?:viewBox|width|height)="[^"]*"/g, '')
    .trim();
  return `<svg ${keep} viewBox="0 0 ${roundNum(width)} ${roundNum(height)}" width="${roundNum(width)}" height="${roundNum(height)}">${placed.join('')}</svg>`;
}

// ---- 全体 ----

type SheetError = { readonly message: string; readonly line: number | null; readonly notice?: boolean };

type SheetResult<E extends SheetError> = {
  readonly svg: string;
  readonly netlist: readonly Net[];
  readonly errors: readonly E[];
  readonly notices: readonly E[];
  readonly errorHtml: string;
};

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
  renderOne: (text: string, options: { readonly offset: number }) => R,
  kit: SheetKit<E>,
  sheetOptions: SheetOptions = {},
): R {
  const offset = options.offset ?? 0;
  const split = splitSheets(source, sheetOptions);
  const own: E[] = split.problems.map((problem) => kit.makeError(problem.message, problem.line, false));

  const results = split.sheets.map((sheet) => {
    // 枚の中の行 k は元の行 firstLine + k - 1。足した既定の行の誤りは、あとで共通のキーの行へ寄せる。
    const result = renderOne(sheet.text, { offset: offset + sheet.firstLine - 1 });
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
      if (before !== undefined && before !== sheet.name) {
        own.push(kit.makeError(`部品の名前が 2 枚にあります: ${ref} (${before} と ${sheet.name}。図全体で 1 つにします)`, sheet.firstLine, true));
      }
      seen.set(ref, sheet.name);
    }
  }

  const shift = (list: readonly E[]): E[] => list.map((error) => (error.line === null ? error : { ...error, line: error.line + offset }));
  const ownErrors = shift(own.filter((error) => error.notice !== true));
  const ownNotices = shift(own.filter((error) => error.notice === true));

  const first = results[0]?.result;
  const empty = first === undefined ? renderOne('', { offset }) : null;
  const base = (first ?? empty) as R;
  const extra = [...ownErrors, ...ownNotices];
  const combined: Record<string, unknown> = {
    ...base,
    svg: results.length === 0 ? base.svg : stackSheets(results.map(({ result }) => result.svg)) || base.svg,
    netlist: merged.netlist,
    errors: [...results.flatMap(({ result }) => result.errors), ...ownErrors],
    notices: [...results.flatMap(({ result }) => result.notices), ...ownNotices],
    errorHtml: [...results.map(({ result }) => result.errorHtml), extra.length > 0 ? kit.banner(extra) : ''].join(''),
  };
  if ('erc' in base) {
    combined.erc = results.flatMap(({ result }) => (result as unknown as { erc: readonly E[] }).erc);
  }
  return combined as R;
}

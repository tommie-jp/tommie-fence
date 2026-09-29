import type { MarkdownIt, Token } from 'markdown-it';
import { isFenceOf } from 'fence-kit';

/**
 * GitHub 用の画像をプレビューで畳む (52 の docs/101)。
 *
 * GitHub はフェンスを図にしないので、教科書はフェンスの閉じの直後に同じ図の SVG を
 * 画像 1 枚だけの段落で置いている。プレビューではフェンスも図になるので、そのままだと
 * **同じ図が 2 枚続けて出る。** 本文の側では「GitHub では出して VS Code では出さない」を
 * 作れないので、描く側のここで畳む。
 *
 * 消さずに畳むのは、フェンスの直後に実物の写真を置く書き手もいるから。URL では絞らない。
 */
export type ImageAfterFence = 'collapse' | 'hide' | 'show';

/** 拡張が図にするフェンス (正の綴り)。別名は `isFenceOf` が拾う。 */
export const FIGURE_LANGUAGES = ['circuit', 'bread', 'perf', 'copper', 'vna', 'scope', 'spectrum', 'graph', 'logic'] as const;

export type ImageAfterFenceOptions = {
  /** 設定 `tommieFence.preview.imageAfterFence`。**描くたびに読む** — 変えても入れ直しが要らない。 */
  readonly mode: () => ImageAfterFence;
  /** 畳んだ見出し。画像の alt を受け取る (訳は入口が持つ)。 */
  readonly label: (alt: string) => string;
};

const isFigureFence = (token: Token | undefined): boolean =>
  token?.type === 'fence' && FIGURE_LANGUAGES.some((language) => isFenceOf(token.info, language));

/** 画像 1 枚だけの段落の中身 (`inline`) か。前後の空白は markdown-it が落としてある。 */
const soleImage = (inline: Token | undefined): Token | undefined => {
  const children = inline?.type === 'inline' ? inline.children : null;
  return children?.length === 1 && children[0]?.type === 'image' ? children[0] : undefined;
};

/** `tokens[index]` から始まる段落が、図のフェンスの直後にある画像 1 枚だけの段落なら、その画像。 */
const mirrorAt = (tokens: readonly Token[], index: number): Token | undefined => {
  if (tokens[index]?.type !== 'paragraph_open' || tokens[index + 2]?.type !== 'paragraph_close') return undefined;
  if (!isFigureFence(tokens[index - 1])) return undefined;
  return soleImage(tokens[index + 1]);
};

export const imageAfterFencePlugin = (options: ImageAfterFenceOptions) => (md: MarkdownIt): void => {
  md.core.ruler.push('tommie_fence_image_after_fence', (state) => {
    const mode = options.mode();
    if (mode === 'show') return;

    const htmlBlock = (content: string, level: number): Token => {
      const token = new state.Token('html_block', '', 0);
      token.content = content;
      token.block = true;
      token.level = level;
      return token;
    };

    // トークン列で隣を見る。フェンスと段落の間の空行はトークンにならない。
    const tokens = state.tokens;
    const out: Token[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const image = mirrorAt(tokens, index);
      if (image === undefined) {
        out.push(tokens[index] as Token);
        continue;
      }
      const paragraph = tokens.slice(index, index + 3);
      index += 2;
      if (mode === 'hide') continue;
      const level = paragraph[0]?.level ?? 0;
      const summary = md.utils.escapeHtml(options.label(image.content));
      out.push(
        htmlBlock(`<details class="tf-mirror"><summary>${summary}</summary>\n`, level),
        ...paragraph,
        htmlBlock('</details>\n', level),
      );
    }
    state.tokens = out;
  });
};

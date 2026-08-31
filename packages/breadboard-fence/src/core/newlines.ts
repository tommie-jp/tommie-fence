/**
 * 外から来た字を読む前に必ず通す。CRLF と CR を `\n` に揃える。
 *
 * 揃えないと、行を trim して読む部品や配線は通るのに、
 * **行をそのまま使うところ (注釈の `- source`、エラーに添える行の中身) だけ**が
 * 行末の `\r` を抱えて食い違う。行数は変わらないので、行番号はそのまま使える。
 */
export const normalizeNewlines = (text: string): string => text.replace(/\r\n?/g, '\n');

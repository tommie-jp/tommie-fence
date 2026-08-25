import type { Net } from '../model/nets.ts';
import { element, escapeHtml } from './html.ts';

/**
 * 図の下に置くネットリスト。図を見ずに「意図した回路になっているか」を
 * 文字で突き合わせるための出力なので、既定では畳んでおいて図の邪魔をしない。
 */
export function renderNetlist(netlist: readonly Net[]): string {
  if (netlist.length === 0) return '';

  const rows = netlist
    .map((net) =>
      element(
        'tr',
        {},
        element('th', {}, escapeHtml(net.name)) + element('td', {}, escapeHtml(net.refs.join(', '))),
      ),
    )
    .join('');

  return element(
    'details',
    { class: 'circuit-netlist' },
    element('summary', {}, 'ネットリスト') + element('table', {}, element('tbody', {}, rows)),
  );
}

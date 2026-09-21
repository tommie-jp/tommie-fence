/**
 * `vscode` の代わり。**拡張の入口を node のテストで動かす**ためだけのもの。
 *
 * 畳んだ入口 (`activate`) が本当に 3 つのフェンスを登録するかは、組み上がった
 * ものを動かさないと分からない — 型は通っても、命令の綴りや登録の順は
 * 型に出ない。ここで受け止めた登録を、テストが数える。
 */
export const registered: { commands: string[]; editors: string[] } = { commands: [], editors: [] };

/**
 * 利用者が書いた設定 (節 → 鍵 → 値)。**書いていない鍵は載せない** —
 * 本物の `inspect` が「書いていない」と答える形を写すため。
 */
export const configuration: Record<string, Record<string, unknown>> = {};

/** 受け止めた聞き手。テストが「その出来事が起きた」ことにするために使う。 */
export const listeners: {
  selection: ((event: unknown) => void)[];
  activeEditor: ((editor: unknown) => void)[];
  document: ((event: unknown) => void)[];
} = { selection: [], activeEditor: [], document: [] };

/** 呼ばれた命令 (`setContext` など)。引数ごと積む。 */
export const executed: unknown[][] = [];

/** テストが差し替える窓の状態。 */
export const state: { activeTextEditor: unknown } = { activeTextEditor: undefined };

/** 聞き手を積み、ほどくと外す。 */
const listen = <T>(pick: () => T[], put: (next: T[]) => void) => (listener: T) => {
  put([...pick(), listener]);
  return { dispose() { put(pick().filter((one) => one !== listener)); } };
};

export const commands = {
  registerCommand(id: string, _run: unknown) {
    registered.commands.push(id);
    return { dispose() {} };
  },
  executeCommand(...args: unknown[]) {
    executed.push(args);
    return Promise.resolve();
  },
};

export class ThemeColor {
  constructor(public id: string) {}
}

export const window = {
  createTextEditorDecorationType(options: unknown) {
    return { key: 'stub', dispose() {}, options };
  },
  registerCustomEditorProvider(viewType: string, _provider: unknown, _options?: unknown) {
    registered.editors.push(viewType);
    return { dispose() {} };
  },
  createWebviewPanel() {
    throw new Error('テストではパネルを開かない');
  },
  showWarningMessage() {},
  showErrorMessage() {},
  get activeTextEditor() {
    return state.activeTextEditor;
  },
  onDidChangeActiveTextEditor: listen(() => listeners.activeEditor, (next) => { listeners.activeEditor = next; }),
  onDidChangeTextEditorSelection(listen: (event: unknown) => void) {
    // **聞き手を覚える。** カーソルを追う段取り (まとめ方) をテストが動かすため。
    listeners.selection.push(listen);
    return {
      dispose() {
        listeners.selection = listeners.selection.filter((one) => one !== listen);
      },
    };
  },
};

export const workspace = {
  onDidChangeTextDocument: listen(() => listeners.document, (next) => { listeners.document = next; }),
  onDidCloseTextDocument() {
    return { dispose() {} };
  },
  getConfiguration(section: string) {
    // **書いてある値だけを返す。** 本物は `contributes` の既定値も返すが、
    // 「書いていない」を見分ける手 (`inspect`) の試験には、書いた値だけが要る。
    const written = (key: string): unknown => configuration[section]?.[key];
    return {
      get: (key: string) => written(key),
      inspect: (key: string) => {
        const value = written(key);
        return value === undefined ? { key: `${section}.${key}` } : { key: `${section}.${key}`, globalValue: value };
      },
    };
  },
  applyEdit() {
    return Promise.resolve(true);
  },
};

export const ViewColumn = { Beside: 2 };
export const Uri = { joinPath: (...parts: unknown[]) => ({ toString: () => parts.join('/') }) };
export class EventEmitter {
  event = () => ({ dispose() {} });
  fire() {}
  dispose() {}
}
export class WorkspaceEdit {
  replace() {}
}
export class Range {}
export class Position {}
export class Selection {}

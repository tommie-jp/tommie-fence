import { DESKTOP_CASES } from './cases.ts';
import { runCases } from './runner.ts';

/** `@vscode/test-electron` が読む入口 (`extensionTestsPath`)。 */
export const run = (): Promise<void> => runCases(DESKTOP_CASES);

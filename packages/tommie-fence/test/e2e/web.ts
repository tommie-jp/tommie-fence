import { WEB_CASES } from './cases.ts';
import { runCases } from './runner.ts';

/** `@vscode/test-web` が読む入口 (`extensionTestsPath`)。 */
export const run = (): Promise<void> => runCases(WEB_CASES);

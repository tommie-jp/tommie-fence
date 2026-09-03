import { stampText } from 'fence-kit';

/**
 * 版の写し。**持ち主は `package.json`** で、ここはその写し。
 * core は Node を使えない (設計上の約束) ので定数で持つ。
 * 手で直さないこと — 上げるのは直下の `./doVersion.sh perfboard-fence`。
 */
export const VERSION = '0.3.0';

/** 図の右下と `--version` に出す字。綴りの作り方は fence-kit にある。 */
export const STAMP_TEXT = stampText('perfboard-fence', VERSION);

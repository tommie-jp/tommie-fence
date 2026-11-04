// 部品ギャラリー (examples/13〜16) を src/gallery/gallery.ts から書き出す。
// 使い方: npm run gallery   (書き出したあと npm run examples で図を作り直す)
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/gallery/gallery.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const source = outputFiles[0].text;
const { galleryFiles } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (const file of galleryFiles()) {
  writeFileSync(new URL(`../examples/${file.name}`, import.meta.url), file.markdown);
  console.log(`examples/${file.name}`);
}

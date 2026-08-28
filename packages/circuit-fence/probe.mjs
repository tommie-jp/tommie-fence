import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
const body = process.argv[2], name = process.argv[3] ?? 'probe';
const tex = `\n\\usepackage{circuitikz}\n\\begin{document}\n\\begin{circuitikz}[american, line width=0.8pt]\n\\ctikzset{bipoles/length=1.2cm}\n${body}\n\\end{circuitikz}\n\\end{document}`;
const ns = await import('node-tikzjax');
const tex2svg = ns.default?.default ?? ns.default;
try {
  const svg = await tex2svg(tex);
  writeFileSync(`${name}.png`, await sharp(Buffer.from(svg.replaceAll('currentColor','#000000')), { density: 200 }).flatten({ background: '#fff' }).png().toBuffer());
  console.log('OK ' + name);
} catch (e) { console.log('FAIL ' + name + ': ' + String(e).slice(0,120)); process.exit(1); }

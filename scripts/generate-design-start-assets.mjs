/** Assets for the design-start mockup; no production routes are changed. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/design-start/assets');
fs.mkdirSync(out, {recursive: true});
const designs = JSON.parse(fs.readFileSync(path.join(root, 'src/lib/data/heart-designs.json'), 'utf8'));
const ids = ['classic-3x3', 'simple-5star', '5star', 'stjerne', 'juletrae', 'jul', 'nemt-hjerte', 'snowflake', 'angel', 'flower', 'nihon', 'gaver'];
const server = await createServer({root, configFile: false, logLevel: 'error', appType: 'custom', server: {middlewareMode: true, hmr: false, watch: null, preTransformRequests: false}, optimizeDeps: {noDiscovery: true, include: []}, resolve: {alias: {$lib: path.join(root, 'src/lib')}}});
try {
  const {renderHeartSvgInline} = await server.ssrLoadModule('/src/lib/rendering/heartSvg.ts');
  const hearts = Object.fromEntries(ids.map(id => [id, renderHeartSvgInline(designs[id], {left:'var(--paper-left, #fffdf5)', right:'var(--paper-right, #b72f2b)'}, {idPrefix:`mock-${id}`})]));
  fs.writeFileSync(path.join(out, 'hearts.js'), `// Existing gallery designs, rendered by Juleflet's heart renderer.\nwindow.JULEFLET_HEARTS = ${JSON.stringify(hearts)};\n`);
  fs.copyFileSync(path.join(root, 'src/lib/assets/landscape.svg'), path.join(out, 'landscape.svg'));
  fs.copyFileSync(path.join(root, 'static/hearts/photos/5star.jpg'), path.join(out, '5star-photo.jpg'));
  console.log(`Prepared ${ids.length} existing hearts and the original landscape for the mockup.`);
} finally {
  await server.close();
}

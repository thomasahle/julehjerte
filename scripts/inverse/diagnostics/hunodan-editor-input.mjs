/** Rebuild the frozen photographic targets for saved speed-benchmark outputs.
 * This adapts their layout for hard-photo-editor-replay; it never fits curves.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createCanvas} from 'canvas';
import {readPhoto} from '../hunodan-photo-data.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.run||!args.runtime||!args.output)throw new Error('Use --run=<speed benchmark> --runtime=<experimental runtime> --output=<new directory>');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(args.runtime,'source.json')));
const verifyRuntime=async()=>{for(const [file,expected]of Object.entries(manifest.sourceHashes))assert.equal(hash(await fs.readFile(file)),expected,file);};
await verifyRuntime();
const {prepare}=await import(pathToFileURL(path.resolve(args.runtime,'inverse/core/engine.js')).href);
const benchmark=JSON.parse(await fs.readFile(path.join(args.run,'results.json')));
const catalogFile='scripts/inverse/fixtures/hunodan/speed-crops.json',catalog=JSON.parse(await fs.readFile(catalogFile));
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
const results=[],ledger={method:'Original source photograph, frozen speed-corpus ROI/quad and original settings. Recreated target must reproduce the saved independent exported-template error exactly; no refitting.',cropMode:'frozen-hunodan-speed-crops',targetMode:'photo',runtime:args.runtime,run:args.run,catalogSha256:hash(await fs.readFile(catalogFile)),results};
for(const row of benchmark.results){
  if(row.error===undefined)continue;
  const entry=catalog.cases.find(c=>c.id===row.id);
  const input=await readPhoto({id:entry.id,file:entry.source,sha256:entry.sourceSha256,photoROI:entry.photoROI,decodedPixelsSha256:entry.decodedPixelsSha256});
  const prepared=prepare({...input,quad:entry.quad},benchmark.cfg),source=prepared.target.sourceImage;
  const geometry=await fs.readFile(path.join(args.run,row.id,'cut_geometry.json'));
  const woven=await renderExportedWeave(geometry.toString(),source.resolution);
  const error=woven.mask.reduce((s,v,i)=>s+Number(v!==source.mask[i]),0)/source.mask.length;
  assert.equal(error,row.error,'Recreated target must reproduce the saved error: '+row.id);
  const directory=path.join(args.output,row.id,'automatic');await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'cut_geometry.json'),geometry);
  const canvas=createCanvas(source.resolution,source.resolution),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(source.resolution,source.resolution);
  for(let i=0;i<source.mask.length;i++)pixels.data.set(source.mask[i]?[185,19,19,255]:[255,255,255,255],4*i);
  ctx.putImageData(pixels,0,0);await fs.writeFile(path.join(directory,'mask.png'),canvas.toBuffer('image/png'));
  const report=JSON.parse(await fs.readFile(path.join(args.run,row.id,'report.json')));
  results.push({id:row.id,sourceSha256:entry.sourceSha256,decodedPixelsSha256:entry.decodedPixelsSha256,quad:entry.quad,runs:[{preset:'automatic',independentImageError:error,maskSha256:hash(source.mask),passed:row.passed,report}]});
  console.log(row.id,error);
}
assert.ok(results.length,'No saved Hunodan candidates');await verifyRuntime();
await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify(ledger,null,2)+'\n');

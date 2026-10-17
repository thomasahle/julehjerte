/** Compare current production crops/masks with a frozen full-photo benchmark.
 * This does not rerun the solver or reinterpret a changed crop as a fitting gain.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readHardPhoto} from '../hard-photo-data.mjs';
import {cropEvidence} from '../crop-evidence.mjs';
import {detectHeartCrops} from '../../../static/inverse/core/crop.js';
import {prepare} from '../../../static/inverse/core/engine.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.baseline||!args.output)throw new Error('Use --baseline=<automatic benchmark results.json> --output=<new JSON file>');
const baseline=JSON.parse(await fs.readFile(args.baseline));
if(baseline.cropMode!=='automatic')throw new Error('The baseline must use production automatic crops.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={};
async function fingerprint(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())await fingerprint(file);else sourceHashes[file]=hash(await fs.readFile(file));
  }
}
await fingerprint('static/inverse/core');await fingerprint('static/inverse/locator');
const results=[],sources=new Map();
for(const previous of baseline.results){
  if(['incomplete','obscured'].includes(previous.cropStatus))continue;
  if(!sources.has(previous.file))sources.set(previous.file,await readHardPhoto(previous));
  const source=sources.get(previous.file),started=performance.now();
  const crop=detectHeartCrops(source,{roi:previous.roi}).candidates[0];
  const row={id:previous.id,seconds:(performance.now()-started)/1000,
    beforeQuad:previous.effectiveQuad??null,quad:crop?.quad??null,
    assessment:cropEvidence(crop,{width:source.imageWidth,height:source.imageHeight})};
  row.sameCrop=JSON.stringify(row.beforeQuad)===JSON.stringify(row.quad);
  row.maximumCornerMovementPx=row.beforeQuad&&row.quad?Math.max(...row.quad.map((p,i)=>Math.hypot(p[0]-row.beforeQuad[i][0],p[1]-row.beforeQuad[i][1]))):null;
  const prior=previous.runs.find(r=>r.preset==='automatic');
  row.beforeMaskSha256=prior?.maskSha256??null;
  if(crop){
    const prepared=prepare({...source,quad:crop.quad},prior?.settings??baseline.settings);
    row.maskSha256=hash(prepared.preview.mask);
    row.observedPixels=prepared.preview.validMask?prepared.preview.validMask.reduce((sum,v)=>sum+Number(!!v),0):prepared.preview.mask.length;
  }else row.maskSha256=null;
  row.sameMask=row.maskSha256===row.beforeMaskSha256;
  results.push(row);console.log(row.id,row.sameCrop?'same crop':'CHANGED crop',row.sameMask?'same mask':'CHANGED mask');
}
await fs.writeFile(args.output,JSON.stringify({baseline:args.baseline,sourceHashes,
  scope:'Crop and classified-mask comparison only; changed cases require fresh template/export validation.',
  cases:results.length,changedCrops:results.filter(r=>!r.sameCrop).map(r=>r.id),
  changedMasks:results.filter(r=>!r.sameMask).map(r=>r.id),results},null,2),{flag:'wx'});

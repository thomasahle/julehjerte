/** Verify the direct weighted-palette path against saved predictions.
 * Uses the locator's exact working-image resize; does not run a fit or train.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {foregroundFields} from './foreground-crop.mjs';
import {continuousForeground} from './continuous-foreground.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=async pin=>{const b=await fs.readFile(pin.path);assert.equal(hash(b),pin.sha256,pin.path);return JSON.parse(b);};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'foreground-palette-audit-plan-1');
for(const [file,sha] of Object.entries(plan.sourcePins))assert.equal(hash(await fs.readFile(file)),sha,file);
const locatorFile=new URL('../../../static/inverse/locator/locator.js',import.meta.url);
let source=await fs.readFile(locatorFile,'utf8');
assert.equal(source.split('function resizeROI(').length,2,'Resize adapter seam changed');
source=source.replace('function resizeROI(', 'export function resizeROI(')
 .replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,locatorFile).href}'`);
const {resizeROI}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const result={schema:'foreground-palette-audit-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),rows:[],
 scope:'Field equivalence and admission only. No locator-support, crop-accuracy, fitting, browser or production claim.'};
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(result,null,2)+'\n');
try{
 for(const [arm,pin] of Object.entries(plan.probes)){
  const manifest=await pinned(pin);assert.equal(manifest.status,'complete');assert.equal(manifest.resolution,320);
  assert.deepEqual(manifest.rows.map(r=>r.id),plan.ids);
  for(const row of manifest.rows){
   const imageBytes=await fs.readFile(row.file);assert.equal(hash(imageBytes),row.photoSha256);
   const image=await loadImage(imageBytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   const work=resizeROI({width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data},[0,0,image.width,image.height],650);
   const asset=row.assets['probability.f32'],file=path.resolve(path.dirname(pin.path),asset.path);
   assert.ok(file.startsWith(path.resolve(path.dirname(pin.path))+path.sep));
   const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);assert.equal(bytes.length,320*320*4);
   const probability=Float32Array.from({length:320*320},(_,i)=>bytes.readFloatLE(4*i));
   const threshold=foregroundFields(work,probability,320,row.window),legacy=threshold&&continuousForeground(threshold,{palette:true});
   const direct=foregroundFields(work,probability,320,row.window,{paletteMode:'confidence-weighted'});
   if(threshold)assert.deepEqual(direct,legacy,`${arm}/${row.id}: previously admitted fields must remain exact`);
   result.rows.push({arm,id:row.id,thresholdAccepted:!!threshold,legacyWeightedAccepted:!!legacy,
    directWeightedAccepted:!!direct,legacyEquivalent:threshold?true:null,
    legacyPalette:threshold?.palette??null,directPalette:direct?.palette??null});
  }
  await save();
 }
 result.summary=Object.fromEntries(Object.keys(plan.probes).map(arm=>{
  const rows=result.rows.filter(r=>r.arm===arm);
  return[arm,{photos:rows.length,legacyWeighted:rows.filter(r=>r.legacyWeightedAccepted).length,
   directWeighted:rows.filter(r=>r.directWeightedAccepted).length,
   recovered:rows.filter(r=>!r.legacyWeightedAccepted&&r.directWeightedAccepted).map(r=>r.id),
   previouslyAdmittedFieldsExact:rows.filter(r=>r.legacyEquivalent).length}];
 }));
 for(const [file,sha] of Object.entries(plan.sourcePins))assert.equal(hash(await fs.readFile(file)),sha,file);
 result.status='complete';await save();console.log(JSON.stringify(result.summary));
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}

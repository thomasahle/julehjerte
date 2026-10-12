/** Compare saved template pairs in the same physical overlap coordinates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {renderExportedWeave} from '../export-renderer.mjs';
import {homography,SQUARE} from '../datasets/synthetic-photo.mjs';
import {labelsForCrop} from './photo-labels.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.pipeline||!args.baseline||!args.output||Object.keys(args).some(k=>!['pipeline','baseline','output'].includes(k)))throw new Error('Use --pipeline=directory --baseline=directory --output=new-directory.');
const output=path.resolve(args.output),hash=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>{const bytes=await fs.readFile(p);return{data:JSON.parse(bytes),sha256:hash(bytes),path:p};};
const pipeline=await load(path.join(args.pipeline,'report.json')),baseline=await load(path.join(args.baseline,'report.json'));
const probe=await load(path.join(pipeline.data.probe,'manifest.json'));
if([pipeline,baseline,probe].some(r=>r.data.status!=='complete')||[pipeline,baseline].some(r=>r.data.probeManifestSha256!==probe.sha256))throw new Error('Require complete replays of the same frozen probe.');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const report={schema:'heart-aligned-template-comparison-1',status:'running',pipeline:{path:pipeline.path,sha256:pipeline.sha256},baseline:{path:baseline.path,sha256:baseline.sha256},probe:{path:probe.path,sha256:probe.sha256},
  method:'Render both exported pairs independently at 1536 pixels, project the same 512x512 canonical material samples into each saved crop, and score only their common observed region. Report excluded coverage and allow one global color flip per pair.',sourceHashes:{},rows:[]};
for(const file of ['scripts/inverse/learning/photo-alignment.mjs','scripts/inverse/learning/photo-labels.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/datasets/synthetic-photo.mjs'])report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function checked(root,asset){
  const file=path.resolve(root,asset.path);if(!file.startsWith(path.resolve(root)+path.sep))throw new Error('Asset escapes root.');
  const b=await fs.readFile(file);if(hash(b)!==asset.sha256)throw new Error('Asset changed.');return b;
}
async function decode(bytes){
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};
}
function png(values,valid){
  const canvas=createCanvas(512,512),ctx=canvas.getContext('2d'),rgba=ctx.createImageData(512,512);
  for(let i=0;i<values.length;i++){const v=valid[i]?255*values[i]:128;rgba.data.set([v,v,v,255],4*i);}ctx.putImageData(rgba,0,0);return canvas.toBuffer('image/png');
}
await save();
try{
  for(const after of pipeline.data.rows){
    const row={id:after.id,pipelineStatus:after.status};report.rows.push(row);
    if(!after.assets['cut_geometry.json'])continue;
    const input=probe.data.rows.find(r=>r.id===after.id),before=baseline.data.rows.find(r=>r.id===after.id),design=probe.data.designs.find(d=>d.id===input.designId);
    const labels=JSON.parse(await checked(pipeline.data.probe,input.assets['labels.json'])),canonical=await decode(await checked(probe.data.sourceDataset,design.sourceCanonical));
    const source=labelsForCrop(labels,labels.actualQuad,canonical,512,labels.resolution,labels.resolution),aligned=[];
    for(const [root,result,quad]of [[args.baseline,before,labels.proposedCropQuad],[args.pipeline,after,after.selectedCrop.quad]]){
      const cuts=await checked(root,result.assets['cut_geometry.json']),rendered=await renderExportedWeave(cuts.toString(),1536),image=await decode(rendered.png);
      aligned.push(labelsForCrop({canonicalToPhoto:homography(SQUARE,quad)},labels.actualQuad,image,512,labels.resolution,labels.resolution));
    }
    const valid=Uint8Array.from(source.valid,(v,i)=>Number(v&&aligned.every(a=>a.valid[i]))),count=valid.reduce((s,v)=>s+v,0);
    if(!count)throw new Error('No common material samples.');
    row.commonObservedPixels=count;row.commonOverlapFraction=count/valid.length;row.predictionCoverageFractions=aligned.map(a=>a.valid.reduce((s,v)=>s+v,0)/a.valid.length);
    row.scores=aligned.map(a=>{let wrong=0;for(let i=0;i<valid.length;i++)if(valid[i])wrong+=a.target[i]!==source.target[i];const inverted=wrong>count/2;if(inverted)for(let i=0;i<a.target.length;i++)a.target[i]^=1;return{mismatchPixels:Math.min(wrong,count-wrong),mismatchFraction:Math.min(wrong,count-wrong)/count,inverted};});
    await fs.mkdir(path.join(output,row.id));row.assets={};
    for(const [name,values]of [['latent',source.target],['before',aligned[0].target],['after',aligned[1].target]]){
      const relative=`${row.id}/${name}.png`,bytes=png(values,valid);await fs.writeFile(path.join(output,relative),bytes);row.assets[name]={path:relative,sha256:hash(bytes)};
    }
    await save();console.log(row.id,row.commonOverlapFraction,row.scores);
  }
  report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}

/** Compare fixed crop/color interpretations with sparse source-photo review.
 * Every template is fitted afresh. Review points are read only by the scorer.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createCanvas} from 'canvas';
import {readHardPhoto} from './hard-photo-data.mjs';
import {reviewMaterialSamples,validateMaterialSamples} from './photo-material-samples.mjs';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {rectify,quantize} from '../../static/inverse/core/input.js';
import {spatialPaperColors} from '../../static/inverse/core/spatial-color.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.output||Object.keys(args).some(k=>!['output','neural-replay','seconds'].includes(k)))throw new Error('Use --output=new-directory [--neural-replay=report.json --seconds=10].');
const seconds=Number(args.seconds||10);if(!Number.isFinite(seconds)||seconds<1||seconds>180)throw new Error('Invalid fitting allowance.');
const hash=b=>createHash('sha256').update(b).digest('hex'),out=args.output;
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const annotationsFile='scripts/inverse/fixtures/photo-material-samples.json',raw=await fs.readFile(annotationsFile),catalog=JSON.parse(raw);
if(catalog.schema!=='woven-heart-photo-material-samples-1')throw new Error('Unexpected material review schema.');
catalog.cases.forEach(validateMaterialSamples);
const historicalFile='scripts/inverse/hard-photo-cases.json',historicalBytes=await fs.readFile(historicalFile),historical=JSON.parse(historicalBytes);
let neural,probe;
if(args['neural-replay']){
 neural=JSON.parse(await fs.readFile(args['neural-replay']));const bytes=await fs.readFile(path.join(neural.probe,'manifest.json'));probe=JSON.parse(bytes);
 if(neural.status!=='complete'||probe.status!=='complete'||hash(bytes)!==neural.probeManifestSha256)throw new Error('Incomplete or changed frozen foreground replay.');
}
const cfg={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0},report={schema:'woven-heart-photo-material-study-1',status:'running',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 annotationFile:annotationsFile,annotationSha256:hash(raw),historicalCropFile:historicalFile,historicalCropSha256:hash(historicalBytes),
 ...(neural?{neuralReplay:args['neural-replay'],neuralReplaySha256:hash(await fs.readFile(args['neural-replay'])),probeManifestSha256:neural.probeManifestSha256}:{}),
 settings:cfg,sourceHashes:{},rows:[],limitations:['Sparse development annotations are not whole-image ground truth or independent held-out evaluation.','Crop proposals stay fixed during fitting. No review point, saved cutting template or reference geometry enters classification or fitting.','Mask disagreements measure each method against its own classified mask. Source-photo sample scores are reported separately.']};
for(const file of ['scripts/inverse/photo-material-study.mjs','scripts/inverse/photo-material-samples.mjs','scripts/inverse/hard-photo-data.mjs','scripts/inverse/export-renderer.mjs',...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator)\/.+\.js$/.test(p)).map(p=>'static/inverse/'+p)])report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
function png(values,n,channels=1){const c=createCanvas(n,n),ctx=c.getContext('2d'),p=ctx.createImageData(n,n);for(let i=0;i<n*n;i++)p.data.set(channels===3?[...values.slice(3*i,3*i+3),255]:[255*(1-values[i]),255*(1-values[i]),255*(1-values[i]),255],i*4);ctx.putImageData(p,0,0);return c.toBuffer('image/png');}
await save();
for(const annotation of catalog.cases){
 const source=await readHardPhoto(annotation.source),old=historical.cases.find(r=>r.id===annotation.id);
 if(!old||source.fileSha256!==historical.source.sha256)throw new Error('Historical crop source differs.');
 const detected=detectHeartCrops(source,{roi:annotation.roi}),crops=[{id:'automatic',quad:detected.candidates[0]?.quad??null,provenance:'Fresh production locator; rough ROI only.'},{id:'historical',quad:old.quad,provenance:'Disputed historical manual corners, retained as a fixed diagnostic, not true corners.'}];
 if(neural){
  const input=probe.rows.find(r=>r.caseId===annotation.id&&r.group==='real'),row=neural.rows.find(r=>r.caseId===annotation.id&&r.method==='learned');
  if(!input||!row||input.photoSha256!==source.fileSha256||input.dimensions[0]!==source.imageWidth||input.dimensions[1]!==source.imageHeight)throw new Error('Neural crop source differs.');
  crops.push({id:'neural',quad:row.selectedCrop?.quad??null,provenance:'Frozen learned foreground proposal; no new model inference or review-point input.'});
 }
 // Render the review overlay from the original RGB, never from a classified mask.
 const [l,t,r,b]=annotation.roi,s=3,c=createCanvas(Math.round((r-l)*s),Math.round((b-t)*s)),ctx=c.getContext('2d');
 ctx.imageSmoothingEnabled=false;ctx.drawImage(source.canvas,l,t,r-l,b-t,0,0,c.width,c.height);ctx.font='12px sans-serif';let index=0;
 for(const group of annotation.groups)for(const [x,y]of group.points){const u=(x+.5-l)*s,v=(y+.5-t)*s;ctx.strokeStyle=group.paper===0?'cyan':'magenta';ctx.beginPath();ctx.arc(u,v,6,0,2*Math.PI);ctx.stroke();ctx.fillStyle='black';ctx.fillRect(u+7,v-4,19,13);ctx.fillStyle='white';ctx.fillText(++index,u+7,v+7);}
 await fs.writeFile(`${out}/${annotation.id}-samples.png`,c.toBuffer('image/png'));
 for(const crop of crops){
  if(!crop.quad){report.rows.push({id:annotation.id,crop:crop.id,provenance:crop.provenance,status:'crop-unresolved',review:reviewMaterialSamples(annotation)});await save();continue;}
  const n=400,rgb=rectify(source.rgba,source.imageWidth,source.imageHeight,n,crop.quad),initial=quantize(rgb),folder=`${out}/${annotation.id}-${crop.id}`;await fs.mkdir(folder);await fs.writeFile(`${folder}/rgb.png`,png(rgb,n,3));
  for(const method of ['auto','red-white-mixture','spatial']){
   const row={id:annotation.id,crop:crop.id,quad:crop.quad,provenance:crop.provenance,method,status:'running',assets:{}};report.rows.push(row);
   const asset=async(name,bytes)=>{const file=`${annotation.id}-${crop.id}/${method}-${name}`;await fs.writeFile(`${out}/${file}`,bytes);row.assets[name]={path:file,sha256:hash(bytes)};};
   try{
    const start=performance.now(),q=method==='spatial'?spatialPaperColors(rgb,initial.mask):method==='auto'?initial:quantize(rgb,{mode:method});row.classificationSeconds=(performance.now()-start)/1000;row.classification=q.metadata;
    await asset('mask.png',png(q.mask,n));row.classified=reviewMaterialSamples(annotation,{mask:q.mask,resolution:n,quad:crop.quad});
    const prepared=prepare({type:'mask',mask:q.mask,resolution:n},cfg),tick=performance.now(),result=await design(prepared.target,cfg);row.solveSeconds=(performance.now()-tick)/1000;row.report=result.report;
    const cuts=result.files['cut_geometry.json'];if(!cuts)throw new Error('No exported pair.');await asset('cuts.json',cuts);
    const rendered=await renderExportedWeave(cuts,n);await asset('woven.png',rendered.png);
    row.maskDisagreement=rendered.mask.reduce((s,v,i)=>s+Number(v!==q.mask[i]),0)/q.mask.length;row.sourceFeatures=auditFeatureFidelity(prepared.target.sourceImage,rendered.mask,result.report.settings);
    row.numericalPass=result.report.templateChecksPassed&&row.sourceFeatures.passed&&row.maskDisagreement<=.03;
    row.exported=reviewMaterialSamples(annotation,{mask:rendered.mask,resolution:n,quad:crop.quad,phase:row.classified.phase});row.status='complete';
   }catch(error){row.status='failed';row.error=error.message;row.report=error.report??row.report;}
   await save();console.log(row.id,crop.id,method,row.status,'mask',row.maskDisagreement,'source samples',row.classified?.correct,row.exported?.correct,'/',row.classified?.total);
  }
 }
}
report.status='complete';await save();

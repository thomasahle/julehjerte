/** Real photographed motifs. Fixed reviewed crops; original pixels, no reference cutting paths. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {GENERAL_PRESET,SIMPLIFIED_PREPROCESSING} from '../../src/lib/inverse/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {writeHardPhotoReport} from './hard-photo-report.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const seconds=Number(args.seconds||10),runId=new Date().toISOString().replace(/[:.]/g,'-')+(args.shard?`-shard-${args.shard.replace('/','-of-')}`:''),output=`tmp/inverse-hard-photos/${runId}`;
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),collage=JSON.parse(await fs.readFile('scripts/inverse/hard-photo-cases.json')),photos=JSON.parse(await fs.readFile('scripts/inverse/photo-cases.json'));
const sourceHashes={};async function hashTree(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=`${dir}/${e.name}`;if(e.isDirectory())await hashTree(f);else sourceHashes[f]=hash(await fs.readFile(f));}}await hashTree('static/inverse/core');for(const f of ['scripts/inverse/hard-photo-cases.json','scripts/inverse/photo-cases.json','src/lib/inverse/presets.js'])sourceHashes[f]=hash(await fs.readFile(f));
let cases=[...collage.cases.map(e=>({...e,group:'collage',file:collage.source.file,rgbaFile:collage.source.rgbaFile,width:collage.source.width,height:collage.source.height})),...photos.cases.map(e=>({...e,group:'individual',label:e.id,cropStatus:'visually_reviewed',file:`tmp/inverse-hard-photos/sources/${e.id}.png`}))].filter(e=>!args.ids||args.ids.split(',').includes(e.id));
if(args.recrops){
  const root=args.recrops,entries=JSON.parse(await fs.readFile(`${root}/cases.json`));
  sourceHashes[`${root}/cases.json`]=hash(await fs.readFile(`${root}/cases.json`));
  cases=entries.filter(e=>!args.ids||args.ids.split(',').includes(e.id)).map(e=>({...e,group:'recrop-handoff',label:e.id,cropStatus:'needs_review',file:`${root}/inputs/cases/${e.id}/rectified.png`,quad:[[0,0],[256,0],[256,256],[0,256]],sourceQuad:e.quad,roi:[0,0,256,256],cropNote:'Fixed archive rectification; locator needs_review retained. No extra inset.'}));
}
if(args['crop-overrides']){const overrides=JSON.parse(await fs.readFile(args['crop-overrides']));sourceHashes[args['crop-overrides']]=hash(await fs.readFile(args['crop-overrides']));cases=cases.map(e=>{const override=overrides.find(x=>x.id===e.id);return override?{...e,...override,cropStatus:override.locatorStatus||override.cropStatus||e.cropStatus,originalQuad:e.quad}:e;});}
if(args.shard){const[index,count]=args.shard.split('/').map(Number);if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||index>=count)throw new Error('Use --shard=index/count with zero-based index.');cases=cases.filter((_,i)=>i%count===index);}
if(args.perturb==='true')cases=cases.flatMap(e=>[
  {name:'crop-x-plus-1',dx:1,dy:0},{name:'crop-y-plus-1',dx:0,dy:1},
  {name:'jpeg-75',jpeg:.75},{name:'half-resolution',scale:.5},
].filter(v=>!args.variants||args.variants.split(',').includes(v.name)).map(variant=>({...e,id:e.id+'--'+variant.name,originalId:e.id,variant})));
if(args.diagnostics){
  const options=JSON.parse(await fs.readFile(args.diagnostics));
  cases=cases.flatMap(e=>(options[e.id]||[]).map((setting,i)=>({...e,id:e.id+'--diagnostic-'+i,originalId:e.id,diagnostic:setting})));
}
const sources=new Map(),results=[];
async function source(e){if(sources.has(e.file))return sources.get(e.file);const bytes=await fs.readFile(e.file),im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);const rgba=e.rgbaFile?new Uint8ClampedArray(await fs.readFile(e.rgbaFile)):ctx.getImageData(0,0,im.width,im.height).data;const s={imageWidth:im.width,imageHeight:im.height,rgba,fileSha256:hash(bytes),rgbaSha256:hash(rgba),canvas};sources.set(e.file,s);return s;}
function pixelPNG(pixels,n,channels=1){const c=createCanvas(n,n),ctx=c.getContext('2d'),out=ctx.createImageData(n,n);for(let i=0;i<n*n;i++){const rgb=channels===3?pixels.slice(3*i,3*i+3):pixels[i]?[185,19,19]:[255,255,255];out.data.set([...rgb,255],4*i);}ctx.putImageData(out,0,0);return c.toBuffer('image/png');}
const config={...GENERAL_PRESET,...(args.recrops?{resolution:256}:{}),timeLimit:seconds,trials:0};
const presets=args.presets?args.presets.split(','):['general','simplify'];
const save=()=>fs.writeFile(`${output}/results.json`,JSON.stringify({runId,shard:args.shard||null,sourceHashes,settings:config,criteria:{maximumIndependentImageError:.03,geometryAndPaperRequired:true,cropMustBeReviewable:true,groundTruthCuttingPaths:false,physicalAssemblyTested:false},description:'Fixed assistant-reviewed crops, before solver feedback. Partial/obscured motifs retained in inventory but not scored as full observed motifs. Presets and colour modes are explicit user selections, not an automatic fallback. Archive crops keep their needs_review status.',results},null,2));
for(const e of cases){
  const row={...e,runs:[]};results.push(row);
  if(['incomplete','obscured'].includes(e.cropStatus)){row.status=e.cropStatus;await save();continue;}
  const dir=`${output}/${e.id}`;await fs.mkdir(dir);
  try{
    let s=await source(e),baseQuad=e.quad;
    if(e.variant){
      const v=e.variant,scale=v.scale||1;const canvas=createCanvas(Math.round(s.imageWidth*scale),Math.round(s.imageHeight*scale)),ctx=canvas.getContext('2d');ctx.drawImage(s.canvas,0,0,canvas.width,canvas.height);
      if(v.jpeg){const encoded=canvas.toBuffer('image/jpeg',{quality:v.jpeg});ctx.drawImage(await loadImage(encoded),0,0);}
      const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;s={...s,canvas,rgba,imageWidth:canvas.width,imageHeight:canvas.height,rgbaSha256:hash(rgba)};
      baseQuad=e.quad.map(([x,y])=>[(x+(v.dx||0))*scale,(y+(v.dy||0))*scale]);
    }
    const center=[0,1].map(k=>baseQuad.reduce((sum,p)=>sum+p[k],0)/4),quad=baseQuad.map(p=>p.map((v,k)=>center[k]+(v-center[k])*(1-(e.cropInsetFraction||0))));
    row.effectiveQuad=quad;row.input={fileSha256:s.fileSha256,rgbaSha256:s.rgbaSha256,width:s.imageWidth,height:s.imageHeight};
    // A source thumbnail with the exact accepted quadrilateral, for review.
    const roi=e.roi||[Math.max(0,Math.min(...quad.map(p=>p[0]))-20),Math.max(0,Math.min(...quad.map(p=>p[1]))-80),Math.min(s.imageWidth,Math.max(...quad.map(p=>p[0]))+20),Math.min(s.imageHeight,Math.max(...quad.map(p=>p[1]))+20)];
    const thumb=createCanvas(320,320),tc=thumb.getContext('2d'),scale=Math.min(320/(roi[2]-roi[0]),320/(roi[3]-roi[1]));tc.fillStyle='#edf0f1';tc.fillRect(0,0,320,320);tc.drawImage(s.canvas,roi[0],roi[1],roi[2]-roi[0],roi[3]-roi[1],0,0,(roi[2]-roi[0])*scale,(roi[3]-roi[1])*scale);tc.strokeStyle='#00d6a8';tc.lineWidth=1.5;tc.beginPath();quad.forEach(([x,y],i)=>i?tc.lineTo((x-roi[0])*scale,(y-roi[1])*scale):tc.moveTo((x-roi[0])*scale,(y-roi[1])*scale));tc.closePath();tc.stroke();await fs.writeFile(`${dir}/source.png`,thumb.toBuffer());
    for(const name of presets){
      const cfg={...config,...(name==='simplify'?SIMPLIFIED_PREPROCESSING:name==='mixture'?{mode:'red-white-mixture'}:name==='direct'?{algorithm:'direct',roundHidden:false}:name==='direct-mixture'?{algorithm:'direct',roundHidden:false,mode:'red-white-mixture'}:name==='unmerged'?{snapRadius:0}:{}),...(e.diagnostic||{})},r={preset:name,settings:cfg};row.runs.push(r);const start=performance.now();const folder=`${dir}/${name}`;await fs.mkdir(folder);
      try{
        const p=prepare({type:'pixels',rgba:s.rgba,imageWidth:s.imageWidth,imageHeight:s.imageHeight,quad,cropProvenance:{method:e.provenance||e.cropNote||'Fixed visual annotation, not solver-derived',catalog:args['crop-overrides']||(args.recrops?`${args.recrops}/cases.json`:e.group==='individual'?'scripts/inverse/photo-cases.json':'scripts/inverse/hard-photo-cases.json'),status:e.locatorStatus||e.cropStatus,case:e.id}},cfg);
        r.direct=!!p.target.metadata.direct;r.curves=p.target.curves.length;r.preprocessing=p.preview.metadata;r.preprocessSeconds=(performance.now()-start)/1000;
        await fs.writeFile(`${dir}/crop.png`,pixelPNG(p.preview.rgb,p.preview.resolution,3));await fs.writeFile(`${folder}/mask.png`,pixelPNG(p.preview.mask,p.preview.resolution));await fs.writeFile(`${folder}/target.svg`,p.preview.vector);
        const result=await design(p.target,cfg),rendered=await renderExportedWeave(result.files['cut_geometry.json'],p.preview.resolution);
        r.report=result.report;r.independentImageError=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==p.preview.mask[i]),0)/rendered.mask.length;
        const band=Math.round(p.preview.resolution*.05);let edgePixels=0,edgeErrors=0,interiorErrors=0;for(let i=0;i<rendered.mask.length;i++){const edge=Math.min(i%p.preview.resolution,Math.floor(i/p.preview.resolution),p.preview.resolution-1-i%p.preview.resolution,p.preview.resolution-1-Math.floor(i/p.preview.resolution))<band;edgePixels+=edge;const miss=rendered.mask[i]!==p.preview.mask[i];if(edge)edgeErrors+=miss;else interiorErrors+=miss;}r.spatialError={bandFraction:.05,edgePixels,edgeErrors,interiorErrors,edgeMismatch:edgeErrors/edgePixels,interiorMismatch:interiorErrors/(rendered.mask.length-edgePixels)};
        r.passed=result.report.templateChecksPassed&&r.independentImageError<=.03;r.status=r.passed?'validated':r.report.solver?.termination||'validation_failed';
        for(const[f,data]of Object.entries(result.files))await fs.writeFile(`${folder}/${f}`,data);await fs.writeFile(`${folder}/independent-weave.png`,rendered.png);
      }catch(err){r.passed=false;r.message=err.message;r.report=err.report;r.status=err.report?.termination||(/transitions/.test(err.message)?'border_mismatch':/too (?:many|much)|too detailed|too large/i.test(err.message)?'too_detailed':'error');}
      r.seconds=(performance.now()-start)/1000;console.log(e.label,e.id,name,r.status,r.curves||'',r.seconds.toFixed(2),r.independentImageError?.toFixed(4)||r.message);await save();
    }
    row.status=row.runs.some(r=>r.passed)?'validated':'failed';
  }catch(err){row.status='input_error';row.message=err.message;console.log(e.id,row.message);}
  await save();
}
await writeHardPhotoReport(`${output}/results.json`);
console.log(`Hard-photo evidence: ${output}`);

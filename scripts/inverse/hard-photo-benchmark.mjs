/** Original photographed motifs through crop, classification and template fitting. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET,GENERAL_PRESET,SIMPLIFIED_PREPROCESSING} from '../../src/lib/inverse/presets.js';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {readHardPhoto,hardPhotoCatalogCases} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {writeHardPhotoReport} from './hard-photo-report.mjs';
import {cropEvidence} from './crop-evidence.mjs';
import {reviewMaterialSamples,validateMaterialSamples} from './photo-material-samples.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const seconds=Number(args.seconds||10),runId=new Date().toISOString().replace(/[:.]/g,'-')+(args.shard?`-shard-${args.shard.replace('/','-of-')}`:''),output=args.output||`tmp/inverse-hard-photos/${runId}`,cropMode=args.crop||'automatic',targetMode=args.target||'photo';
if(!Number.isFinite(seconds)||seconds<1||seconds>180)throw new Error('Use --seconds=1..180');
if(!['automatic','fixed'].includes(cropMode))throw new Error('Use --crop=automatic|fixed');
if(!['photo','mask'].includes(targetMode))throw new Error('Use --target=photo|mask');
if(cropMode==='automatic'&&(args.recrops||args['crop-overrides']))throw new Error('Explicit crop overrides require --crop=fixed');
if(args.catalog&&args.recrops)throw new Error('Use --catalog or --recrops, not both');
const presets=args.presets?args.presets.split(','):['automatic'];
if(presets.some(p=>!['automatic','general','simplify','mixture','direct','direct-mixture','unmerged'].includes(p)))throw new Error('Unknown preset; use automatic for the production pipeline');
if(targetMode==='mask'&&presets.some(p=>!['automatic','direct','direct-mixture'].includes(p)))throw new Error('The mask track requires automatic or direct fitting.');
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),collage=JSON.parse(await fs.readFile('scripts/inverse/hard-photo-cases.json')),photos=JSON.parse(await fs.readFile('scripts/inverse/photo-cases.json'));
const materialSampleFile='scripts/inverse/fixtures/photo-material-samples.json',materialSampleBytes=await fs.readFile(materialSampleFile),materialSamples=JSON.parse(materialSampleBytes);
if(materialSamples.schema!=='woven-heart-photo-material-samples-1')throw new Error('Unexpected material review schema.');
materialSamples.cases.forEach(validateMaterialSamples);
const sourceHashes={};async function hashTree(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=`${dir}/${e.name}`;if(e.isDirectory())await hashTree(f);else sourceHashes[f]=hash(await fs.readFile(f));}}await hashTree('static/inverse/core');await hashTree('static/inverse/locator');for(const f of ['scripts/inverse/hard-photo-cases.json','scripts/inverse/photo-cases.json','scripts/inverse/hard-photo-data.mjs','scripts/inverse/hard-photo-target.mjs','scripts/inverse/hard-photo-benchmark.mjs','scripts/inverse/hard-photo-report.mjs','scripts/inverse/crop-evidence.mjs','scripts/inverse/export-renderer.mjs','src/lib/inverse/presets.js'])sourceHashes[f]=hash(await fs.readFile(f));
let cases=[...collage.cases.map(e=>({...e,group:'collage',...collage.source})),...photos.cases.map(e=>({...e,group:'individual',label:e.id,cropStatus:'visually_reviewed'}))];
sourceHashes[materialSampleFile]=hash(materialSampleBytes);sourceHashes['scripts/inverse/photo-material-samples.mjs']=hash(await fs.readFile('scripts/inverse/photo-material-samples.mjs'));
if(args.catalog){const bytes=await fs.readFile(args.catalog);sourceHashes[args.catalog]=hash(bytes);cases=hardPhotoCatalogCases(JSON.parse(bytes));}
cases=cases.filter(e=>!args.ids||args.ids.split(',').includes(e.id));
if(!cases.length&&!args.recrops)throw new Error('No cases selected');
if(args.recrops){
  const root=args.recrops,entries=JSON.parse(await fs.readFile(`${root}/cases.json`));
  sourceHashes[`${root}/cases.json`]=hash(await fs.readFile(`${root}/cases.json`));
  cases=entries.filter(e=>!args.ids||args.ids.split(',').includes(e.id)).map(e=>({...e,group:'recrop-handoff',label:e.id,cropStatus:'needs_review',file:`${root}/inputs/cases/${e.id}/rectified.png`,quad:[[0,0],[256,0],[256,256],[0,256]],sourceQuad:e.quad,roi:[0,0,256,256],cropNote:'Fixed archive rectification; locator needs_review retained. No extra inset.'}));
}
if(args['crop-overrides']){const overrides=JSON.parse(await fs.readFile(args['crop-overrides']));sourceHashes[args['crop-overrides']]=hash(await fs.readFile(args['crop-overrides']));cases=cases.map(e=>{const override=overrides.find(x=>x.id===e.id);return override?{...e,...override,cropStatus:override.locatorStatus||override.cropStatus||e.cropStatus,originalQuad:e.quad}:e;});}
if(args.shard){const[index,count]=args.shard.split('/').map(Number);if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||index>=count)throw new Error('Use --shard=index/count with zero-based index.');cases=cases.filter((_,i)=>i%count===index);}
if(cropMode==='automatic'&&args.variants?.split(',').some(v=>v.startsWith('crop-')))throw new Error('Crop-coordinate perturbations require --crop=fixed; automatic cropping supports jpeg-75 and half-resolution');
if(args.perturb==='true')cases=cases.flatMap(e=>[
  {name:'crop-x-plus-1',dx:1,dy:0},{name:'crop-y-plus-1',dx:0,dy:1},
  {name:'jpeg-75',jpeg:.75},{name:'half-resolution',scale:.5},
].filter(v=>(cropMode==='fixed'||!v.dx&&!v.dy)&&(!args.variants||args.variants.split(',').includes(v.name))).map(variant=>({...e,id:e.id+'--'+variant.name,originalId:e.id,variant})));
if(args.diagnostics){
  const options=JSON.parse(await fs.readFile(args.diagnostics));
  cases=cases.flatMap(e=>(options[e.id]||[]).map((setting,i)=>({...e,id:e.id+'--diagnostic-'+i,originalId:e.id,diagnostic:setting})));
}
const sources=new Map(),results=[];
async function source(e){if(sources.has(e.file))return sources.get(e.file);const s=await readHardPhoto(e);sources.set(e.file,s);return s;}
function pixelPNG(pixels,n,channels=1){const c=createCanvas(n,n),ctx=c.getContext('2d'),out=ctx.createImageData(n,n);for(let i=0;i<n*n;i++){const rgb=channels===3?pixels.slice(3*i,3*i+3):pixels[i]?[185,19,19]:[255,255,255];out.data.set([...rgb,255],4*i);}ctx.putImageData(out,0,0);return c.toBuffer('image/png');}
async function sourcePreview(s,roi,quad,file){
  const thumb=createCanvas(320,320),tc=thumb.getContext('2d'),scale=Math.min(320/(roi[2]-roi[0]),320/(roi[3]-roi[1]));tc.fillStyle='#edf0f1';tc.fillRect(0,0,320,320);tc.drawImage(s.canvas,roi[0],roi[1],roi[2]-roi[0],roi[3]-roi[1],0,0,(roi[2]-roi[0])*scale,(roi[3]-roi[1])*scale);
  if(quad){tc.strokeStyle='#00d6a8';tc.lineWidth=1.5;tc.beginPath();quad.forEach(([x,y],i)=>i?tc.lineTo((x-roi[0])*scale,(y-roi[1])*scale):tc.moveTo((x-roi[0])*scale,(y-roi[1])*scale));tc.closePath();tc.stroke();}
  await fs.writeFile(file,thumb.toBuffer());
}
const config={...(args.recrops?{resolution:256}:{}),timeLimit:seconds,trials:0};
const timingDefinitions={
  timeLimit:'Requested solver search allowance, not an end-to-end latency limit.',
  detectionSeconds:'Crop detection wall time. Decoding and the source thumbnail are outside this timer.',
  runSeconds:'Each runs[].seconds starts after crop detection and source-thumbnail creation. Includes preparation, solving, validation, export, independent replay and per-case artifact writes; excludes decoding and detection.',
  solveAndValidationSeconds:'design() wall time, including final validation and generated export data. Excludes crop detection, preparation, independent replay and writing artifacts.',
  independentReplaySeconds:'Separate exported-SVG renderer wall time; not part of application solving.',
  browser:'Actual click-to-ready latency is measured separately by paint-browser-test.mjs.'
};
const save=()=>fs.writeFile(`${output}/results.json`,JSON.stringify({runId,shard:args.shard||null,sourceHashes,settings:config,timingDefinitions,cropMode,targetMode,targetDescription:targetMode==='mask'?'Mal import-to-mask track: the classified crop is prepared afresh as binary artwork before fitting. The original photo and mask are unchanged. Browser interaction and editable SVG checks are separate.':'Photo-engine track: retain the classifier probability field. Default Lab and Otsu classification is already binary; explicit mixture mode is continuous. Compare fitting-input hashes before attributing differences to the objective.',presets,criteria:{maximumIndependentImageError:.03,imageErrorDomain:'Observed classified pixels only; missing source pixels are excluded. Historical runs without this field scored the entire square.',geometryAndPaperRequired:true,sourceFeaturesRequired:true,cropMustBeReviewable:true,groundTruthCuttingPaths:false,physicalAssemblyTested:false},description:cropMode==='automatic'?'Original photograph pixels and rough collage selections only. Production crop proposals remain fixed during fitting. No historical overlap corners, insets or cutting templates enter the solver. All complete cases remain in the denominator, including missing crops.':'Fixed historical assistant-reviewed crops, before solver feedback. These approximate corners were disputed and are not ground truth. This diagnostic track isolates fitting from automatic detection; its targets and scores differ from automatic cropping. Partial/obscured motifs remain in the inventory.',results},null,2));
for(const e of cases){
  const row={...e,runs:[]};results.push(row);
  if(['incomplete','obscured'].includes(e.cropStatus)){row.status=e.cropStatus;await save();continue;}
  const dir=`${output}/${e.id}`;await fs.mkdir(dir);
  try{
    let s=await source(e),baseQuad=e.quad;
    // Apply source-pixel observations only to their exact, unmodified photo.
    // JPEG/resolution variants need separately transformed/reviewed labels.
    const materialReview=!e.variant&&materialSamples.cases.find(a=>a.id===(e.originalId||e.id)&&a.source.sha256===s.fileSha256&&a.source.width===s.imageWidth&&a.source.height===s.imageHeight);
    if(e.variant){
      const v=e.variant,scale=v.scale||1;const canvas=createCanvas(Math.round(s.imageWidth*scale),Math.round(s.imageHeight*scale)),ctx=canvas.getContext('2d');ctx.drawImage(s.canvas,0,0,canvas.width,canvas.height);
      if(v.jpeg){const encoded=canvas.toBuffer('image/jpeg',{quality:v.jpeg});ctx.drawImage(await loadImage(encoded),0,0);}
      const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;s={...s,canvas,rgba,imageWidth:canvas.width,imageHeight:canvas.height,rgbaSha256:hash(rgba)};
      baseQuad=e.quad?.map(([x,y])=>[(x+(v.dx||0))*scale,(y+(v.dy||0))*scale]);
    }
    let quad;
    if(cropMode==='automatic'){
      const scale=e.variant?.scale||1,roi=e.roi?.map(v=>v*scale),started=performance.now(),detected=detectHeartCrops(s,{roi}),candidate=detected.candidates[0];
      row.detectionSeconds=(performance.now()-started)/1000;row.detection={status:detected.status,reason:detected.reason,roi,count:detected.candidates.length,candidate,assessment:cropEvidence(candidate,{width:s.imageWidth,height:s.imageHeight})};
      if(!candidate){row.status='no_crop';if(materialReview)row.materialReview=reviewMaterialSamples(materialReview);row.input={fileSha256:s.fileSha256,rgbaSha256:s.rgbaSha256,width:s.imageWidth,height:s.imageHeight};await sourcePreview(s,roi||[0,0,s.imageWidth,s.imageHeight],null,`${dir}/source.png`);row.hasSourcePreview=true;await save();continue;}
      quad=candidate.quad;row.locatorStatus=detected.status;
    }else{
      if(!Array.isArray(baseQuad)||baseQuad.length!==4)throw new Error('Fixed cropping requires four recorded corners');
      const center=[0,1].map(k=>baseQuad.reduce((sum,p)=>sum+p[k],0)/4);quad=baseQuad.map(p=>p.map((v,k)=>center[k]+(v-center[k])*(1-(e.cropInsetFraction||0))));
    }
    row.effectiveQuad=quad;row.input={fileSha256:s.fileSha256,rgbaSha256:s.rgbaSha256,width:s.imageWidth,height:s.imageHeight};
    // A source thumbnail with the exact accepted quadrilateral, for review.
    const roi=e.roi?.map(v=>v*(e.variant?.scale||1))||[Math.max(0,Math.min(...quad.map(p=>p[0]))-20),Math.max(0,Math.min(...quad.map(p=>p[1]))-80),Math.min(s.imageWidth,Math.max(...quad.map(p=>p[0]))+20),Math.min(s.imageHeight,Math.max(...quad.map(p=>p[1]))+20)];
    await sourcePreview(s,roi,quad,`${dir}/source.png`);row.hasSourcePreview=true;
    for(const name of presets){
      const cfg={...GENERAL_PRESET,...(name==='automatic'?AUTOMATIC_PRESET:name==='simplify'?SIMPLIFIED_PREPROCESSING:name==='mixture'?{mode:'red-white-mixture'}:name==='direct'?{algorithm:'direct',roundHidden:false}:name==='direct-mixture'?{algorithm:'direct',roundHidden:false,mode:'red-white-mixture'}:name==='unmerged'?{snapRadius:0}:{}),...config,...(e.diagnostic||{})},r={preset:name,settings:cfg};row.runs.push(r);const start=performance.now();const folder=`${dir}/${name}`;await fs.mkdir(folder);
      try{
        const p=prepare({type:'pixels',rgba:s.rgba,imageWidth:s.imageWidth,imageHeight:s.imageHeight,quad,cropProvenance:{method:cropMode==='automatic'?'First production automatic crop from source pixels and optional rough ROI':e.provenance||e.cropNote||'Fixed visual annotation, not solver-derived',catalog:args['crop-overrides']||args.catalog||(args.recrops?`${args.recrops}/cases.json`:e.group==='individual'?'scripts/inverse/photo-cases.json':'scripts/inverse/hard-photo-cases.json'),status:row.locatorStatus||e.cropStatus,case:e.id}},cfg);
        r.direct=!!p.target.metadata.direct;r.curves=p.target.curves.length;r.preprocessing=p.preview.metadata;r.preprocessSeconds=(performance.now()-start)/1000;
        if(materialReview)r.materialReview={classified:reviewMaterialSamples(materialReview,{mask:p.preview.mask,resolution:p.preview.resolution,quad})};
        r.maskSha256=hash(p.preview.mask);r.observation=p.preview.validMask?{method:'complete-bilinear-support',sha256:hash(p.preview.validMask),observedPixels:p.preview.validMask.reduce((sum,v)=>sum+v,0),totalPixels:p.preview.mask.length}:{method:'fully-observed',observedPixels:p.preview.mask.length,totalPixels:p.preview.mask.length};const probability=p.target.sourceImage?.probability;if(probability)r.probabilitySha256=hash(new Uint8Array(probability.buffer,probability.byteOffset,probability.byteLength));
        await fs.writeFile(`${dir}/crop.png`,pixelPNG(p.preview.rgb,p.preview.resolution,3));await fs.writeFile(`${folder}/mask.png`,pixelPNG(p.preview.mask,p.preview.resolution));await fs.writeFile(`${folder}/target.svg`,p.preview.vector);
        const prepareStart=performance.now(),target=hardPhotoTarget(p,targetMode,cfg);r.maskPreparationSeconds=(performance.now()-prepareStart)/1000;
        if(p.preview.validMask){r.observation.file='observed.bin';await fs.writeFile(`${folder}/observed.bin`,p.preview.validMask);}
        r.fittingMaskSha256=hash(target.sourceImage.mask);const fittingProbability=target.sourceImage.probability;
        if(fittingProbability){r.fittingProbabilitySha256=hash(new Uint8Array(fittingProbability.buffer,fittingProbability.byteOffset,fittingProbability.byteLength));r.fittingSoftPixels=fittingProbability.reduce((sum,p)=>sum+Number(p>0&&p<1),0);}
        const solveStart=performance.now(),result=await design(target,cfg);r.solveAndValidationSeconds=(performance.now()-solveStart)/1000;
        const replayStart=performance.now(),rendered=await renderExportedWeave(result.files['cut_geometry.json'],p.preview.resolution);r.independentReplaySeconds=(performance.now()-replayStart)/1000;
        r.report=result.report;r.independentImageComparison=referenceError(p.target.sourceImage,rendered.mask);r.independentImageError=r.independentImageComparison.mismatchFraction;
        // Keep the old full-square denominator as an explicit diagnostic;
        // missing placeholders are not photographic evidence.
        r.allPixelImageError=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==p.preview.mask[i]),0)/rendered.mask.length;
        const band=Math.round(p.preview.resolution*.05);let edgePixels=0,edgeErrors=0,interiorErrors=0;for(let i=0;i<rendered.mask.length;i++){if(p.preview.validMask&&!p.preview.validMask[i])continue;const edge=Math.min(i%p.preview.resolution,Math.floor(i/p.preview.resolution),p.preview.resolution-1-i%p.preview.resolution,p.preview.resolution-1-Math.floor(i/p.preview.resolution))<band;edgePixels+=edge;const miss=rendered.mask[i]!==p.preview.mask[i];if(edge)edgeErrors+=miss;else interiorErrors+=miss;}r.spatialError={bandFraction:.05,edgePixels,edgeErrors,interiorErrors,observedPixels:r.observation.observedPixels,edgeMismatch:edgePixels?edgeErrors/edgePixels:null,interiorMismatch:r.observation.observedPixels>edgePixels?interiorErrors/(r.observation.observedPixels-edgePixels):null};
        r.independentFeatures=auditFeatureFidelity(p.target.sourceImage,rendered.mask,result.report.settings);r.passed=result.report.templateChecksPassed&&r.independentFeatures.passed&&r.independentImageError<=.03;r.status=r.passed?'validated':'needs_review';
        if(materialReview)r.materialReview.exported=reviewMaterialSamples(materialReview,{mask:rendered.mask,resolution:p.preview.resolution,quad,phase:r.materialReview.classified.phase});
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

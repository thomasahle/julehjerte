/** Replay conversion on fixed independently fitted geometry. This benchmark
 * supplies no saved geometry to the fitter and measures no solve timings. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {Resvg} from '@resvg/resvg-js';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../static/inverse/core/engine.js';

const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const output=arg('output')||'tmp/conversion-fidelity',reference=arg('reference')||'a67f008';
const inputs={browser:arg('browser')||'tmp/grid-parity-release-browser',hunodan:arg('hunodan')||'tmp/grid-parity-hunodan',weighted:arg('weighted')||'tmp/grid-parity-weighted'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const referenceCommit=execFileSync('git',['rev-parse','--verify','--end-of-options',reference+'^{commit}'],{encoding:'utf8'}).trim();
const converter='src/lib/inverse/toHeartDesign.ts';
const previousSource=execFileSync('git',['show',`${referenceCommit}:${converter}`],{encoding:'utf8'});
// Baseline dependencies must be the real previous versions, not a new helper
// hidden behind an old entry point. The converter itself is loaded from Git.
const changed=execFileSync('git',['diff',referenceCommit,'--name-only','--','src/lib','static/inverse/core'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.deepEqual(changed.filter(f=>![converter,'src/lib/inverse/conversionFidelity.ts','src/lib/inverse/conversionFidelity.test.ts','src/lib/components/paint/PaintPage.svelte'].includes(f)),[],'Baseline numerical/rendering dependencies changed');
const baselineId='/__baseline_conversion__.ts';
const loader=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}},plugins:[{name:'previous-converter',resolveId(id){if(id===baselineId)return id;},load(id){if(id===baselineId)return previousSource;}}]});
const current=await loader.ssrLoadModule('/'+converter),previous=await loader.ssrLoadModule(baselineId);
const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
const {shapeCells}=await loader.ssrLoadModule('/src/lib/paint/frame.ts');
const {computeWeaveData}=await loader.ssrLoadModule('/src/lib/rendering/svgWeave.ts');
const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
const results=[],report={referenceCommit,previousSourceSha256:hash(previousSource),runtime:process.version,sourceHashes:{},inputReports:{},results,
 method:'Fixed saved geometry, same unforced symmetry for all three conversions. Raw means tolerance zero. Previous converter loaded from Git; its dependencies must be unchanged. Target error uses the original mask and free-border weights. Independent coverage uses an antialiased 4x Resvg image averaged onto original pixels. No fitting or solve timing in this replay; conversion timers exclude scoring and SVG rendering.'};
for(const file of[converter,'src/lib/inverse/conversionFidelity.ts','src/lib/inverse/simplifyCurves.ts','src/lib/paint/rasterize.ts','src/lib/rendering/svgWeave.ts','scripts/inverse/conversion-fidelity-benchmark.mjs'])report.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(output,{recursive:true});

function svgFor(design){
 const weave=computeWeaveData(design.fingers,design.gridSize,design.weaveParity??0),b=weave.overlap;
 const paths=[...weave.rightOnTopStrips,...weave.leftOnTopStrips].map(s=>s.pathData).join(' ');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.left} ${b.top} ${b.width} ${b.height}"><rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="white"/><path d="${paths}" fill="black" fill-rule="evenodd"/></svg>`;
}
function score(design,mask,weights){
 const mass=weights?weights.reduce((s,w)=>s+w,0):mask.data.length;
 const raster=rasterizeDesign(design,mask.size).data;
 let mismatch=0,coverage=0;
 const svg=svgFor(design),side=mask.size*4,pixels=new Resvg(svg,{fitTo:{mode:'width',value:side}}).render().pixels;
 for(let y=0;y<mask.size;y++)for(let x=0;x<mask.size;x++){
  const i=y*mask.size+x,w=weights?.[i]??1;if(!w)continue;
  if(raster[i]!==mask.data[i])mismatch+=w;
  let fraction=0;
  for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++)fraction+=(1-pixels[4*((y*4+yy)*side+x*4+xx)]/255)/16;
  coverage+=w*Math.abs(fraction-mask.data[i]);
 }
 return {sourceError:mismatch/mass,coverageError:coverage/mass,segments:current.segmentsPerCut(design).fingers.reduce((s,f)=>s+f.segments.length,0),geometryPassed:findFingersWithIssues(design.fingers,intersectionMarginPx(inferOverlapRect(design.fingers,design.gridSize))).size===0};
}
const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
try{
 for(const [kind,directory]of Object.entries(inputs)){
  const bytes=await fs.readFile(directory+'/results.json'),saved=JSON.parse(bytes);report.inputReports[kind]={directory,sha256:hash(bytes)};
  for(const [file,expected]of Object.entries(saved.engineSha256||{}))assert.equal(hash(await fs.readFile(file)),expected,`Saved solve engine changed: ${file}`);
  for(const entry of saved.results){
   assert.equal(entry.passed,true,'Only completed validated solves may enter this conversion replay');
   const id=kind==='browser'?`${entry.browser}-${entry.name}`:kind==='hunodan'?entry.id:`${entry.shape}-${entry.size}-${entry.strategy}${entry.variant==='original'?'':'-'+entry.variant}`;
   const row={kind,id};results.push(row);
   try{
    const dir=path.join(directory,id),geometryBytes=await fs.readFile(dir+'/cut_geometry.json'),geometry=JSON.parse(geometryBytes);row.geometrySha256=hash(geometryBytes);
    let mask,weights;
    if(kind==='browser'){
     const p=JSON.parse(await fs.readFile(dir+'/prepared.json'));mask={size:p.resolution,data:Uint8Array.from(p.mask)};weights=p.weights?Float64Array.from(p.weights):undefined;
    }else if(kind==='hunodan'){
     const e=catalog.cases.find(e=>e.id===id),bytes=await fs.readFile(e.source);assert.equal(hash(bytes),e.sourceSha256);
     const im=await loadImage(bytes),[x,y,x1,y1]=e.photoROI,c=createCanvas(x1-x,y1-y),ctx=c.getContext('2d');ctx.drawImage(im,-x,-y);
     const rgba=ctx.getImageData(0,0,c.width,c.height).data;assert.equal(hash(rgba),e.decodedPixelsSha256);
     const p=prepare({type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba,quad:e.quad},saved.cfg);mask={size:p.preview.resolution,data:p.preview.mask};
    }else{
     assert.equal(entry.strategy,'weighted','This replay uses original source targets with free-border weights');
     const im=await loadImage(dir+'/target.png'),c=createCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);
     const rgba=ctx.getImageData(0,0,c.width,c.height).data;mask={size:c.width,data:Uint8Array.from({length:c.width*c.height},(_,i)=>Number(rgba[4*i]<128))};weights=shapeCells({mode:'free',shape:'diamond',size:entry.size},mask.size);
    }
    row.maskSha256=hash(mask.data);if(weights)row.weightsSha256=hash(new Uint8Array(Float64Array.from(weights).buffer));
    const options={name:id,reference:{mask,weights}},designs={};
    const order=results.length%2?['previous','current','raw']:['raw','current','previous'];
    for(const policy of order){
     const start=performance.now();
     const converted=policy==='raw'?current.convertCutGeometry(geometry,{...options,tolerance:0}):(policy==='previous'?previous:current).convertValidatedCutGeometry(geometry,options);
     const seconds=(performance.now()-start)/1000;designs[policy]=converted.design;
     row[policy]={...score(converted.design,mask,weights),seconds,validation:converted.editorValidation};
    }
    assert.equal(row.current.geometryPassed,true);
    assert.equal(row.current.validation.fidelity.passed,true);
    assert.ok(row.current.sourceError<=row.raw.sourceError+1e-12,'Simplification increased original-mask disagreement');
    row.passed=true;
    // Inspectable vector artifacts keep antialiasing and subpixel seam evidence.
    const caseDir=path.join(output,id);await fs.mkdir(caseDir,{recursive:true});
    for(const policy of['previous','current','raw'])await fs.writeFile(path.join(caseDir,policy+'.svg'),svgFor(designs[policy]));
   }catch(error){row.passed=false;row.failure=error.stack;process.exitCode=1;}
   console.log(JSON.stringify(row));await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');
  }
 }
}finally{await loader.close();}

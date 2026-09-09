/** Full automatic solves of fixed and freely editable border objectives.
 * Every case starts from a new mask and fresh grids; no fitted templates are
 * supplied. Scores come from independently rendered exported Bézier curves.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture,topHatFixture} from './motif-fixture.mjs';
import {shapeCells,solveTargetMask} from '../../src/lib/paint/frame.ts';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {renderExportedWeave} from './export-renderer.mjs';

const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const progressSetting=arg('progress-geometry')??'false';
if(!['true','false'].includes(progressSetting))throw new Error('progress-geometry must be true or false.');
const progressGeometry=progressSetting==='true';
const output=arg('output')||'tmp/weighted-solve',shapes=(arg('shapes')||'top-hat,hat,house,circle').split(','),sizes=(arg('sizes')||'.64,.84').split(',').map(Number),seconds=Number(arg('seconds')||10),strategies=(arg('strategies')||'checker,weighted').split(','),variants=(arg('variants')||'original').split(','),n=200;
if(shapes.some(s=>!['top-hat','hat','house','circle'].includes(s))||sizes.some(s=>!Number.isFinite(s)||s<.3||s>.84)||!Number.isFinite(seconds)||seconds<1||seconds>180||strategies.some(s=>!['checker','weighted'].includes(s))||variants.some(v=>!['original','inverted','shifted','free-noise'].includes(v)))throw new Error('Invalid benchmark arguments.');
await fs.mkdir(output,{recursive:true});
const results=[],engineSha256={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file=`static/inverse/core/${name}`;engineSha256[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
const report={runtime:process.version,cpu:cpus()[0]?.model,engineSha256,resolution:n,seconds,variants,progressGeometry,
  method:'Fresh automatic mask solves. Frames fixed before fitting. Checker strategy replaces the band; weighted strategy retains the original mask with zero band weights. Exported controls are independently rendered with resvg. Geometric and paper checks remain enabled. Variants swap both colours, translate by one source pixel in both axes with background fill, or alter only zero-weight pixels; the protected frame stays fixed.',results};
let index=0;
for(const shape of shapes)for(const size of sizes){
  const original=shape==='top-hat'?topHatFixture(n):motifFixture(shape,{n}).original,c=createCanvas(n,n),ctx=c.getContext('2d');ctx.drawImage(await loadImage(original),0,0);
  const rgba=ctx.getImageData(0,0,n,n).data,baseMask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128)),frame={mode:'free',shape:'diamond',size},weights=shapeCells(frame,n);
  for(const variant of variants){
    const mask=Uint8Array.from(baseMask,(v,i)=>variant==='inverted'?1-v:variant==='shifted'?(i%n&&i>=n?baseMask[i-n-1]:0):variant==='free-noise'&&!weights[i]?(i*2654435761>>>29)&1:v);
    const checker=solveTargetMask({size:n,data:mask},frame,4).data;
    const targetCanvas=createCanvas(n,n),targetContext=targetCanvas.getContext('2d'),targetPixels=targetContext.createImageData(n,n);
    for(let i=0;i<mask.length;i++){const colour=mask[i]?0:255;targetPixels.data.set([colour,colour,colour,255],4*i);}targetContext.putImageData(targetPixels,0,0);
  for(const strategy of index++%2?strategies.toReversed():strategies){
    const row={shape,size,variant,strategy};results.push(row);const dir=`${output}/${shape}-${size}-${strategy}${variant==='original'?'':`-${variant}`}`;await fs.mkdir(dir,{recursive:true});
    try{
      row.geometrySnapshots=0;row.geometryBytes=0;
      const onProgress=event=>{if(typeof event.geometry==='string'){row.geometrySnapshots++;row.geometryBytes+=event.geometry.length;}};
      const cfg={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0,progressGeometry},cpuStart=process.cpuUsage(),start=performance.now();
      const p=prepare({type:'mask',resolution:n,mask:strategy==='checker'?checker:mask,...(strategy==='weighted'?{weights}:{})},cfg),preparedAt=performance.now(),answer=await design(p.target,cfg,onProgress);
      Object.assign(row,{seconds:(performance.now()-start)/1000,prepareSeconds:(preparedAt-start)/1000,templateChecksPassed:answer.report.templateChecksPassed,geometryPassed:answer.report.validation.passed,paper:answer.report.manufacturing.status,counts:answer.report.slits,solver:answer.report.solver,imageError:answer.report.imageError});
      const cpu=process.cpuUsage(cpuStart);row.cpuSeconds=(cpu.user+cpu.system)/1e6;
      const woven=await renderExportedWeave(answer.files['cut_geometry.json'],n);
      row.independent=referenceError({resolution:n,mask,weights},woven.mask);
      row.qualityPassed=row.templateChecksPassed&&row.geometryPassed&&row.paper==='pass'&&row.independent.mismatchFraction<=.03;
      row.speedPassed=row.seconds<=seconds;row.passed=row.qualityPassed&&row.speedPassed;
      await fs.writeFile(`${dir}/original.png`,original);await fs.writeFile(`${dir}/target.png`,targetCanvas.toBuffer('image/png'));await fs.writeFile(`${dir}/woven.png`,woven.png);
      for(const [name,data] of Object.entries(answer.files))await fs.writeFile(`${dir}/${name}`,data);
    }catch(error){row.failure=error.message;row.failureReport=error.report;row.passed=false;}
    if(!row.passed)process.exitCode=1;
    console.log(JSON.stringify({shape,size,variant,strategy,seconds:row.seconds,counts:row.counts,protectedError:row.independent?.mismatchFraction,qualityPassed:row.qualityPassed,speedPassed:row.speedPassed,passed:row.passed,failure:row.failure}));
    await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2));
  }
  }
}
if(!results.length)throw new Error('No weighted cases selected');
console.log(output);

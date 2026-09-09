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
const output=arg('output')||'tmp/weighted-solve',shapes=(arg('shapes')||'top-hat,hat,house,circle').split(','),sizes=(arg('sizes')||'.64,.84').split(',').map(Number),seconds=Number(arg('seconds')||10),strategies=(arg('strategies')||'checker,weighted').split(','),n=200;
if(shapes.some(s=>!['top-hat','hat','house','circle'].includes(s))||sizes.some(s=>!Number.isFinite(s)||s<.3||s>.84)||!Number.isFinite(seconds)||seconds<1||seconds>180||strategies.some(s=>!['checker','weighted'].includes(s)))throw new Error('Invalid benchmark arguments.');
await fs.mkdir(output,{recursive:true});
const results=[],engineSha256={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file=`static/inverse/core/${name}`;engineSha256[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
const report={runtime:process.version,cpu:cpus()[0]?.model,engineSha256,resolution:n,seconds,
  method:'Fresh automatic mask solves. Frames fixed before fitting. Checker strategy replaces the band; weighted strategy retains the original mask with zero band weights. Exported controls are independently rendered with resvg. Geometric and paper checks remain enabled.',results};
let index=0;
for(const shape of shapes)for(const size of sizes){
  const original=shape==='top-hat'?topHatFixture(n):motifFixture(shape,{n}).original,c=createCanvas(n,n),ctx=c.getContext('2d');ctx.drawImage(await loadImage(original),0,0);
  const rgba=ctx.getImageData(0,0,n,n).data,mask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128)),frame={mode:'free',shape:'diamond',size},weights=shapeCells(frame,n),checker=solveTargetMask({size:n,data:mask},frame,4).data;
  for(const strategy of index++%2?strategies.toReversed():strategies){
    const row={shape,size,strategy};results.push(row);const dir=`${output}/${shape}-${size}-${strategy}`;await fs.mkdir(dir,{recursive:true});
    try{
      const cfg={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0},start=performance.now();
      const p=prepare({type:'mask',resolution:n,mask:strategy==='checker'?checker:mask,...(strategy==='weighted'?{weights}:{})},cfg),preparedAt=performance.now(),answer=await design(p.target,cfg);
      Object.assign(row,{seconds:(performance.now()-start)/1000,prepareSeconds:(preparedAt-start)/1000,templateChecksPassed:answer.report.templateChecksPassed,geometryPassed:answer.report.validation.passed,paper:answer.report.manufacturing.status,counts:answer.report.slits,solver:answer.report.solver,imageError:answer.report.imageError});
      const woven=await renderExportedWeave(answer.files['cut_geometry.json'],n);
      row.independent=referenceError({resolution:n,mask,weights},woven.mask);
      row.passed=row.geometryPassed&&row.paper==='pass'&&row.independent.mismatchFraction<=.03;
      await fs.writeFile(`${dir}/original.png`,original);await fs.writeFile(`${dir}/woven.png`,woven.png);
      for(const [name,data] of Object.entries(answer.files))await fs.writeFile(`${dir}/${name}`,data);
    }catch(error){row.failure=error.message;row.failureReport=error.report;row.passed=false;}
    console.log(JSON.stringify({shape,size,strategy,seconds:row.seconds,counts:row.counts,protectedError:row.independent?.mismatchFraction,passed:row.passed,failure:row.failure}));
    await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2));
  }
}
console.log(output);

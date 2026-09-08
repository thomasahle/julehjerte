/** Compare border objectives on the same freshly solved geometry. This is a
 * refinement experiment, not a replacement for the full automatic pipeline:
 * initialization, matching selection and export image gates still need weights.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture,topHatFixture} from './motif-fixture.mjs';
import {shapeCells,solveTargetMask} from '../../src/lib/paint/frame.ts';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {renderExportedWeave} from './export-renderer.mjs';

const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const output=arg('output')||'tmp/weighted-border',shapes=(arg('shapes')||'top-hat,hat,house,circle').split(','),sizes=(arg('sizes')||'.64,.84').split(',').map(Number),seconds=Number(arg('seconds')||10),steps=Number(arg('steps')||160),n=200;
if(shapes.some(s=>!['top-hat','hat','house','circle'].includes(s))||sizes.some(s=>!Number.isFinite(s)||s<.3||s>.84)||!Number.isFinite(seconds)||seconds<1||seconds>60||!Number.isInteger(steps)||steps<1||steps>1000)throw new Error('Invalid benchmark arguments.');
await fs.mkdir(output,{recursive:true});
const results=[],hashes={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file=`static/inverse/core/${name}`;hashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
const report={runtime:process.version,cpu:cpus()[0]?.model,engineSha256:hashes,sourceResolution:n,steps,initialSolveBudgetSeconds:seconds,
  method:'Each case starts with a fresh automatic solve of the existing checker-border target. Every refinement starts independently from that same pair. Fixed steps, no deadline. Targets and frame coordinates are fixed. No reference cutting templates are read. Geometry and paper are audited; this is not full weighted-pipeline or browser validation.',results};
for(const shape of shapes)for(const size of sizes){
  const row={shape,size,variants:[]};results.push(row);const dir=`${output}/${shape}-${size}`;await fs.mkdir(dir,{recursive:true});
  try{
    const original=shape==='top-hat'?topHatFixture(n):motifFixture(shape,{n}).original,canvas=createCanvas(n,n),ctx=canvas.getContext('2d');
    ctx.drawImage(await loadImage(original),0,0);const rgba=ctx.getImageData(0,0,n,n).data,motif=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128));
    const frame={mode:'free',shape:'diamond',size},region=shapeCells(frame,n),target=solveTargetMask({size:n,data:motif},frame,4),inside=region.reduce((s,v)=>s+v,0);
    await fs.writeFile(`${dir}/original.png`,original);
    for(let i=0;i<motif.length;i++)rgba.set(target.data[i]?[185,20,20,255]:[255,255,255,255],4*i);
    const cfg=settings({...AUTOMATIC_PRESET,resolution:n,timeLimit:seconds,trials:0}),start=performance.now();
    const prepared=prepare({type:'pixels',imageWidth:n,imageHeight:n,rgba},cfg),answer=await design(prepared.target,cfg);
    row.initialSeconds=(performance.now()-start)/1000;row.initialTemplateChecksPassed=answer.report.templateChecksPassed;
    const initial=loadSolutionJSON(answer.files['cut_geometry.json']),identical=matchingSummary(initial).identical;
    const record=async(name,solution,extra={})=>{
      const geometry=solutionJSON(solution),woven=await renderExportedWeave(geometry,n);
      const disagreements=(target,where)=>woven.mask.reduce((s,v,i)=>s+(where(i)?Number(v!==target[i]):0),0);
      const value={name,...extra,geometryPassed:validate(solution,cfg,{checkImage:false}).passed,paperPassed:materialAudit(solution,cfg).passed,identicalSheets:matchingSummary(solution).identical,
        motifError:disagreements(motif,i=>region[i])/inside,checkerBorderChanges:disagreements(target.data,i=>!region[i])/(n*n-inside),wholeOriginalError:disagreements(motif,()=>true)/(n*n),wholeCheckerError:disagreements(target.data,()=>true)/(n*n)};
      row.variants.push(value);await fs.writeFile(`${dir}/${name}.png`,woven.png);await fs.writeFile(`${dir}/${name}.json`,JSON.stringify(geometry));
    };
    await record('baseline',initial);
    const variants=[
      {name:'checker-refinement',probability:Float64Array.from(target.data)},
      {name:'neutral-gray',probability:Float64Array.from(motif,(p,i)=>region[i]?p:.5)},
      {name:'weighted-free',probability:Float64Array.from(motif),weights:region},
      {name:'weighted-soft',probability:Float64Array.from(motif),weights:Float64Array.from(region,v=>v?1:.25)},
    ];
    for(const variant of variants){
      const paths=initial.paths.map((family,f)=>family.map((_,i)=>curvesOf(initial,f,i).map(c=>c.p))),graph=new CurveGraph(paths,cfg.width),started=performance.now();
      const fit=refineCurves(graph,variant.probability,n,initial.graph.target.phase?-1:1,{...cfg,preferMatchingSheets:false},{weights:variant.weights,steps,rate:.008,identicalSheets:identical,selection:'mask',input:initial.graph.target});
      await record(variant.name,fit.graph.solution(fit.points,fit.phase,initial.graph.target),{seconds:(performance.now()-started)/1000,steps:fit.steps,selectedError:fit.error,primitives:fit.primitives});
    }
  }catch(error){row.failure=error.message;}
  console.log(JSON.stringify(row));await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2));
}
console.log(output);

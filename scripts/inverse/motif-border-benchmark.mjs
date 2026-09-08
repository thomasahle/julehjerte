/** Feasibility experiment for motif creation / boundary repair.
 * Generic synthetic silhouettes are original fixtures, not artwork from issues #8/#9.
 * Border pixels may change; centre disagreement is measured separately.
 * This explores checker-border seeds, not arbitrary border optimization.
 */
import fs from 'node:fs/promises';
import {motifFixture} from './motif-fixture.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave}from'./export-renderer.mjs';
const arg=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const output=arg('output')||'tmp/inverse-motif-border',seconds=Number(arg('seconds')||10),cellCounts=(arg('cells')||'3,4,5').split(',').map(Number),shapes=(arg('shapes')||'hat,house').split(',');
if(!Number.isFinite(seconds)||seconds<1||seconds>180||cellCounts.some(n=>!Number.isInteger(n)||n<2||n>8))throw new Error('Invalid seconds or cells');
if(shapes.some(s=>!['hat','house','circle'].includes(s)))throw new Error('Invalid shape');
await fs.mkdir(output,{recursive:true});
const n=240,rows=[];
for(const shape of shapes)for(const cells of cellCounts){
 const {input,motif,original,border,png}=motifFixture(shape,{n,cells});
 const cfg={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0,width:100,minWidth:1.5};const row={shape,cells,border};rows.push(row);const started=performance.now();
 try{const p=prepare(input,cfg),r=await design(p.target,cfg),woven=await renderExportedWeave(r.files['cut_geometry.json'],n);let mismatch=0,observed=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(Math.min(x,y,n-1-x,n-1-y)>=border*n){observed++;mismatch+=Number(woven.mask[y*n+x]!==motif[y*n+x]);}
 Object.assign(row,{interiorError:mismatch/observed,checks:r.report.templateChecksPassed,geometry:r.report.validation.passed,paper:r.report.manufacturing.status,overallError:r.report.imageError?.mismatchFraction,slits:r.report.slits,route:r.report.solver.automatic?.selected,algorithm:r.report.solver.algorithm,primitives:r.report.solver.primitives,tracedSegments:(p.target.boundarySeed||p.target).curves.length});
 const dir=`${output}/${shape}-${cells}`;await fs.mkdir(dir,{recursive:true});await fs.writeFile(`${dir}/original.png`,original);for(const[f,b]of Object.entries(r.files))await fs.writeFile(`${dir}/${f}`,b);await fs.writeFile(`${dir}/woven.png`,woven.png);await fs.writeFile(`${dir}/input.png`,png);
 }catch(e){row.failure=e.message;}row.seconds=(performance.now()-started)/1000;console.log(row);await fs.writeFile(`${output}/results.json`,JSON.stringify(rows,null,2));
}

for(const shape of shapes){
 const valid=rows.filter(r=>r.shape===shape&&r.geometry&&r.paper==='pass').sort((a,b)=>a.interiorError-b.interiorError);
 console.log('Best valid centre fit:',valid[0]||{shape,failure:'No valid candidate'});
}

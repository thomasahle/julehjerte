/** Controlled refinement study of translating/tilting endpoints. Counts are
 * supplied to isolate refinement; this is not an image-to-topology benchmark. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {chordMap} from '../../static/inverse/core/direct/symmetry.js';
const root=path.resolve(process.env.INVERSE_TANGENT_ENGINE||'static/inverse'),out=process.env.INVERSE_TANGENT_OUT||'tmp/moving-chord-study';
const load=file=>import(pathToFileURL(path.join(root,file)).href);
const {CurveGraph}=await load('core/direct/curves.js'),{refineCurves}=await load('core/direct/refine.js'),{settings}=await load('core/settings.js');
const {materialAudit}=await load('core/material.js');
const {sampleWeave,validate}=await load('core/validate.js'),{symmetryReport}=await load('core/direct/symmetry.js'),{solutionJSON}=await load('core/graph.js');
const independent=process.env.INVERSE_TANGENT_INDEPENDENT==='1',selected=process.env.INVERSE_TANGENT_CASES?.split(',');
await fs.mkdir(out,{recursive:true});const report={engineRoot:root,independent,method:'Fresh straight grids with supplied counts; 301 refinement steps, 200-pixel optimization, independent 400-pixel geometric scoring.',results:[]};
function initialGraph(seed){
 if(!independent)return new CurveGraph(seed,100);
 // Diagnostic only: allocate independent coincident handles, then restore
 // the exact original coordinates. No pixel or curve shape is perturbed.
 const jittered=seed.map((family,f)=>family.map((cut,i)=>cut.map(c=>c.map((p,k)=>k===1||k===2?[p[0]+1e-4*(1+32*f+i),p[1]]:p.slice()))));
 const graph=new CurveGraph(jittered,100);
 graph.families.forEach((family,f)=>family.forEach((pi,i)=>graph.paths[pi].forEach(([e,d],j)=>{
  const ids=d===1?graph.edges[e]:graph.edges[e].toReversed();
  ids.forEach((id,k)=>{graph.points[2*id]=seed[f][i][j][k][0];graph.points[2*id+1]=seed[f][i][j][k][1];});
 })));
 return graph;
}
function paths(counts,mode,bulge,target){
 return counts.map((count,f)=>Array.from({length:count},(_,i)=>{
  const centre=(i+1)*100/(count+1),shift=target&&mode==='anti'?3:0,tilt=target&&mode==='sym'?3:0;
  const first=[centre+shift-tilt,0],last=[centre+shift+tilt,100],p=Cubic.line(first,last).p;
  if(target&&bulge){const dx=last[0]-first[0],l=Math.hypot(dx,100),amount=bulge*(i%2?-1:1);p[1]=[p[1][0]+100/l*amount,p[1][1]-dx/l*amount];const m=chordMap(first,last,mode);p[2]=[m.L[0]*p[1][0]+m.L[1]*p[1][1]+m.t[0],m.L[2]*p[1][0]+m.L[3]*p[1][1]+m.t[1]];}
  return[f?p.map(([x,y])=>[y,x]):p];
 }));
}
for(const mode of ['sym','anti'])for(const count of [1,2,3])for(const unequal of [false,true])for(const bulge of [0,4]){
 const counts=[count,count+Number(unequal)],name=`${mode}-${counts.join('x')}-bend${bulge}`,cfg=settings({symmetry:{withinCurve:mode},preferMatchingSheets:false});
 if(selected&&!selected.includes(name))continue;
 const target=new CurveGraph(paths(counts,mode,bulge,true),100),graph=initialGraph(paths(counts,mode,bulge,false)),truth=target.solution(target.points,1);
 assert.ok(validate(truth,cfg,{checkImage:false}).passed,`${name}: invalid target`);assert.ok(materialAudit(truth,cfg).passed,`${name}: invalid target paper`);assert.deepEqual(symmetryReport(truth,cfg.symmetry).honoured,[`withinCurve:${mode}`]);
 const mask=sampleWeave(truth,200),reference=sampleWeave(truth,400),error=bits=>bits.reduce((s,v,i)=>s+Number(v!==reference[i]),0)/reference.length;
 const initialError=error(sampleWeave(graph.solution(graph.points,1),400)),start=performance.now();
 const fit=refineCurves(graph,Float64Array.from(mask),200,1,cfg,{steps:301,input:{sourceImage:{resolution:200,mask}}});
 const seconds=(performance.now()-start)/1000,solution=graph.solution(fit.points,1),symmetry=symmetryReport(solution,cfg.symmetry);
 const row={name,mode,counts,bulge,initialError,error:error(sampleWeave(solution,400)),preparedMaskError:sampleWeave(solution,200).reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length,seconds,steps:fit.steps,geometry:fit.geometryPassed,paper:fit.paperPassed,symmetry,initialPoints:graph.points.length/2,finalEndpoints:graph.nested(fit.points).map(f=>f.map(p=>[p[0][0],p.at(-1)[3]]))};
 report.results.push(row);await fs.writeFile(path.join(out,`${name}.json`),JSON.stringify(solutionJSON(solution)));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 assert.ok(row.geometry&&row.paper);assert.deepEqual(symmetry.honoured,[`withinCurve:${mode}`]);console.log(`${name}: ${(100*initialError).toFixed(3)}% -> ${(100*row.error).toFixed(3)}%, ${seconds.toFixed(3)}s, ${fit.steps} steps`);
}

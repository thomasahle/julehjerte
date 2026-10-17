import { benchmarkArtifactEntries } from './benchmark-artifacts.mjs';
/** Full image-to-template counterparts of the controlled chord study.
 * Only mask pixels and requested symmetry reach the automatic fitter.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {movingChordPaths} from './fixtures/moving-chords.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const root=path.resolve(process.env.INVERSE_CONTROL_ENGINE||'static/inverse'),out=process.env.INVERSE_CONTROL_OUT||'tmp/control-identity-solve';
const load=file=>import(pathToFileURL(path.join(root,file)).href),hash=x=>createHash('sha256').update(x).digest('hex');
const {CurveGraph}=await load('core/direct/curves.js'),{sampleWeave,validate}=await load('core/validate.js');
const {materialAudit}=await load('core/material.js'),{AUTOMATIC_PRESET}=await load('core/presets.js'),{settings}=await load('core/settings.js');
const {prepare,design}=await load('core/engine.js'),{solutionJSON}=await load('core/graph.js');
const report={root,method:'Fresh automatic solves from 200-pixel masks and requested chord symmetry. No cut counts, fitted seeds or templates supplied. Independent resvg export scoring.',sourceHashes:{},results:[]};
for(const name of await fs.readdir(path.join(root,'core'),{recursive:true}))if(/\.(js|wasm|c)$/.test(name))report.sourceHashes[name]=hash(await fs.readFile(path.join(root,'core',name)));
await fs.mkdir(out,{recursive:true});
for(const mode of ['sym','anti'])for(const count of [1,2,3])for(const unequal of [false,true])for(const bulge of [0,4]){
  const expectedCounts=[count,count+Number(unequal)],name=`${mode}-${expectedCounts.join('x')}-bend${bulge}`,dir=path.join(out,name);
  const cfg={...AUTOMATIC_PRESET,symmetry:{withinCurve:mode},preferMatchingSheets:false,timeLimit:10,trials:0,progressGeometry:true};
  const truth=new CurveGraph(movingChordPaths(expectedCounts,mode,bulge,{target:true})),solution=truth.solution(truth.points,1),mask=sampleWeave(solution,200);
  assert.ok(validate(solution,settings(cfg),{checkImage:false}).passed&&materialAudit(solution,settings(cfg)).passed);
  const row={name,expectedCounts,mode,bulge,inputSha256:hash(mask)};report.results.push(row);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'input.json'),JSON.stringify({type:'mask',resolution:200,mask:Array.from(mask)}));
  await fs.writeFile(path.join(dir,'truth.json'),JSON.stringify(solutionJSON(solution)));
  try{
    const candidates=new Set(),start=performance.now(),p=prepare({type:'mask',resolution:200,mask},cfg);
    row.preparedSha256=hash(p.preview.mask);
    const answer=await design(p.target,cfg,()=>{},{onCandidate:packet=>candidates.add(packet.geometry)});
    row.seconds=(performance.now()-start)/1000;row.retainedCandidates=candidates.size;
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],p.preview.resolution);
    row.error=replay.mask.reduce((s,v,i)=>s+Number(v!==p.preview.mask[i]),0)/replay.mask.length;
    const data=JSON.parse(answer.files['cut_geometry.json']);row.foundCounts=[data.A_overlap_paths.length,data.B_overlap_paths.length];
    row.geometry=answer.report.validation.passed;row.paper=answer.report.manufacturing.status;row.symmetry=answer.report.symmetry;
    row.passed=answer.report.templateChecksPassed&&row.geometry&&row.paper==='pass'&&row.symmetry.honoured.includes('withinCurve:'+mode)&&row.error<=.03;
    for(const [file,value]of benchmarkArtifactEntries(answer.files))await fs.writeFile(path.join(dir,file),value);
    await fs.writeFile(path.join(dir,'independent.png'),replay.png);
  }catch(error){row.passed=false;row.failure=error.message;row.failureReport=error.report;}
  if(!row.passed)process.exitCode=1;
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(name,JSON.stringify({error:row.error,seconds:row.seconds,counts:row.foundCounts,passed:row.passed,failure:row.failure}));
}

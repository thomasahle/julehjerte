/** Can ordinary curve refinement repair a rejected clearance initializer? */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.measurement||!args.prepared||!args.output||Object.keys(args).some(k=>!['measurement','prepared','output','runtime'].includes(k)))throw new Error('Use --measurement=<captured result> --prepared=<recorded input> --output=<new directory>, optionally --runtime=<inverse directory>.');
const runtime=path.resolve(args.runtime||'static/inverse'),out=path.resolve(args.output),relative=path.relative(process.cwd(),out);
assert.ok(relative&&!relative.startsWith('../')&&relative!=='..'&&!path.isAbsolute(relative),'Output must be inside this worktree.');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={};
for(const name of await fs.readdir(path.join(runtime,'core'),{recursive:true})){
 const file=path.join(runtime,'core',name);if((await fs.stat(file)).isFile())sourceHashes[file]=sha(await fs.readFile(file));
}
for(const file of [process.argv[1],'scripts/inverse/export-renderer.mjs',args.measurement,args.prepared])sourceHashes[path.resolve(file)]=sha(await fs.readFile(file));
const load=file=>import(pathToFileURL(path.join(runtime,'core',file)));
const {loadSolutionJSON,solutionJSON,curvesOf}=await load('graph.js'),{CurveGraph}=await load('direct/curves.js');
const {resizeObjective}=await load('direct/image-objective.js'),{refineCurves}=await load('direct/refine.js');
const {sampleWeave,validate}=await load('validate.js'),{materialAudit}=await load('material.js'),{prepare}=await load('engine.js');
const {auditFeatureFidelity}=await load('feature-shapes.js'),{renderExportedWeave}=await import(pathToFileURL(path.resolve('scripts/inverse/export-renderer.mjs')));
const record=JSON.parse(await fs.readFile(args.measurement)),preparedBytes=await fs.readFile(args.prepared);
assert.equal(sha(preparedBytes),record.preparedSha256,'Use the exact recorded prepared image.');
const saved=JSON.parse(preparedBytes),n=saved.resolution,[dx,dy]=record.shift,clamp=v=>Math.max(0,Math.min(n-1,v));
assert.ok(Number.isInteger(n)&&n>=16&&n<=4096&&saved.mask.length===n*n&&saved.mask.every(v=>v===0||v===1));
assert.ok(Number.isInteger(dx)&&Number.isInteger(dy)&&!saved.weights,'This clearance diagnostic requires an unweighted binary source.');
const mask=Uint8Array.from(saved.mask,(_,i)=>saved.mask[clamp(Math.floor(i/n)-dy)*n+clamp(i%n-dx)]),cfg=record.reportSettings;
const input=prepare({type:'mask',mask,resolution:n},cfg).target,source=input.sourceImage;
assert.deepEqual(mask,source.mask);assert.equal(sha(mask),record.maskSha256);
const original=record.solver.clearanceComparison.alternativeGeometryWitness;
assert.ok(original,'Capture the rejected clearance geometry before running this diagnostic.');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);const rows=[];
const report={scope:'Fresh bounded refinement of an actual rejected clearance candidate, not a fresh full solve or editable SVG conversion. All original validation thresholds retained; uncertain paper receives the existing 700-pixel audit.',runtime,nodeVersion:process.version,inputMaskSha256:sha(mask),sourceHashes,rows};
for(const milliseconds of [500,1500,2500]){
 const solution=loadSolutionJSON(original),paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)));
 const graph=new CurveGraph(paths,cfg.width),phase=solution.graph.target.phase?-1:1;
 const objective=resizeObjective(source.probability,n,256);
 const started=performance.now(),candidate=refineCurves(graph,objective.probability,256,phase,{...cfg,preferMatchingSheets:false},{input,steps:750,rate:.05,deadline:started+milliseconds});
 const elapsed=(performance.now()-started)/1000,result=candidate.graph.solution(candidate.points,candidate.phase,input),geometry=validate(result,cfg,{checkImage:false,finalGeometry:true}),paper=materialAudit(result,cfg);
 const serialized=JSON.stringify(solutionJSON(result)),woven=sampleWeave(result,n),imageError=woven.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
 const folder=path.join(out,String(milliseconds));await fs.mkdir(folder);await fs.writeFile(path.join(folder,'cut_geometry.json'),serialized+'\n');
 const row={milliseconds,elapsed,steps:candidate.steps,geometry,initialPaper:paper.summary,paper:paper.summary,materialResolution:cfg.materialResolution,sourceImageError:imageError,history:candidate.history,scores:[]};
 for(const resolution of [n,2*n]){
  const target=Uint8Array.from({length:resolution**2},(_,i)=>mask[Math.floor(Math.floor(i/resolution)*n/resolution)*n+Math.floor(i%resolution*n/resolution)]),render=await renderExportedWeave(serialized,resolution);
  const features=auditFeatureFidelity({mask:target,resolution},render.mask,cfg),error=render.mask.reduce((s,v,i)=>s+Number(v!==target[i]),0)/target.length;
  row.scores.push({resolution,error,featuresPassed:features.passed});await fs.writeFile(path.join(folder,`weave-${resolution}.png`),render.png);
 }
 let verifiedPaper=paper;
 if(geometry.passed&&paper.status==='uncertain'&&cfg.materialResolution<700&&row.scores.every(r=>r.error<=cfg.maxImageError&&r.featuresPassed)){
  const auditStart=performance.now();verifiedPaper=materialAudit(result,{...cfg,materialResolution:700});
  row.finerAuditSeconds=(performance.now()-auditStart)/1000;row.materialResolution=700;row.paper=verifiedPaper.summary;
 }
 row.passed=geometry.passed&&verifiedPaper.passed&&row.scores.every(r=>r.error<=cfg.maxImageError&&r.featuresPassed);
 rows.push(row);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({milliseconds,elapsed,passed:row.passed,issues:geometry.issues,paper:row.paper.status,materialResolution:row.materialResolution,scores:row.scores}));
}
for(const [file,digest]of Object.entries(sourceHashes))assert.equal(sha(await fs.readFile(file)),digest,`Source changed: ${file}`);
assert.equal(sha(source.mask),record.maskSha256);
report.sourceFilesVerified=Object.keys(sourceHashes).length;
await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');

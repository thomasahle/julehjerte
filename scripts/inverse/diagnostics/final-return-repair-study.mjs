/** Replay final return repair on frozen outputs; never refit or change a target. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
for(const key of ['runtime','corpus','output'])if(!args[key])throw new Error('Use --runtime=<isolated runtime> --corpus=<saved release> --output=<new directory>');
const load=file=>import(pathToFileURL(path.resolve(args.runtime,'inverse/core',file)).href);
const {CurveGraph}=await load('direct/curves.js'),{validate}=await load('validate.js'),{projectShortReturns}=await load('direct/short-return-project.js');
const {loadSolutionJSON,curvesOf,solutionJSON}=await load('graph.js'),{materialAudit}=await load('material.js'),{auditFeatureFidelityChange}=await load('feature-shapes.js');
const {symmetryReport}=await load('direct/symmetry.js'),{matchingSummary}=await load('direct/matching.js');
const {renderExportedWeave}=await import(pathToFileURL(path.resolve('scripts/inverse/export-renderer.mjs')).href);
const {diagnosticSubdivisions,subdivideDiagnosticPaths}=await import(pathToFileURL(path.resolve('scripts/inverse/self-return-subdivision-study.mjs')).href);
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
const rows=[],sourceHashes={};
for(const file of [process.argv[1],path.join(args.runtime,'source.json'),'scripts/inverse/export-renderer.mjs','scripts/inverse/self-return-subdivision-study.mjs'])sourceHashes[file]=hash(await fs.readFile(file));
const runtimeManifest=JSON.parse(await fs.readFile(path.join(args.runtime,'source.json')));
for(const [file,digest]of Object.entries(runtimeManifest.sourceHashes))assert.equal(hash(await fs.readFile(file)),digest,file+' runtime source changed');
for(const group of ['hunodan','photos'])for(const relative of (await fs.readdir(path.join(args.corpus,group),{recursive:true})).filter(f=>f.endsWith('/cut_geometry.json')).sort()){
 const id=relative.split('/')[0],file=path.join(args.corpus,group,relative),reportFile=path.join(path.dirname(file),'report.json');
 const bytes=await fs.readFile(file),reportBytes=await fs.readFile(reportFile),record=JSON.parse(reportBytes),cfg=record.settings;
 const original=loadSolutionJSON({...JSON.parse(bytes),schema:'heartcurves-2',units:'mm'}),paths=original.paths.map((f,k)=>f.map((_,s)=>curvesOf(original,k,s).map(c=>c.p)));
 const graph=new CurveGraph(paths,cfg.width),phase=original.graph.target.phase?-1:1,input=original.graph.target,originalPoints=graph.points.slice();
 const maskFile=group==='hunodan'?path.join(args.corpus,'hunodan-editor-input',id,'automatic/mask.png'):path.join(path.dirname(file),'mask.png');
 const maskBytes=await fs.readFile(maskFile),im=await loadImage(maskBytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');assert.equal(im.width,im.height);
 ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,im.width,im.height).data,mask=Uint8Array.from({length:im.width**2},(_,i)=>Number(rgba[4*i]>rgba[4*i+1]+20));
 const baseline=await renderExportedWeave(bytes.toString(),im.width),reconstructed=await renderExportedWeave(solutionJSON(graph.solution(originalPoints,phase,input)),im.width);assert.deepEqual(baseline.mask,reconstructed.mask);
 const error=m=>m.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length,solution=graph.solution(originalPoints,phase,input),auditStart=performance.now(),initialAudit=validate(solution,cfg,{checkImage:false});
 const row={name:group+'/'+id,source:file,sourceGeometrySha256:hash(bytes),sourceReportSha256:hash(reportBytes),sourceMaskSha256:hash(maskBytes),resolution:im.width,originallyAccepted:record.templateChecksPassed,initialAudit,initialAuditMilliseconds:performance.now()-auditStart,errorBefore:error(baseline.mask),symmetryBefore:symmetryReport(solution,cfg.symmetry),matchingBefore:matchingSummary(solution),attempts:[]};
 let selected=originalPoints,selectedGeometry=solutionJSON(solution),selectedMask=baseline.mask;
 if(!initialAudit.passed&&initialAudit.issues.every(i=>i.type==='short_self_clearance')){
  const deadline=performance.now()+1000;
  for(const hiddenOnly of [true,false]){
   const start=performance.now(),repair=projectShortReturns(graph,originalPoints,phase,input,cfg,{initialAudit,hiddenOnly,deadline,maxIterations:64,maxMilliseconds:1000});
   const attempt={hiddenOnly,milliseconds:performance.now()-start,report:repair.report,accepted:false};row.attempts.push(attempt);
   if(!repair.points)continue;
   const candidate=graph.solution(repair.points,phase,input),geometry=solutionJSON(candidate),woven=await renderExportedWeave(geometry,im.width);
   attempt.error=error(woven.mask);attempt.features=auditFeatureFidelityChange({mask,resolution:im.width},baseline.mask,woven.mask,cfg);attempt.paper=materialAudit(candidate,cfg).summary;
   attempt.symmetry=symmetryReport(candidate,cfg.symmetry);attempt.matching=matchingSummary(candidate);
   attempt.maximumCoordinateMovement=Math.max(...repair.points.map((v,i)=>Math.abs(v-originalPoints[i])));
   const fixedPreserved=repair.points.every((v,i)=>!graph.fixed[i]||v===originalPoints[i]);
   const symmetryPreserved=attempt.symmetry.requested.length===attempt.symmetry.honoured.length;
   attempt.gates={fixedPreserved,symmetryPreserved,matchingPreserved:!row.matchingBefore.identical||attempt.matching.identical,imageNotWorse:attempt.error<=row.errorBefore,paper:attempt.paper.status==='pass',features:attempt.features.passed,geometry:repair.validation.passed};
   attempt.accepted=Object.values(attempt.gates).every(Boolean);
   if(attempt.accepted){selected=repair.points;selectedGeometry=geometry;selectedMask=woven.mask;break;}
  }
 }
 row.changed=selected!==originalPoints;row.errorAfter=error(selectedMask);row.representations=[];
 for(const [representation,knots]of Object.entries(diagnosticSubdivisions))for(const reflect of [false,true]){
  const divided=subdivideDiagnosticPaths(graph.nested(selected),knots,reflect,graph.width),other=new CurveGraph(divided.paths,graph.width),check=validate(other.solution(other.points,phase,input),cfg,{checkImage:false});
  row.representations.push({representation,reflect,passed:check.passed,issues:check.issues});
 }
 row.geometryPassed=row.representations.every(r=>r.passed);assert.deepEqual(graph.points,originalPoints);assert.equal(hash(await fs.readFile(file)),hash(bytes));
 if(row.changed){const output=path.join(args.output,group,id);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'cut_geometry.json'),JSON.stringify(selectedGeometry,null,2)+'\n');const render=await renderExportedWeave(selectedGeometry,im.width);await fs.writeFile(path.join(output,'weave.png'),render.png);}
 rows.push(row);await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify({scope:'Frozen-output final repair with an unchanged target and a one-second shared repair allowance. No fresh fitting, browser timing, actual editor conversion or physical assembly claim.',arguments:args,sourceHashes,rows},null,2)+'\n');
 console.log(JSON.stringify({name:row.name,originallyAccepted:row.originallyAccepted,initialPassed:initialAudit.passed,changed:row.changed,errorBefore:row.errorBefore,errorAfter:row.errorAfter,geometryPassed:row.geometryPassed,matchingBefore:row.matchingBefore.identical,attempts:row.attempts.map(a=>({hiddenOnly:a.hiddenOnly,milliseconds:a.milliseconds,accepted:a.accepted,gates:a.gates}))}));
}
console.log(JSON.stringify({cases:rows.length,originallyAccepted:rows.filter(r=>r.originallyAccepted).length,changed:rows.filter(r=>r.changed).map(r=>r.name),geometryPassed:rows.filter(r=>r.geometryPassed).length,representations:rows.reduce((n,r)=>n+r.representations.length,0)}));

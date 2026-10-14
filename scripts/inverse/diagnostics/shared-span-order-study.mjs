/** Additional sharing on frozen accepted exports, without fresh fitting. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.corpus||!args.output||Object.keys(args).some(k=>!['runtime','corpus','output'].includes(k)))throw new Error('Use --corpus=<saved release> --output=<new directory>, optionally --runtime=<inverse directory>.');
const runtime=path.resolve(args.runtime||'static/inverse'),out=path.resolve(args.output),relative=path.relative(process.cwd(),out);
assert.ok(relative&&!relative.startsWith('../')&&relative!=='..'&&!path.isAbsolute(relative),'Output must be inside this worktree.');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const load=file=>import(pathToFileURL(path.join(runtime,'core',file)));
const {loadSolutionJSON,solutionJSON}=await load('graph.js'),{finalizeShared}=await load('direct/share.js');
const {validate}=await load('validate.js'),{materialAudit}=await load('material.js');
const {matchingSummary}=await load('direct/matching.js'),{auditFeatureFidelityChange}=await load('feature-shapes.js');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={};
for(const name of await fs.readdir(path.join(runtime,'core'),{recursive:true})){
  const file=path.join(runtime,'core',name);if((await fs.stat(file)).isFile())sourceHashes[file]=sha(await fs.readFile(file));
}
for(const file of [process.argv[1],'scripts/inverse/export-renderer.mjs'])sourceHashes[path.resolve(file)]=sha(await fs.readFile(file));
const rows=[],record={scope:'Additional sharing on saved accepted exports; fixed cuts and PNG targets, no fresh solve, cropping, count selection or browser timing. Sharing has no time cutoff and retains the ordinary twelve-round limit. All acceptance gates remain enabled.',runtime,sourceHashes,rows};
for(const group of ['hunodan','photos'])for(const file of (await fs.readdir(path.join(args.corpus,group),{recursive:true})).filter(f=>f.endsWith('/cut_geometry.json')).sort()){
  const id=file.split('/')[0],folder=path.join(args.corpus,group,path.dirname(file)),geometryFile=path.join(folder,'cut_geometry.json'),reportFile=path.join(folder,'report.json');
  const reportBytes=await fs.readFile(reportFile),report=JSON.parse(reportBytes);
  if(!report.templateChecksPassed)continue;
  const bytes=await fs.readFile(geometryFile),solution=loadSolutionJSON(JSON.parse(bytes));
  const maskFile=group==='hunodan'?path.join(args.corpus,'hunodan-editor-input',id,'automatic/mask.png'):path.join(folder,'mask.png');
  const maskBytes=await fs.readFile(maskFile),im=await loadImage(maskBytes);assert.equal(im.width,im.height);
  const canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const rgba=ctx.getImageData(0,0,im.width,im.height).data,mask=Uint8Array.from({length:im.width**2},(_,i)=>Number(rgba[4*i]>rgba[4*i+1]+20));
  const source={resolution:im.width,mask,probability:Float64Array.from(mask)};solution.graph.target.sourceImage=source;
  const serializedBefore=JSON.stringify(solutionJSON(solution)),matchingBefore=matchingSummary(solution);
  const started=performance.now(),after=finalizeShared(solution,report.settings),milliseconds=performance.now()-started;
  const serializedAfter=JSON.stringify(solutionJSON(after)),geometry=validate(after,report.settings,{checkImage:false,finalGeometry:true}),paper=materialAudit(after,report.settings).summary;
  assert.equal(geometry.passed,true,`${group}/${id}: final geometry`);assert.equal(paper.status,'pass',`${group}/${id}: paper`);
  assert.ok(!matchingBefore.identical||matchingSummary(after).identical,`${group}/${id}: matching sheets`);
  assert.equal(JSON.stringify(solutionJSON(solution)),serializedBefore,'Input geometry must not change.');
  const before=await renderExportedWeave(serializedBefore,im.width),replayed=await renderExportedWeave(serializedAfter,im.width);
  const error=render=>render.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
  const coverageError=render=>render.coverage.reduce((s,v,i)=>s+Math.abs(v-mask[i]),0)/mask.length;
  const features=auditFeatureFidelityChange(source,before.mask,replayed.mask,report.settings);
  const row={name:`${group}/${id}`,milliseconds,geometryFile,geometrySha256:sha(bytes),reportSha256:sha(reportBytes),maskFile,maskSha256:sha(maskBytes),serializedGeometrySha256:sha(serializedAfter),changed:serializedBefore!==serializedAfter,sharing:after.report.finalSharing||null,geometryPassed:geometry.passed,paperStatus:paper.status,features,errorBefore:error(before),errorAfter:error(replayed),coverageErrorBefore:coverageError(before),coverageErrorAfter:coverageError(replayed)};
  const output=path.join(out,group,id);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'cut_geometry.json'),serializedAfter+'\n');await fs.writeFile(path.join(output,'weave.png'),replayed.png);
  rows.push(row);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({name:row.name,milliseconds,changed:row.changed,accepted:row.sharing?.accepted.length||0,errorBefore:row.errorBefore,errorAfter:row.errorAfter,serializedGeometrySha256:row.serializedGeometrySha256}));
}
for(const [file,digest]of Object.entries(sourceHashes))assert.equal(sha(await fs.readFile(file)),digest,`Source changed: ${file}`);
record.sourceFilesVerified=Object.keys(sourceHashes).length;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,changed:rows.filter(r=>r.changed).length,milliseconds:rows.reduce((s,r)=>s+r.milliseconds,0),sourceFilesVerified:record.sourceFilesVerified}));

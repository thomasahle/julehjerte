/** Reuse exact paired fits in the existing independent editable-paper audit. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.run&&args.output&&Object.keys(args).every(k=>['run','output','unique'].includes(k)));
assert.ok(args.unique===undefined||args.unique==='true');
const raw=await fs.readFile(path.join(args.run,'report.json')),report=JSON.parse(raw),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(report.schema,'material-pair-pipeline-1');assert.equal(report.status,'complete');
await fs.mkdir(args.output);const results=[],reusedMethodRows=[],externalReports=new Map();
for(const row of report.rows){
 if(!row.independentImage)continue;
 if(args.unique&&row.reusedFitFrom){
  const reference=row.reusedFitFrom.report;let source=report;
  if(reference){
   if(!externalReports.has(reference.path)){
    const bytes=await fs.readFile(reference.path);assert.equal(hash(bytes),reference.sha256);
    const external=JSON.parse(bytes);assert.equal(external.schema,report.schema);assert.equal(external.status,'complete');
    externalReports.set(reference.path,{sha256:reference.sha256,report:external});
   }
   assert.equal(externalReports.get(reference.path).sha256,reference.sha256);source=externalReports.get(reference.path).report;
  }
  const original=source.rows.find(r=>r.id===row.reusedFitFrom.id&&r.method===row.reusedFitFrom.method);assert.ok(original);
  assert.notEqual(original,row,'A reused fit cannot reference itself');
  assert.ok(!original.reusedFitFrom,'Reference the original fit, not another reuse');
  for(const key of ['sourceSha256','targetMaskSha256','selectedCrop','report','checkedPair','independentImage'])assert.deepEqual(row[key],original[key]);
  assert.deepEqual(Object.keys(row.assets).sort(),Object.keys(original.assets).sort());
  for(const [name,asset] of Object.entries(row.assets)){
   assert.equal(asset.sha256,original.assets[name].sha256);
   const file=path.resolve(args.run,asset.path);assert.ok(file.startsWith(path.resolve(args.run)+path.sep));
   assert.equal(hash(await fs.readFile(file)),asset.sha256);
  }
  reusedMethodRows.push({id:row.id+'-'+row.method,original:original.id+'-'+original.method,...(reference?{report:reference}:{})});continue;
 }
 const id=row.id+'-'+row.method,dir=path.join(args.output,id,'automatic');await fs.mkdir(dir,{recursive:true});
 const run={preset:'automatic',independentImageError:row.independentImage.mismatchFraction,maskSha256:row.targetMaskSha256,passed:row.checkedPair,report:row.report};
 for(const name of ['cut_geometry.json','mask.png',...(row.assets['observed.bin']?['observed.bin']:[])]){
  const asset=row.assets[name],file=path.resolve(args.run,asset.path);assert.ok(file.startsWith(path.resolve(args.run)+path.sep));
  const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);
  // Immutable artifacts on the same filesystem: no duplicate image collection.
  await fs.link(file,path.join(dir,name));
  if(name==='observed.bin')run.observation={file:name,sha256:asset.sha256,observedPixels:row.observedPixels,totalPixels:row.resolution**2};
 }
 results.push({id,method:row.method,sourceCase:row.id,runs:[run]});
}
assert.ok(results.length,'No exported candidates');
await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify({cropMode:'full-photo-material-pair',targetMode:'mask',replayReportSha256:hash(raw),results,reusedMethodRows},null,2)+'\n');
console.log('Editable audit inputs',results.length);

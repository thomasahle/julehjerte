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
await fs.mkdir(args.output);const results=[],reusedMethodRows=[];
for(const row of report.rows){
 if(!row.independentImage)continue;
 if(args.unique&&row.reusedFitFrom){
  const original=report.rows.find(r=>r.id===row.reusedFitFrom.id&&r.method===row.reusedFitFrom.method);assert.ok(original);
  for(const key of ['assets','targetMaskSha256','selectedCrop','report','checkedPair','independentImage'])assert.deepEqual(row[key],original[key]);
  reusedMethodRows.push({id:row.id+'-'+row.method,original:original.id+'-'+original.method});continue;
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

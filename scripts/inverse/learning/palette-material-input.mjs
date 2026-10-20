/** Expand a verified fixed-crop cohort into both palette comparison arms. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.input&&args.calibration&&args.output&&Object.keys(args).every(k=>['input','calibration','output'].includes(k)));
const input=path.resolve(args.input),output=path.resolve(args.output),hash=b=>createHash('sha256').update(b).digest('hex');
const raw=await fs.readFile(path.join(input,'manifest.json')),base=JSON.parse(raw);
const cropsRaw=await fs.readFile(path.join(input,'crops','report.json')),crops=JSON.parse(cropsRaw);
const calibratedRaw=await fs.readFile(args.calibration),calibrated=JSON.parse(calibratedRaw),methods=['learned','rgb'];
assert.equal(base.status,'complete');assert.equal(base.schema,'woven-heart-material-probe-1');assert.deepEqual(base.methods,['candidate']);
assert.equal(crops.status,'complete');assert.equal(crops.probeManifestSha256,hash(raw));
assert.equal(calibrated.schema,'u2netp-material-calibration-1');assert.equal(calibrated.status,'complete');
assert.deepEqual(calibrated.native.rows.map(r=>r.id),base.rows.map(r=>r.id));
const manifest={...base,methods,rows:[],calibrationReference:{path:args.calibration,sha256:hash(calibratedRaw)},
  scope:'Two fixed palette methods on the complete original-photo cohort; all previous crops and unresolved cases retained. Apply each palette to original RGB after production rectification. No per-photo winner selection.'};
const replay={...crops,rows:[],implementationSha256:hash(await fs.readFile(new URL(import.meta.url)))};
await fs.mkdir(output,{recursive:false});await fs.mkdir(path.join(output,'crops'));
async function link(root,asset,target){
  const file=path.resolve(root,asset.path);assert.ok(file.startsWith(root+path.sep));
  assert.equal(hash(await fs.readFile(file)),asset.sha256);await fs.link(file,target);
}
for(const [index,row] of base.rows.entries()){
  const calibration=calibrated.native.rows[index];
  for(const key of ['file','photoSha256','decodedRGBSha256','dimensions','inputSha256','window'])assert.deepEqual(calibration.source[key],row[key]);
  for(const key of ['body','material']){
    const asset=row.assets.candidate[key];assert.equal(asset.sha256,calibration.fieldReference[key].sha256);
    await link(input,asset,path.join(output,asset.path));
  }
  const originalCrop=crops.rows.find(r=>r.id===row.id&&r.method==='candidate');assert.ok(originalCrop);
  await link(path.join(input,'crops'),originalCrop.assets['detection.json'],path.join(output,'crops',originalCrop.assets['detection.json'].path));
  manifest.rows.push({...row,assets:Object.fromEntries(methods.map(method=>[method,row.assets.candidate])),
    materialCalibration:Object.fromEntries(methods.map(method=>[method,calibration.methods[method]]))});
  for(const method of methods)replay.rows.push({...originalCrop,method});
}
const manifestRaw=JSON.stringify(manifest,null,2)+'\n';replay.probeManifestSha256=hash(manifestRaw);replay.scope=manifest.scope;
await fs.writeFile(path.join(output,'manifest.json'),manifestRaw);
await fs.writeFile(path.join(output,'crops','report.json'),JSON.stringify(replay,null,2)+'\n');
console.log(JSON.stringify({photos:manifest.rows.length,methods,fixedCrops:crops.rows.filter(r=>r.selectedCrop).length}));

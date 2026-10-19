/** Connect a native identity probe to the existing fitter, with fixed crops.
 * Reuses every photo and crop from the declared cohort, including failures.
 * All prediction/detection files are verified and hardlinked, never rewritten.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.probe&&args.crops&&args.output&&Object.keys(args).every(k=>['probe','crops','crop-method','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const cropMethod=args['crop-method']??'fallback';
const probeRoot=path.resolve(args.probe),cropRoot=path.resolve(args.crops),output=path.resolve(args.output);
const probeBytes=await fs.readFile(path.join(probeRoot,'report.json')),probe=JSON.parse(probeBytes);
const cropBytes=await fs.readFile(path.join(cropRoot,'report.json')),crops=JSON.parse(cropBytes);
assert.equal(probe.schema,'u2netp-material-probe-1');assert.equal(probe.status,'complete');
assert.equal(crops.schema,'material-pair-pipeline-1');assert.equal(crops.status,'complete');
assert.equal(probe.resolution,320);
const selected=crops.rows.filter(row=>row.method===cropMethod);
assert.deepEqual(selected.map(row=>row.id),probe.rows.map(row=>row.id),'The complete ordered cohort must match');
assert.equal(new Set(selected.map(row=>row.id)).size,selected.length);
const manifest={schema:'woven-heart-material-probe-1',status:'complete',resolution:probe.resolution,methods:['candidate'],rows:[],
  sourceProbe:{path:path.join(args.probe,'report.json'),sha256:hash(probeBytes)},
  fixedCropReference:{path:path.join(args.crops,'report.json'),sha256:hash(cropBytes),method:cropMethod},
  scope:'Native identity predictions; all existing crop coordinates fixed, including unresolved cases. No crop retuning or per-photo head selection.'};
const replay={schema:'material-fixed-crop-input-1',status:'complete',rows:[],reference:manifest.fixedCropReference,
  implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),scope:manifest.scope};
async function checked(root,asset){
  const file=path.resolve(root,asset.path);assert.ok(file.startsWith(root+path.sep));
  const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256,file);
  return {file,bytes};
}
await fs.mkdir(output,{recursive:false});await fs.mkdir(path.join(output,'crops'));
for(const [index,row] of probe.rows.entries()){
  const crop=selected[index];assert.equal(crop.sourceSha256,row.photoSha256);
  const detection=await checked(cropRoot,crop.assets['detection.json']);
  assert.deepEqual(JSON.parse(detection.bytes).candidates[0]??null,crop.selectedCrop??null,'Keep the original chosen crop');
  const assets={};
  for(const name of ['body','material']){
    const asset=row.assets[name],source=await checked(probeRoot,asset);
    assert.equal(source.bytes.length,probe.resolution**2*4);
    const filename=row.id+'-'+name+'.f32';await fs.link(source.file,path.join(output,filename));
    assets[name]={path:filename,sha256:asset.sha256};
  }
  manifest.rows.push({id:row.id,file:row.file,photoSha256:row.photoSha256,decodedRGBSha256:row.decodedRGBSha256,
    dimensions:row.dimensions,window:row.window,inputSha256:row.inputSha256,assets:{candidate:assets}});
  const filename=row.id+'-detection.json';await fs.link(detection.file,path.join(output,'crops',filename));
  replay.rows.push({id:row.id,method:'candidate',sourceSha256:row.photoSha256,selectedCrop:crop.selectedCrop??null,
    cropSeconds:crop.cropSeconds,assets:{'detection.json':{path:filename,sha256:crop.assets['detection.json'].sha256}}});
}
const manifestBytes=JSON.stringify(manifest,null,2)+'\n';
replay.probeManifestSha256=hash(manifestBytes);
await fs.writeFile(path.join(output,'manifest.json'),manifestBytes);
await fs.writeFile(path.join(output,'crops','report.json'),JSON.stringify(replay,null,2)+'\n');
console.log(JSON.stringify({photos:selected.length,fixedCrops:selected.filter(row=>row.selectedCrop).length,output:args.output}));

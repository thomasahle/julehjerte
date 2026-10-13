/** Reproduce stale crop-edge evidence against a pinned source snapshot.
 * Optional full-photo reports compare source/crop/target identity separately
 * from template acceptance. They are never used to choose crop coordinates.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {lowerEdgeLines} from '../../static/inverse/locator/locator.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.output,'Use --output=<new directory>');
assert.equal(Boolean(args['baseline-photos']),Boolean(args['current-photos']),'Supply both photo reports or neither');
const output=args.output,hash=b=>createHash('sha256').update(b).digest('hex');
const sourceRef=execFileSync('git',['rev-parse','--verify','--end-of-options',(args['source-ref']||'68e4f99')+'^{commit}'],{encoding:'utf8'}).trim();
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
await fs.writeFile(output+'/package.json','{"type":"module"}\n');
const baselineSourceHashes={},currentSourceHashes={};
for(const file of execFileSync('git',['ls-tree','-r','--name-only',sourceRef,'--','static/inverse/locator'],{encoding:'utf8'}).trim().split('\n')){
  const bytes=execFileSync('git',['show',sourceRef+':'+file],{maxBuffer:16*1024*1024});
  const destination=output+'/'+file;await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);
  baselineSourceHashes[file]=hash(bytes);currentSourceHashes[file]=hash(await fs.readFile(file));
}
const baseline=await import(pathToFileURL(path.resolve(output+'/static/inverse/locator/locator.js')).href);
const rows=[],report={sourceRef,baselineSourceHashes,currentSourceHashes,toolSha256:hash(await fs.readFile(new URL(import.meta.url))),
  method:'Fixed analytic mask and RGB wedges, independently replayed in pinned and current locators. Line coordinates are compared before any support claims. A displaced colour edge alone is not evidence of a physical paper edge.',rows};
for(const kind of ['aligned','outward','inward','interrupted']){
  const w=240,h=240,n=w*h,fields={w,h,mask:new Uint8Array(n),r:new Float32Array(n),g:new Float32Array(n),b:new Float32Array(n)};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,left=.65*y-23,right=263-.65*y;
    fields.mask[i]=Number(x>left&&x<right);
    const shift=kind==='outward'?6:kind==='inward'?-6:kind==='interrupted'&&y>130&&y<145?6:0;
    for(const c of ['r','g','b'])fields[c][i]=x>left-shift&&x<right+shift?.8:.2;
  }
  const inputs=Object.fromEntries(['mask','r','g','b'].map(k=>[k,hash(Buffer.from(fields[k].buffer))]));
  const before=baseline.lowerEdgeLines(fields,[20,20,220,220]),after=lowerEdgeLines(fields,[20,20,220,220]);
  assert.ok(before&&after);
  assert.deepEqual(before.tip,after.tip);
  for(const key of ['left','right'])for(const coordinate of ['a','b'])assert.equal(before[key][coordinate],after[key][coordinate]);
  for(const k of ['mask','r','g','b'])assert.equal(hash(Buffer.from(fields[k].buffer)),inputs[k]);
  rows.push({kind,inputs,geometryUnchanged:true,before,after});
}
if(args['baseline-photos']){
  const beforeBytes=await fs.readFile(args['baseline-photos']),afterBytes=await fs.readFile(args['current-photos']);
  const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes),file='static/inverse/locator/locator.js';
  assert.equal(before.sourceHashes[file],baselineSourceHashes[file]);assert.equal(after.sourceHashes[file],currentSourceHashes[file]);
  const previous=new Map(before.results.map(r=>[r.id,r]));
  assert.equal(previous.size,after.results.length);
  report.photos={before:{path:args['baseline-photos'],sha256:hash(beforeBytes)},after:{path:args['current-photos'],sha256:hash(afterBytes)},rows:after.results.map(r=>{
    const old=previous.get(r.id);assert.ok(old,r.id);assert.deepEqual(old.input,r.input);
    const a=old.runs?.[0],b=r.runs?.[0];
    return{id:r.id,before:old.status,after:r.status,quadUnchanged:JSON.stringify(old.effectiveQuad)===JSON.stringify(r.effectiveQuad),maskUnchanged:a?.maskSha256===b?.maskSha256,
      errorBefore:a?.independentImageError??null,errorAfter:b?.independentImageError??null,
      beforeAssessment:old.detection?.assessment,afterAssessment:r.detection?.assessment,
      beforeLines:old.detection?.candidate?.locator.evidence.lowerLines,afterLines:r.detection?.candidate?.locator.evidence.lowerLines};
  })};
}
await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,fixtures:rows.length,photos:report.photos?.rows.length??0}));

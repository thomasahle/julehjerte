/** Verify preserved originals without requiring private payloads in CI.
 * Use --local to require the complete local store, for backup/restore checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2);
assert.ok(args.every(a=>a==='--local'),'Only --local is supported.');
const local=args.includes('--local');
const manifest=JSON.parse(await fs.readFile(new URL('../../docs/inverse/datasets/heart-archive-storage.json',import.meta.url)));
const seen=new Set();let verified=0,bytes=0,missingPrivate=0,publicObjects=0;
for(const object of manifest.objects){
  assert.match(object.sha256,/^[a-f0-9]{64}$/);assert.ok(!seen.has(object.sha256),'Duplicate stored payload');seen.add(object.sha256);
  const publicCopy=!!object.publicUrl,prefix=publicCopy?'static/archive/templates/':'archive-store/heart-preservation/objects/';
  assert.ok(object.path.startsWith(prefix));assert.match(object.path.slice(prefix.length),new RegExp(`^${object.sha256}\\.[a-z0-9]+$`));
  if(publicCopy){
    publicObjects++;assert.equal(object.publicUrl,`/archive/templates/${object.path.slice(prefix.length)}`);
    assert.ok(object.rights?.license&&object.rights?.licenseUrl&&object.rights?.author&&object.rights?.evidenceUrls?.length,'Public originals retain redistribution terms and credit.');
  }
  let data;
  try{data=await fs.readFile(new URL(`../../${object.path}`,import.meta.url));}
  catch(error){if(error.code==='ENOENT'&&!publicCopy&&!local){missingPrivate++;continue;}throw error;}
  assert.equal(data.length,object.bytes,object.path);
  assert.equal(createHash('sha256').update(data).digest('hex'),object.sha256,object.path);
  verified++;bytes+=data.length;
}
assert.equal(seen.size,manifest.counts.objects);
assert.equal(manifest.objects.reduce((n,o)=>n+o.bytes,0),manifest.counts.originalBytes);
assert.equal(publicObjects,manifest.counts.publicObjects);
console.log(JSON.stringify({verifiedObjects:verified,verifiedBytes:bytes,publicObjects,privateObjectsUnavailable:missingPrivate,completeLocalStore:missingPrivate===0}));

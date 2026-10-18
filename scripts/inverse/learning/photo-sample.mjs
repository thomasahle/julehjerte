/** Freeze a family-balanced photograph sample before inspecting crop results. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.dataset||!args.output||Object.keys(args).some(k=>!['dataset','output','per-family','seed','exclude-probe'].includes(k)))throw new Error('Use --dataset=directory --output=new-directory [--per-family=8] [--seed=text] [--exclude-probe=directory].');
const dataset=path.resolve(args.dataset),output=path.resolve(args.output),count=Number(args['per-family']||8),seed=args.seed||'crop-coverage-v1';
if(!Number.isInteger(count)||count<1||count>100)throw new Error('Use 1..100 designs per family.');
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(path.join(dataset,'manifest.json')),source=JSON.parse(bytes);
if(source.status!=='complete')throw new Error('Require a complete source dataset.');
const excluded=new Set(),exclusion=args['exclude-probe']?await fs.readFile(path.join(args['exclude-probe'],'manifest.json')):null;
if(exclusion)for(const row of JSON.parse(exclusion).designs)excluded.add(row.id);
const rank=(a,b)=>hash(seed+'/'+a.id).localeCompare(hash(seed+'/'+b.id));
const families=[...new Set(source.baseDesigns.map(d=>d.familyId))].sort(),selected=[];
for(const family of families){
  const designs=source.baseDesigns.filter(d=>d.familyId===family&&!excluded.has(d.id)).sort(rank);
  if(designs.length<count)throw new Error(`Not enough designs in ${family}.`);
  for(const design of designs.slice(0,count)){
    const views=source.views.filter(v=>v.designId===design.id).sort(rank);
    if(!views.length)throw new Error(`Missing views for ${design.id}.`);
    selected.push({design,view:views[0]});
  }
}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const result={schema:'heart-photographic-sample-1',status:'building',sourceDataset:dataset,sourceManifestSha256:hash(bytes),selection:{seed,perFamily:count,families,excludedDesigns:[...excluded].sort(),exclusionManifestSha256:exclusion?hash(exclusion):null,method:'Sort designs within each family by SHA-256(seed/id); take the first N. Select one view per design with the same rank. No detector outcomes or image labels enter selection.'},scope:'Additional synthetic photograph coverage, not an independent real-photo evaluation. Existing neural experiments may have inspected these images.',designs:[],rows:[]};
async function checked(asset){
  const file=path.resolve(dataset,asset.path);if(!file.startsWith(dataset+path.sep))throw new Error('Asset escapes dataset.');
  const bytes=await fs.readFile(file);if(hash(bytes)!==asset.sha256)throw new Error('Source asset changed.');return bytes;
}
for(const {design,view}of selected){
  if(!/^[a-zA-Z0-9_-]+$/.test(view.id))throw new Error('Invalid view ID.');
  result.designs.push({id:design.id,sourceId:design.sourceId,sourceSplit:design.split,familyId:design.familyId,geometrySha256:design.geometrySha256,sourceCuts:design.assets['cuts.json'],sourceCanonical:design.assets['canonical.png']});
  const row={id:view.id,designId:design.id,sourceViewId:view.id,variant:'baseline',familyId:design.familyId,assets:{}};
  await fs.mkdir(path.join(output,'views',view.id),{recursive:true});
  for(const name of ['photo.jpg','labels.json']){
    const data=await checked(view.assets[name]),relative=`views/${view.id}/${name}`;
    await fs.writeFile(path.join(output,relative),data);row.assets[name]={path:relative,sha256:hash(data)};
  }
  result.rows.push(row);
}
result.status='complete';await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({directory:output,views:result.rows.length,selection:result.selection}));

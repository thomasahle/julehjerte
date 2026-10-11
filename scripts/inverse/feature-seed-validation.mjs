/** Investigate paper uncertainty and feature connectivity on saved candidates, without fitting
 * again or changing width, cutting error, feature-area or geometry tolerances.
 * This evidence does not change the production acceptance policy.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {components} from '../../static/inverse/core/input.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {createHash} from 'node:crypto';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {materialAudit} from '../../static/inverse/core/material.js';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.run)throw new Error('Use --run=<feature-seed-study directory>');
const cases=JSON.parse(await fs.readFile(path.join(args.run,'results.json'))),results=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const {fixture}=JSON.parse(await fs.readFile(path.join(args.run,'inputs.json'))),catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
const source=prepare({...photo,quad:fixture.quad},AUTOMATIC_PRESET).target.sourceImage;
assert.equal(hash(source.mask),fixture.maskSha256);
const features=imageFeatures(source);
for(const entry of cases){
  const folder=path.join(args.run,`${entry.mode}-${entry.boost}`),bytes=await fs.readFile(path.join(folder,'cut_geometry.json'));
  const solution=loadSolutionJSON(JSON.parse(bytes)),report=JSON.parse(await fs.readFile(path.join(folder,'report.json')));
  const row={mode:entry.mode,boost:entry.boost,geometrySha256:hash(bytes),originalSettings:report.settings,probes:[]};results.push(row);
  const woven=await renderExportedWeave(bytes.toString(),source.resolution);
  row.featureConnectivity=features.map(feature=>{
    const selected=new Set(feature.pixels),overlappingComponents=components(woven.mask,source.resolution,feature.value).map(part=>({pixels:part.pixels.length,touchesBorder:part.border,retainedPixels:part.pixels.reduce((sum,i)=>sum+Number(selected.has(i)),0)})).filter(p=>p.retainedPixels);
    return{value:feature.value,sourcePixels:feature.pixels.length,centerMm:feature.centerMm,overlappingComponents};
  });
  for(const resolution of [...new Set([report.settings.materialResolution,540,700])].sort((a,b)=>a-b)){
    const audit=materialAudit(solution,settings({...report.settings,materialResolution:resolution}));
    row.probes.push({resolution,...audit.summary});
    console.log(entry.mode,entry.boost,resolution,audit.status);
  }
}
await fs.writeFile(path.join(args.run,'validation.json'),JSON.stringify({sourceRun:args.run,sourceHashes:{'scripts/inverse/feature-seed-validation.mjs':hash(await fs.readFile('scripts/inverse/feature-seed-validation.mjs')),'static/inverse/core/material.js':hash(await fs.readFile('static/inverse/core/material.js'))},results},null,2));

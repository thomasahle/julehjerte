import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readHardPhoto,hardPhotoCatalogCases} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {initializeCoarseTopology} from '../../static/inverse/core/direct/topology.js';

const folder='scripts/inverse/fixtures/user-photos-2026-10-17/';
const catalog=JSON.parse(await fs.readFile(folder+'curved-triangles.json'));
const quad=JSON.parse(await fs.readFile(folder+'curved-triangles-corners.json'))[0].quad;
const photo=await readHardPhoto(hardPhotoCatalogCases(catalog)[0]);
const raw={...AUTOMATIC_PRESET,timeLimit:30,trials:0},cfg=settings(raw);
const input=()=>hardPhotoTarget(prepare({...photo,quad},raw),'mask',raw);

test('coarse recovery preserves observed pixels and cannot use arbitrary missing colours as evidence',async()=>{
 const target=input(),source=target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
 const changed={...target,sourceImage:{...source,
  mask:Uint8Array.from(mask,(v,i)=>source.validMask[i]?v:1-v),
  probability:Float32Array.from(probability,(v,i)=>source.validMask[i]?v:1-v)}};
 const options={repairRejected:true,maximumError:0,seconds:5};
 const a=await initializeCoarseTopology(target,cfg,options),b=await initializeCoarseTopology(changed,cfg,options);
 assert.ok(a.report.attempts.length>0);assert.deepEqual(a.report.attempts,b.report.attempts);
 assert.ok(a.report.attempts.every(a=>!a.routing));assert.equal(a.graph,undefined);assert.equal(b.graph,undefined);
 assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
 const editable={...target,sourceImage:{...source,weights:source.weights.slice()}};
 editable.sourceImage.weights[source.validMask.findIndex(v=>v===1)]=0;
 const rejected=await initializeCoarseTopology(editable,cfg,options);
 assert.equal(rejected.graph,undefined);assert.deepEqual(rejected.report.attempts,[]);
});

test('fresh automatic fitting repairs a rejected circular routing before common Bezier refinement',async t=>{
 const target=input(),source=target.sourceImage,mask=source.mask.slice(),valid=source.validMask.slice(),weights=source.weights.slice();
 assert.equal(createHash('sha256').update(mask).digest('hex'),'77de47c5de58acf92d0733486f4458530905d7c847f34d6af49557cca0ca7e42');
 assert.equal(valid.reduce((s,v)=>s+v,0),159945);
 // Only the screenshot and its preselected UI-square coordinates enter design.
 // No saved routing, hand-picked slit count or idealized circles are loaded.
 const answer=await design(target,cfg),report=answer.report;
 try{
  assert.equal(report.templateChecksPassed,true);
  const recovery=report.solver.coarseTopologyInitialization;
  assert.equal(recovery?.accepted,true);
  const repair=recovery.attempts.find(a=>a.routing?.continuousRepair?.accepted)?.routing;
  assert.ok(repair);assert.equal(repair.continuousRepair.projection.accepted,true);
  assert.equal(repair.solver.termination,'rejected_candidate_observer','The invalid MILP proposal must stay rejected.');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  assert.ok(referenceError(source,rendered.mask).mismatchFraction<.015,'The unchanged pipeline was at 2.83%.');
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.validMask,valid);assert.deepEqual(source.weights,weights);
 }catch(error){t.diagnostic(JSON.stringify({report,cutGeometry:answer.files['cut_geometry.json']}));throw error;}
});

test('a fully observed mask compares a stalled corner routing without opening its enclosed regions',async()=>{
 const extracted=input().sourceImage,mask=extracted.mask.slice();
 // This is the browser's whole-picture variant: its PNG supplies colours for
 // all pixels, including the tiny tip excluded by the screenshot diagnostic.
 const target=prepare({type:'mask',mask,resolution:extracted.resolution},raw).target;
 const answer=await design(target,cfg),comparison=answer.report.solver.cornerTopologyComparison;
 assert.equal(answer.report.templateChecksPassed,true);
 assert.equal(comparison?.selected,true);assert.equal(comparison.featuresPreserved,true);
 assert.ok(comparison.imageError<comparison.beforeImageError);
 const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],extracted.resolution);
 assert.ok(referenceError(target.sourceImage,rendered.mask).mismatchFraction<.015);
 assert.deepEqual(target.sourceImage.mask,mask);
});

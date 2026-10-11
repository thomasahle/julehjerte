import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogue,readPhoto} from './web-photo-data.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {initializeCoarseTopology} from '../../static/inverse/core/direct/topology.js';
import {renderExportedWeave} from './export-renderer.mjs';

const data=await catalogue(),entry=data.cases.find(c=>c.id==='danish-tree-green');
const photograph=await readPhoto(data.photos.find(p=>p.id===entry.photo));
// Freeze the automatic locator's coordinates before fitting. The original
// photograph supplies every target pixel; no template geometry is loaded.
const quad=[[613.4629495846865,709.8754165460504],[991.3479406135674,1101.880332092388],[589.7733778087984,1526.3403443658829],[201.96444906745154,1085.6004246480518]];
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,progressGeometry:true});

test('coarse routing proposals cannot replace the original photo or evade its error cap',async()=>{
  const input=prepare({...photograph,quad},cfg).target,mask=input.sourceImage.mask.slice(),probability=input.sourceImage.probability.slice(),seed=input.boundarySeed;
  const curves=JSON.stringify(seed?.curves.map(c=>c.p));
  const result=await initializeCoarseTopology(input,cfg,{maximumError:0});
  assert.equal(result.graph,undefined);assert.equal(result.report.accepted,false);
  assert.ok(result.report.attempts.length>0);
  assert.ok(result.report.attempts.every(a=>!a.routing));
  assert.deepEqual(input.sourceImage.mask,mask);assert.deepEqual(input.sourceImage.probability,probability);
  assert.equal(input.boundarySeed,seed);assert.equal(JSON.stringify(seed?.curves.map(c=>c.p)),curves);
});

test('coarse routing and common refinement retain photographed tree branches in exported templates',async()=>{
  const prepared=prepare({...photograph,quad},cfg),source=prepared.target.sourceImage,before=source.mask.slice();
  const answer=await design(prepared.target,cfg),report=answer.report;
  assert.equal(report.solver.coarseTopologyInitialization?.accepted,true);
  assert.equal(report.solver.selectedInitialization,'coarse-boundary-topology');
  assert.equal(report.templateChecksPassed,true);assert.equal(report.manufacturing.status,'pass');
  assert.deepEqual(report.slits,{left:3,right:3});
  assert.equal(report.solver.shortReturnRepair.applied,true);
  // The redundant return used to hide an available improvement until after
  // matching, incorrectly granting a 1% allowance from the worse baseline.
  const matching=report.solver.matchingPreference;
  assert.ok(matching.baselineImageError<.015);
  assert.equal(matching.identical,false);
  assert.equal(matching.status,'image_bound_exceeds_allowance');
  assert.ok(matching.minimumIdenticalImageError>matching.maximumMatchingImageError);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution),n=source.resolution;
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/replay.mask.length;
  assert.ok(error<.015,`Exported mask disagreement: ${error}`);
  // Whole-image averages can hide lost branches behind a good frame. The
  // central 60% square had 4.12% disagreement with the previous rounded fit.
  let centralError=0,centralPixels=0;
  for(let y=Math.floor(.2*n);y<.8*n;y++)for(let x=Math.floor(.2*n);x<.8*n;x++){
    centralPixels++;centralError+=replay.mask[y*n+x]!==source.mask[y*n+x];
  }
  assert.ok(centralError/centralPixels<.02,`Branch-region disagreement: ${centralError/centralPixels}`);
  assert.deepEqual(source.mask,before);
});

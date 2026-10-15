/** Shared photographed leaf input. No fitted geometry initializes fresh solves. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/leaf-clearance-initializer.json',import.meta.url)));
const cfg=settings({...fixture.configuration,timeLimit:10,trials:0}),{resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
let offset=0;
for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
assert.equal(offset,mask.length);
assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.source.sha256);
const input=()=>prepare({type:'mask',mask:mask.slice(),resolution},cfg).target;
function initializer(source){
  const proposal=loadSolutionJSON(fixture.geometry),graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width);
  const objective=resizeObjective(source.sourceImage.probability,resolution,256);
  return{graph,clear:{phase:proposal.graph.target.phase?-1:1,model:{counts:proposal.paths.map(f=>f.length)}},objectiveProb:objective.probability,objectiveWeights:objective.weights};
}

export {cfg,resolution,mask,input,initializer};

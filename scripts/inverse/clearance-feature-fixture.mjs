/** A photographed mask and its tiny resampling perturbation. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/clearance-feature-initializer.json',import.meta.url)));
export const cfg=settings({...fixture.configuration,timeLimit:10,trials:0});
export const resolution=fixture.source.resolution,mask=new Uint8Array(resolution**2);
let offset=0;
for(let i=0;i<fixture.source.maskRuns.length;i+=2){
  const [value,length]=fixture.source.maskRuns.slice(i,i+2);mask.fill(value,offset,offset+length);offset+=length;
}
assert.equal(offset,mask.length);
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(mask),fixture.source.sha256);
export const originalMask=mask.slice();
for(const pixel of fixture.source.originalMaskToggles)originalMask[pixel]^=1;
assert.equal(hash(originalMask),fixture.source.originalMaskSha256);
export const input=(pixels=mask)=>prepare({type:'mask',mask:pixels.slice(),resolution},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
export function initializer(source){
  const graph=new CurveGraph(fixture.initializer.paths,cfg.width),objective=resizeObjective(source.sourceImage.probability,resolution,256);
  return{graph,clear:{phase:fixture.initializer.phase,model:{counts:fixture.initializer.counts.slice()}},objectiveProb:objective.probability,objectiveWeights:objective.weights};
}

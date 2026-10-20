import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeConfidenceTarget} from './native-confidence-target.mjs';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {boundaryObjective} from '../../../static/inverse/core/direct/image-objective.js';

test('soft fitting retains the exact observed-mask validation objective',()=>{
 const source={resolution:2,mask:Uint8Array.of(0,1,1,0),probability:Float32Array.of(0,1,1,0),
  validMask:Uint8Array.of(1,1,1,0),weights:Float64Array.of(1,1,1,0)};
 const original={sourceImage:source},saved=structuredClone(original);
 const {target,diagnostics}=nativeConfidenceTarget(original,Float32Array.of(-1,1,.1,0),4);
 assert.deepEqual(original,saved);
 assert.strictEqual(target.sourceImage.mask,source.mask);
 assert.strictEqual(target.sourceImage.weights,source.weights);
 assert.strictEqual(target.sourceImage.validMask,source.validMask);
 for(const woven of [Uint8Array.of(0,1,0,1),Uint8Array.of(1,0,1,0)])
  assert.deepEqual(referenceError(target.sourceImage,woven),referenceError(source,woven));
 assert.equal(target.sourceImage.probability[3],.5);
 assert.equal(diagnostics.thresholdRoundoffPixels,0);
 // Equal binary mistakes have unequal fitting force when one score is weak.
 const p=boundaryObjective(target.sourceImage.probability).target;
 assert.ok(Math.abs(1-2*p[2])<Math.abs(1-2*p[1]));
});

test('native objective discloses near-zero rounding and rejects a phase reversal',()=>{
 const sourceImage={resolution:1,mask:Uint8Array.of(0)};
 const result=nativeConfidenceTarget({sourceImage},Float32Array.of(-1e-10),4);
 assert.equal(result.diagnostics.thresholdRoundoffPixels,1);
 assert.equal(result.target.sourceImage.mask[0],0);
 assert.throws(()=>nativeConfidenceTarget({sourceImage},Float32Array.of(1),4),/phase/);
 assert.throws(()=>nativeConfidenceTarget({sourceImage},Float32Array.of(NaN),4),/finite/);
 assert.throws(()=>nativeConfidenceTarget({sourceImage},Float32Array.of(0),0),/temperature/);
 assert.throws(()=>nativeConfidenceTarget({sourceImage},new Float32Array(2),4),/grid/);
});

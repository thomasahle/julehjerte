import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotifDetector} from '../../static/inverse/locator/locator.js';
import {makeFields} from '../../static/inverse/locator/fields.js';
import {heartPhoto} from './crop-fixture.mjs';

test('explicit fields share production working coordinates and default geometry',()=>{
 const p=heartPhoto(),image={width:p.imageWidth,height:p.imageHeight,data:p.rgba};let calls=0;
 const normal=createMotifDetector(image,{maxSize:400})();
 const detector=createMotifDetector(image,{maxSize:400,fieldProvider:work=>{calls++;assert.equal(work.data.length,work.width*work.height*4);assert.deepEqual(work.offset,[0,0]);return makeFields(work);}});
 assert.deepEqual(detector().quad,normal.quad);detector(15);assert.equal(calls,1);
});
test('null foreground and malformed field providers fail explicitly',()=>{
 const p=heartPhoto(),image={width:p.imageWidth,height:p.imageHeight,data:p.rgba};
 assert.equal(createMotifDetector(image,{fieldProvider:()=>null})().status,'not_found');
 assert.throws(()=>createMotifDetector(image,{fieldProvider:true}),/function/);
 assert.throws(()=>createMotifDetector(image,{fieldProvider:()=>({w:1,h:1})}),/aligned/);
 assert.throws(()=>createMotifDetector(image,{edgeSamplingFields:()=>null})(),/working-image/);
});

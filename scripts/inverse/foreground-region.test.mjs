import test from 'node:test';
import assert from 'node:assert/strict';
import {foregroundRegion} from './learning/foreground-region.mjs';

function fixture(n=32){return{probability:new Float32Array(n*n),resolution:n,window:[0,0,n*10,n*10],imageWidth:n*10,imageHeight:n*10};}
function rectangle(input,x0,y0,x1,y1,value=1){for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)input.probability[y*input.resolution+x]=value;return input;}

test('foreground proposal maps pixel edges and adds context without inventing corners',()=>{
 const input=rectangle(fixture(),10,10,22,22);input.probability[0]=1;
 const result=foregroundRegion(input);
 assert.equal(result.status,'proposal');assert.deepEqual(result.roi,[94,94,226,226]);
 assert.deepEqual(result.bounds,[100,100,220,220]);assert.equal(result.componentPixels,144);assert.equal(result.quad,undefined);
});
test('letterbox padding cannot become a photographed heart',()=>{
 const input=fixture();input.window=[-160,0,480,640];input.imageWidth=320;input.imageHeight=640;
 rectangle(input,0,6,8,26);assert.equal(foregroundRegion(input).roi,null);
 rectangle(input,10,10,22,22);assert.deepEqual(foregroundRegion(input).roi,[28,188,292,452]);
});
test('two comparable hearts require a selection; scattered noise is ignored',()=>{
 const input=rectangle(rectangle(fixture(64),3,3,15,15),40,40,52,52);
 const result=foregroundRegion(input);assert.equal(result.status,'needs-selection');assert.equal(result.roi,null);
 assert.equal(foregroundRegion(fixture()).roi,null);
});
test('rough regions stay inside the photograph without clamping any cutting corners',()=>{
 const input=rectangle(fixture(),0,8,12,24),result=foregroundRegion(input);
 assert.deepEqual(result.roi,[0,72,128,248]);assert.equal(result.quad,undefined);
});
test('invalid probabilities and coordinate frames are rejected',()=>{
 for(const change of [{window:[0,0,0,20]},{imageWidth:2},{resolution:2},{probability:[NaN]},{window:[0,0,Infinity,320]}])
  assert.throws(()=>foregroundRegion({...fixture(),...change}),TypeError);
 const input=fixture();input.probability[0]=NaN;assert.throws(()=>foregroundRegion(input),TypeError);
});

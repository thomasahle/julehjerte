import test from 'node:test';
import assert from 'node:assert/strict';
import {featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {auditImageFeatures,imageFeatures} from '../../static/inverse/core/image-features.js';

test('whole-component measurements distinguish an opening from enlargement and a channel',()=>{
  for(const invert of [0,1])for(const n of [100,200]){
    const mask=new Uint8Array(n*n).fill(invert),q=n/100;
    const rectangle=(image,x0,y0,x1,y1)=>{for(let y=y0*q;y<y1*q;y++)for(let x=x0*q;x<x1*q;x++)image[y*n+x]=1-invert;};
    rectangle(mask,40,40,50,50);
    const source={mask,resolution:n},features=imageFeatures(source),saved=mask.slice();
    assert.equal(features.length,1);
    const exact=featureComponentMetrics(source,mask)[0];
    assert.equal(exact.retention,1);assert.equal(exact.componentIoU,1);
    assert.equal(exact.sourceAreaMm2,100);assert.equal(exact.predictedComponentAreaMm2,100);
    assert.equal(exact.touchesBorder,false);
    const enlarged=mask.slice();rectangle(enlarged,35,35,55,55);
    const large=featureComponentMetrics(source,enlarged,100,features)[0];
    assert.equal(large.retention,1);assert.equal(large.componentIoU,.25);
    assert.equal(large.predictedComponentAreaMm2,400);assert.equal(large.touchesBorder,false);
    const connected=mask.slice();rectangle(connected,44,0,46,40);
    const channel=featureComponentMetrics(source,connected)[0];
    assert.equal(channel.retention,1);assert.equal(channel.touchesBorder,true);
    assert.equal(channel.predictedComponentAreaMm2,180);assert.equal(channel.componentIoU,100/180);
    for(const woven of [enlarged,connected])assert.equal(auditImageFeatures(source,woven).passed,true,
      'Pixel retention alone does not establish that the opening stayed separate or kept its shape');
    const absent=featureComponentMetrics(source,new Uint8Array(n*n).fill(invert))[0];
    assert.equal(absent.retention,0);assert.equal(absent.componentIoU,0);
    assert.equal(absent.touchesBorder,null);assert.equal(absent.predictedComponentAreaMm2,0);
    assert.deepEqual(featureComponentMetrics(source,mask,100,[]),[]);
    assert.deepEqual(mask,saved);
  }
});

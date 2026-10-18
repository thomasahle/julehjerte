import test from 'node:test';
import assert from 'node:assert/strict';
import {lowerEdgeLines} from '../../static/inverse/locator/locator.js';

// The segmentation sees one wedge; colour refinement can see a stronger,
// displaced boundary. No photographed corners or fitted templates are supplied.
function wedge(displacement=0){
  const w=240,h=240,n=w*h;
  const fields={w,h,mask:new Uint8Array(n),r:new Float32Array(n),g:new Float32Array(n),b:new Float32Array(n)};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,left=.65*y-23,right=263-.65*y;
    fields.mask[i]=Number(x>left&&x<right);
    const shift=typeof displacement==='function'?displacement(y):displacement;
    for(const c of ['r','g','b'])fields[c][i]=x>left-shift&&x<right+shift?.8:.2;
  }
  return fields;
}

function independentlyCheck(lines){
  assert.ok(lines);
  for(const [side,key] of ['left','right'].entries()){
    for(const [line,points] of [[lines[key],lines.points[side]],[lines[key].initial,lines.segmentationPoints[side]],[lines[key].segmentation,lines.segmentationPoints[side]]]){
      const residuals=points.map(([x,y])=>Math.abs(x-line.a*y-line.b)/Math.sqrt(1+line.a**2));
      const indices=residuals.flatMap((r,i)=>r<line.tolerancePx?[i]:[]);
      assert.equal(line.inliers,indices.length);
      assert.equal(line.total,points.length);
      assert.equal(line.support,indices.length/points.length);
      assert.equal(line.span,indices.length>1?Math.max(...indices.map(i=>points[i][1]))-Math.min(...indices.map(i=>points[i][1])):0);
      if(indices.length)assert.ok(Math.abs(line.rms-Math.sqrt(indices.reduce((sum,i)=>sum+residuals[i]**2,0)/indices.length))<1e-12);
      else assert.equal(line.rms,null,'No support is unknown RMS, not a misleading zero.');
    }
  }
}

test('refined lower-edge evidence distinguishes colour support from segmentation disagreement',()=>{
  for(const shift of [-6,6]){
    const fields=wedge(shift),before=structuredClone(fields),lines=lowerEdgeLines(fields,[20,20,220,220]);
    independentlyCheck(lines);
    for(const key of ['left','right']){
      assert.equal(lines[key].initial.support,1);
      assert.equal(lines[key].segmentation.support,0,'The stronger colour edge is outside every segmentation tolerance.');
      assert.equal(lines[key].support,1,'All independently localized colour steps support the refined line.');
      assert.ok(Math.abs(lines[key].b-lines[key].initial.b)>5);
    }
    assert.deepEqual(fields,before);
    assert.deepEqual(JSON.parse(JSON.stringify(lines)),lines,'Empty support has finite JSON evidence.');
  }
});

test('aligned colour and mask edges retain complete measured support',()=>{
  const lines=lowerEdgeLines(wedge(),[20,20,220,220]);
  independentlyCheck(lines);
  for(const key of ['left','right']){
    assert.equal(lines[key].support,1);
    assert.ok(lines[key].rms<.5);
    assert.ok(lines[key].span>60);
  }
  assert.ok(Math.hypot(lines.tip[0]-120,lines.tip[1]-220)<1);
});

test('conflicting colour samples lower support even when the mask seed was unanimous',()=>{
  const lines=lowerEdgeLines(wedge(y=>y>130&&y<145?6:0),[20,20,220,220]);
  independentlyCheck(lines);
  for(const key of ['left','right']){
    assert.equal(lines[key].initial.support,1);
    assert.equal(lines[key].segmentation.support,1);
    assert.equal(lines[key].support,.8,'Fourteen of seventy colour samples disagree with the final line.');
  }
  assert.ok(Math.hypot(lines.tip[0]-120,lines.tip[1]-220)<2,'A short distractor must not displace the whole edge.');
});

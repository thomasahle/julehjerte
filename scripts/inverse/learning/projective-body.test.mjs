import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from '../crop-fixture.mjs';
import {bodyFields,detectProjectiveBody,supportedBodyOutline} from './projective-body.mjs';

test('body fields preserve fractional window alignment, RGB and transparency',()=>{
  const data=new Uint8ClampedArray(4*4*4).fill(255);data[3]=0;
  const values=new Float32Array(16).fill(.75),before=values.slice();
  const f=bodyFields({width:4,height:4,data},values,4,[0,0,4,4]);
  assert.equal(f.paper[0],0);assert.ok(f.paper.slice(1).every(v=>v===.75));
  assert.ok(f.chroma.every(v=>v===.5));assert.equal(f.r[0],1);assert.equal(f.palette.colourEvidenceUsed,false);
  assert.deepEqual(values,before);
  const shifted=bodyFields({width:4,height:4,data,offset:[10,10]},values,4,[10,10,14,14]);
  assert.deepEqual(shifted.paper,f.paper);
});

test('invalid model probabilities and camera windows are rejected',()=>{
  const work={width:4,height:4,data:new Uint8ClampedArray(64).fill(255)},values=new Float32Array(16).fill(.7);
  for(const window of [[0,0,0,4],[0,0,4,NaN]])assert.throws(()=>bodyFields(work,values,4,window),TypeError);
  values[2]=-1;assert.throws(()=>bodyFields(work,values,4,[0,0,4,4]),TypeError);
});

test('body-only acceptance still requires both exposed sides and both cap outlines',()=>{
  const proposal={quad:[[1,1],[5,1],[5,5],[1,5]],evidence:{lowerEdgeSupport:[.9,.9],lobeOutlineSupport:[.9,.9]}};
  assert.equal(supportedBodyOutline(proposal),true);
  for(const field of ['lowerEdgeSupport','lobeOutlineSupport'])for(const value of [.64,NaN]){
    assert.equal(supportedBodyOutline({...proposal,evidence:{...proposal.evidence,[field]:[value,.9]}}),false);
  }
  assert.equal(supportedBodyOutline({...proposal,quad:null}),false);
});

test('projective body fitting works without two distinguishable paper colours',async()=>{
  const im=heartPhoto({width:384,height:384,background:'#000000',colours:['#ffffff','#ffffff']});
  const quad=[[190,80],[275,155],[190,230],[105,155]],ctx=im.canvas.getContext('2d');
  ctx.fillStyle='white';ctx.beginPath();quad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  im.rgba=ctx.getImageData(0,0,384,384).data;
  const body=Float32Array.from({length:384**2},(_,i)=>im.rgba[4*i]/255);
  const result=await detectProjectiveBody(im,{probability:body,resolution:384,window:[0,0,384,384]});
  assert.equal(result.candidates.length,1,JSON.stringify(result));
  const error=Math.max(...result.candidates[0].quad.map((p,i)=>Math.hypot(...p.map((v,k)=>v-quad[i][k]))));
  assert.ok(error<4,`Known monochrome overlap displaced by ${error}px`);
  assert.deepEqual(result.proposal.evidence.capColourLoss,[]);
});

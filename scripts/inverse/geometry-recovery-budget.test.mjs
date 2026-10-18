import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';

const line=(a,b)=>[a,a.map((v,i)=>(2*v+b[i])/3),a.map((v,i)=>(v+2*b[i])/3),b];
const graph=(a,b)=>new CurveGraph([[[line([a,0],[a,100])],[line([b,0],[b,100])]],[[line([0,50],[100,50])]]],100);
const cfg=settings({width:100,minWidth:2,materialResolution:200,preferMatchingSheets:false});
const target=graph(45,55),resolution=80,mask=renderCurves(target,target.points,1,resolution);
const input={sourceImage:{mask,probability:Float32Array.from(mask),resolution}};

function run(t,start,{geometryRecoveryDeadline,expired=false,expireAt=null,ordinaryEndAt=0,paperAudit}={}){
  let clock=0;
  const mocked=t.mock.method(performance,'now',()=>clock);
  try{
    return refineCurves(start,Float32Array.from(mask),resolution,1,cfg,{input,steps:160,rate:.05,deadline:1000,
      ...(geometryRecoveryDeadline===undefined?{}:{geometryRecoveryDeadline}),
      ...(paperAudit?{paperAudit}:{}),
      onProgress:r=>{if(r.step===ordinaryEndAt)clock=expired?2001:1001;if(expireAt!==null&&r.step>=expireAt)clock=2001;}});
  }finally{mocked.mock.restore();}
}

test('unused polishing time can recover the first checked pair from an invalid grid',t=>{
  const start=graph(49.5,50.5),before=start.points.slice();
  assert.equal(validate(start.solution(start.points,1,input),cfg,{checkImage:false,finalGeometry:true}).passed,false);
  const ordinary=run(t,start),recovered=run(t,start,{geometryRecoveryDeadline:2000});
  assert.equal(ordinary.steps,5);
  assert.equal(ordinary.geometryPassed,false);
  assert.ok(recovered.geometryRecovery?.steps>0);
  assert.equal(recovered.geometryPassed,true);
  assert.equal(recovered.paperPassed,true);
  const solution=start.solution(recovered.points,1,input);
  assert.equal(validate(solution,cfg,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,cfg).passed,true);
  assert.deepEqual(start.points,before);
});

test('a geometry-valid start retains its ordinary cutoff and coordinates',t=>{
  const start=graph(45,55);
  assert.equal(validate(start.solution(start.points,1,input),cfg,{checkImage:false,finalGeometry:true}).passed,true);
  const ordinary=run(t,start),reserved=run(t,start,{geometryRecoveryDeadline:2000});
  assert.deepEqual(reserved,ordinary);
  assert.equal(reserved.geometryRecovery,undefined);
});

test('an expired recovery allowance cannot start additional geometry updates',t=>{
  const start=graph(49.5,50.5),result=run(t,start,{geometryRecoveryDeadline:2000,expired:true});
  assert.equal(result.steps,5);
  assert.equal(result.geometryRecovery,undefined);
  assert.equal(result.geometryPassed,false);
});

test('a geometric checkpoint reached before the cutoff keeps time for finer paper verification',t=>{
  const start=graph(49.5,50.5);
  const paperAudit=(solution,settings)=>{
    const audit=materialAudit(solution,settings);
    return{...audit,passed:false,status:'uncertain',summary:{...audit.summary,status:'uncertain'}};
  };
  const options={ordinaryEndAt:80,paperAudit};
  const ordinary=run(t,start,options),reserved=run(t,start,{...options,geometryRecoveryDeadline:2000});
  assert.equal(ordinary.geometryPassed,true);
  assert.equal(ordinary.paperPassed,false);
  assert.deepEqual(reserved,ordinary);
  assert.equal(reserved.geometryRecovery,undefined);
});

test('the recovery cutoff still returns a failure when the cuts cannot move apart',t=>{
  const start=graph(49.5,50.5);start.fixed.fill(1);
  const before=start.points.slice(),result=run(t,start,{geometryRecoveryDeadline:2000,expireAt:40});
  assert.ok(result.geometryRecovery?.steps>0);
  assert.equal(result.steps,45);
  assert.equal(result.geometryPassed,false);
  assert.equal(result.paperPassed,false);
  assert.deepEqual(result.points,before);
});

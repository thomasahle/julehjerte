import test from 'node:test';
import assert from 'node:assert/strict';
import {isometryProjector,projectIsometries} from '../../static/inverse/core/direct/isometry-projection.js';
const vector=a=>Float64Array.from(a),close=(a,b,tol=1e-9)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tol,`${i}: ${v} != ${b[i]}`));};
const identity={L:[1,0,0,1],t:[0,0]},rotation=(angle,t=[0,0])=>({L:[Math.cos(angle),-Math.sin(angle),Math.sin(angle),Math.cos(angle)],t});

test('a rigid-map component projects onto the mean in its root frame',()=>{
  const relations=[{a:1,b:0,map:rotation(Math.PI/2,[10,20])},{a:2,b:0,map:rotation(-Math.PI/2,[-5,8])}];
  const input=vector([3,6,10,20,-5,8]),expected=[1,2,8,21,-3,7];
  for(const edges of [relations,relations.toReversed()]){
    const compiled=isometryProjector(3,edges),values=input.slice();assert.equal(projectIsometries(compiled,values),true);close(values,expected);
    const first=values.slice();assert.equal(projectIsometries(compiled,values),true);close(values,first);
    // The input residual is perpendicular to two independent feasible motions.
    const residual=input.map((v,i)=>v-values[i]);
    for(const motion of [[1,0,0,1,0,-1],[0,1,-1,0,1,0]])assert.ok(Math.abs(residual.reduce((sum,v,i)=>sum+v*motion[i],0))<1e-9);
  }
});

test('cycles constrain a root to a line or a point',()=>{
  const theta=.37,u=[Math.cos(theta),Math.sin(theta)],centre=[12,9];
  const L=[2*u[0]**2-1,2*u[0]*u[1],2*u[0]*u[1],2*u[1]**2-1];
  const map={L,t:[centre[0]-L[0]*centre[0]-L[1]*centre[1],centre[1]-L[2]*centre[0]-L[3]*centre[1]]};
  const values=vector([33,47]),along=(values[0]-centre[0])*u[0]+(values[1]-centre[1])*u[1];
  assert.equal(projectIsometries(isometryProjector(1,[{a:0,b:0,map}]),values),true);
  close(values,centre.map((v,i)=>v+along*u[i]));
  const turn=angle=>{const m=rotation(angle);m.t=centre.map((v,i)=>v-m.L[2*i]*centre[0]-m.L[2*i+1]*centre[1]);return m;};
  const compiled=isometryProjector(2,[{a:0,b:1,map:turn(Math.PI/2)},{a:0,b:1,map:turn(-Math.PI/2)}]),points=vector([1,7,12,33]);
  assert.equal(projectIsometries(compiled,points),true);close(points,[...centre,...centre]);
});

test('fixed coordinates, tangent projection and changing map offsets remain consistent',()=>{
  const map=rotation(Math.PI/2,[10,20]),compiled=isometryProjector(2,[{a:1,b:0,map}]);
  const fixed=Uint8Array.from([1,0,0,0]),original=vector([3,0,0,0]),values=vector([90,2,2,7]);
  assert.equal(projectIsometries(compiled,values,{fixed,original}),true);assert.equal(values[0],3);close(values,[3,5,5,23]);
  const gradient=vector([9,2,4,7]);assert.equal(projectIsometries(compiled,gradient,{fixed,tangent:true}),true);close(gradient,[0,-1,1,0]);
  map.t=[-20,8];const moved=vector([3,0,-20,8]);assert.equal(projectIsometries(compiled,moved),true);close(moved,[1.5,0,-20,9.5]);
});

test('inconsistent cycles or fixed coordinates fail atomically',()=>{
  for(const [relations,fixed,original]of[
    [[{a:0,b:1,map:identity},{a:0,b:1,map:{L:identity.L,t:[1,0]}}],null,null],
    [[{a:0,b:1,map:identity}],Uint8Array.from([1,0,1,0]),vector([1,0,2,0])]
  ]){
    const values=vector([12,18,31,9]),before=values.slice();
    assert.equal(projectIsometries(isometryProjector(2,relations),values,{fixed,original:original||values}),false);assert.deepEqual(values,before);
  }
});

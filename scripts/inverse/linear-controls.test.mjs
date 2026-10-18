import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {shortLinearControls,reduceLinearCoefficients,restoreLinearControls} from '../../static/inverse/core/direct/linear-controls.js';

test('straight-span parameters preserve arbitrary ordered handles and use the endpoint chain rule',()=>{
  const cut=[Cubic.line([20,0],[20,40]).p,[[20,40],[20.2,40.1],[21.8,40.9],[22,41]],Cubic.line([22,41],[22,100]).p];
  const graph=new CurveGraph([[cut],[]]),before=graph.points.slice(),linear=shortLinearControls(graph,before,3);
  assert.equal(linear.size,2);const points=before.slice();restoreLinearControls(points,before,linear);assert.deepEqual(points,before);
  const [edge]=graph.paths[0][1],ids=graph.edges[edge],coefficients=new Map([[ids[1],.5],[ids[2],-.3],[ids[0],.2]]);
  const evaluate=p=>.5*p[2*ids[1]]-.3*p[2*ids[2]]+.2*p[2*ids[0]];
  reduceLinearCoefficients(coefficients,linear);
  for(const id of [ids[0],ids[3]]){
    const moved=before.slice();moved[2*id]+=1e-4;restoreLinearControls(moved,before,linear);
    assert.ok(Math.abs((evaluate(moved)-evaluate(before))/1e-4-coefficients.get(id))<1e-9);
  }
  points[2*ids[0]]+=.4;points[2*ids[3]+1]-=.7;restoreLinearControls(points,before,linear);
  for(const [id,partners]of linear)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(points[2*id+axis]-partners.reduce((sum,[other,w])=>sum+w*points[2*other+axis],0))<1e-10);
  assert.deepEqual(graph.points,before);
});

test('curved, reversing and long spans retain their original control freedom',()=>{
  for(const curve of [
    [[20,40],[20.2,40.2],[21.8,40.9],[22,41]],
    [[20,40],[21.8,40.9],[20.2,40.1],[22,41]],
    [[20,40],[19.8,39.9],[21.8,40.9],[22,41]],
    Cubic.line([20,40],[30,41]).p,
  ]){
    const graph=new CurveGraph([[[curve]],[]]);assert.equal(shortLinearControls(graph,graph.points,3).size,0);
  }
});

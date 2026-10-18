import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,segmentDistance} from '../../static/inverse/core/bezier.js';
import {materialAudit,unfoldedPolylines} from '../../static/inverse/core/material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fixture} from './fixtures.mjs';

// Independent of the tile index, seed raster and distance transform: inspect
// every chord at every paper centre. Compare both guarded core memberships;
// connectivity, fold intervals and full maps have separate regression tests.
function bruteCore(solution,family,cfg){
  const w=solution.graph.target.width,n=cfg.materialResolution,h=w/n,R=cfg.nominalWidth/2;
  const guard=Math.SQRT2*h/2+cfg.geometryTolerance,result=new Uint8Array(3*n*n);
  const chords=unfoldedPolylines(solution,family,cfg.geometryTolerance).flatMap(line=>line.slice(1).map((b,i)=>[line[i],b]));
  for(let j=0;j<3*n;j++)for(let i=0;i<n;i++){
    const x=(i+.5)*h,y=-w/2+(j+.5)*h,outline=w/2-Math.hypot(x-w/2,Math.max(0,-y,y-2*w));
    if(outline<=0)continue;
    let clearance=outline;
    for(const [a,b]of chords)clearance=Math.min(clearance,segmentDistance([x,y],a,b));
    result[j*n+i]=Number(clearance>R-guard)+2*Number(clearance>R+guard);
  }
  return result;
}

function compareCores(solution,cfg,label){
  const result=materialAudit(solution,cfg,{includeMaps:true,native:false});
  for(const family of result.families){
    const actual=family.map.map(v=>v===1||v===3?3:v===2?1:0);
    assert.deepEqual(actual,bruteCore(solution,family.family,cfg),`${label}, sheet ${family.family}`);
  }
}

const config=raw=>settings({width:60,minWidth:3,cutError:0,printShrinkPercent:0,materialResolution:80,...raw});

test('paper tile candidates preserve brute-force core membership for corners, necks and curves',()=>{
  for(const name of['straight','hidden-corner','neck','thin'])compareCores(fixture(name),config(),name);
  const curves=fixture('straight');
  curves.graph.edges[0].curve=new Cubic([[12,0],[48,16],[-18,43],[27,60]]);
  curves.graph.edges[1].curve=Cubic.line([-8,0],[68,60]);
  curves.graph.edges[2].curve=Cubic.line([0,4],[60,59]);
  compareCores(curves,config({materialResolution:81}),'oblique and outlying curves');
});

test('paper tile reach follows both guards across lattice and paper scales',()=>{
  for(const [width,minWidth,resolution,tolerance]of[[20,.1,80,.002],[20,12,81,.1],[300,30,80,.1]]){
    const solution=fixture('hidden-corner');solution.graph.target.width=width;
    for(const edge of solution.graph.edges)edge.curve=new Cubic(edge.curve.p.map(p=>p.map(v=>v*width/60)));
    compareCores(solution,config({width,minWidth,materialResolution:resolution,geometryTolerance:tolerance}),`${width} mm, ${minWidth} mm core`);
  }
});

test('cuts on either side of either guard retain the brute-force classification',()=>{
  const cfg=config(),h=cfg.width/cfg.materialResolution,R=cfg.nominalWidth/2,guard=Math.SQRT2*h/2+cfg.geometryTolerance;
  for(const radius of[R-guard,R+guard])for(const delta of[-1e-9,0,1e-9]){
    const solution=fixture('straight'),x=29.5*h-radius+delta;
    solution.graph.edges[0].curve=Cubic.line([x,0],[x,60]);
    compareCores(solution,cfg,`radius ${radius}, displacement ${delta}`);
  }
});

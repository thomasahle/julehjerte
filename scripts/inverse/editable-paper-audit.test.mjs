import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEditablePaper} from './editable-paper-audit.mjs';

test('paper checks use the downloaded cut coordinates and their physical scale',()=>{
  const overlap={left:20,top:30,width:200,height:200};
  const line=(id,lobe,a,b)=>({id,lobe,segments:[Object.fromEntries([0,1,2,3].map((i)=>['p'+i,{x:20+2*(a[0]+(b[0]-a[0])*i/3),y:30+2*(a[1]+(b[1]-a[1])*i/3)}]))]});
  const design={weaveParity:0,fingers:[
    line('R-cut-0','right',[48.55,0],[48.55,100]),
    line('R-cut-1','right',[51.45,0],[51.45,100]),
    line('L-cut-0','left',[0,50],[100,50])
  ]},counts={right:2,left:1};
  const coarse=auditEditablePaper(design,overlap,{width:100,materialResolution:360},counts);
  assert.equal(coarse.geometry.passed,true);
  assert.equal(coarse.paper.status,'uncertain');
  assert.equal(auditEditablePaper(design,overlap,{width:100,materialResolution:700},counts).paper.status,'pass');
  const parsed={...design,fingers:design.fingers.map((f,i)=>({...f,id:`parsed-${i}`,segments:f.segments.map(s=>({p0:s.p3,p1:s.p2,p2:s.p1,p3:s.p0}))})).concat([
    line('edge-a','right',[0,100],[0,0]),line('edge-b','right',[100,100],[100,0]),
    line('edge-c','left',[100,0],[0,0]),line('edge-d','left',[100,100],[0,100])
  ])};
  assert.equal(auditEditablePaper(parsed,overlap,{width:100,materialResolution:700},counts).paper.status,'pass');
  const edited={...design,fingers:[line('R-cut-0','right',[49.5,0],[49.5,100]),line('R-cut-1','right',[50.5,0],[50.5,100]),design.fingers[2]]};
  assert.equal(auditEditablePaper(edited,overlap,{width:100,materialResolution:700},counts).geometry.passed,false);
  assert.throws(()=>auditEditablePaper({...design,fingers:design.fingers.slice(1)},overlap,{},counts),/every exported slit/);
  assert.throws(()=>auditEditablePaper(design,{...overlap,height:100},{},counts),/rectangular SVG/);
});

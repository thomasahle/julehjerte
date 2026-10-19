import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {Resvg} from '@resvg/resvg-js';
import {construct,compile,circle,targetSVG,rayPort} from '../../docs/design-start/topology-construction.mjs';
import {topologyCases} from './topology-fixtures.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate,sampleWeave} from '../../static/inverse/core/validate.js';
import {sampleTarget} from '../../static/inverse/core/input.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {segmentDistance} from '../../static/inverse/core/bezier.js';
const cfg=settings({roundHidden:false,trials:0});
for(const c of topologyCases)test(`direct contour construction: ${c.id}`,async()=>{
 const r=construct(c.options),sol=loadSolutionJSON(r.geometry),check=validate(sol,cfg,{checkImage:false});
 assert.equal(check.passed,c.expectGeometry,JSON.stringify(check.issues));
 if(c.expectGeometry)assert.equal(materialAudit(sol,cfg).summary.status,'pass');
 // The old sampler can disagree exactly on a shared line because opposite
 // traversal directions round an intersection to different sides of a pixel.
 // Account for those reports explicitly, rather than treating them as passes.
 const oldTarget=sampleTarget(sol.graph.target,101),oldWoven=sampleWeave(sol,101);
 for(let i=0;i<oldTarget.length;i++)if(oldTarget[i]!==oldWoven[i]){
  const p=[(i%101+.5)*100/101,(Math.floor(i/101)+.5)*100/101];
  assert.ok(Math.min(...r.edges.filter(e=>e.family==='AB').map(e=>segmentDistance(p,e.from,e.to)))<1e-7,'Unexplained legacy sampler disagreement');
 }
 // Check cut membership directly: every visible edge once, every shared edge
 // once in EACH sheet. A merely similar raster cannot satisfy this assertion.
 for(const [i,e]of r.edges.entries()){
  const counts=[r.geometry.A_overlap_paths,r.geometry.B_overlap_paths].map(f=>f.flat().filter(ref=>ref.curve===String(i)).length);
  assert.deepEqual(counts,e.family==='AB'?[1,1]:e.family==='A'?[1,0]:[0,1]);
 }
 // Independent fills: original polygon artwork vs exported A/B cutting paths.
 const n=512,png=new Resvg(targetSVG(r)).render().asPng(),ctx=createCanvas(n,n).getContext('2d');
 ctx.drawImage(await loadImage(png),0,0);const rgba=ctx.getImageData(0,0,n,n).data,woven=await renderExportedWeave(r.geometry,n);
 const visible=r.edges.filter(e=>e.family!=='AB');let different=0;
 for(let i=0;i<n*n;i++)if(woven.mask[i]!==Number(rgba[4*i]<128)){
  different++;const p=[(i%n+.5)*100/n,(Math.floor(i/n)+.5)*100/n];
  assert.ok(Math.min(...visible.map(e=>segmentDistance(p,e.from,e.to)))<.2,'Difference away from the visible boundary');
 }
 assert.ok(different/(n*n)<.001,'Original artwork was changed');
});
test('cut compiler rejects a branching sheet and an isolated cutting cycle',()=>{
 const r=construct();
 assert.throws(()=>compile([...r.edges,r.edges[0]]),/degree/);
 const square=[[46,46],[54,46],[54,54],[46,54]],cycle=square.map((p,i)=>({from:p,to:square[(i+1)%4],family:'A',kind:'motif'}));
 assert.throws(()=>compile([...r.edges,...cycle]),/Closed or disconnected/);
});
test('unsupported topology is rejected rather than silently losing a hole',()=>{
 assert.throws(()=>construct({recipe:'four-gate',contours:[circle(24),circle(12)]}),/exactly one simple contour/);
 assert.throws(()=>rayPort(circle(5,[20,20]),0),/one contour hit/);
});

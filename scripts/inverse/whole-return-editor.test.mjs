import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {curvesOf} from '../../static/inverse/core/graph.js';
import {buildWholeReturnEditor} from './diagnostics/build-whole-return-editor.mjs';
import {excludesReturnByCone} from './diagnostics/return-cone.mjs';
import {experimentalSelfReturns} from './diagnostics/self-return-candidate.mjs';
import {returnDiagnosticCases,diagnosticSubdivisions,subdivideDiagnosticPaths} from './self-return-subdivision-study.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
test('the directional exclusion requires a continuous finite path and checks current controls',()=>{
  const path=[Cubic.line([0,0],[5,0]),Cubic.line([5,0],[5,5])];
  assert.equal(excludesReturnByCone(path),true);
  assert.equal(excludesReturnByCone(path.toReversed().map(c=>c.reversed())),true);
  const disconnected=[path[0],Cubic.line([0,0],[0,5])];
  assert.equal(excludesReturnByCone(disconnected),false,'A jump between segments invalidates the chord/arc bound.');
  const degenerate=new Cubic([[0,0],[0,0],[0,0],[0,0]]);
  assert.equal(excludesReturnByCone([degenerate]),true);
  path[1].p[1]=[2,-2];assert.equal(excludesReturnByCone(path),false,'Do not cache a cone after its controls change.');
  const invalid={p:[[0,0],[1,0],[Infinity,0],[2,0]]};assert.equal(excludesReturnByCone([invalid]),false);
  for(const angle of [0,.3,Math.PI-0.01]){
    const point=(x,y)=>[100+x*Math.cos(angle)-y*Math.sin(angle),70+x*Math.sin(angle)+y*Math.cos(angle)];
    const curved=new Cubic([[0,0],[0,0],[3,1],[4,4]].map(([x,y])=>point(x,y)));
    assert.equal(excludesReturnByCone([curved]),true,'Zero endpoint derivatives and angle wrapping retain the same cone.');
  }
});

test('the generated whole-cut editor kernel retains every captured return and its complete witness',async()=>{
  await fs.mkdir('tmp',{recursive:true});const scratch=await fs.mkdtemp('tmp/whole-editor-test-');
  try{
    const directory=await buildWholeReturnEditor(path.join(scratch,'runtime'));
    await assert.rejects(buildWholeReturnEditor(directory),/EEXIST/);
    const manifest=JSON.parse(await fs.readFile(path.join(directory,'source.json')));
    for(const [file,digest]of Object.entries({...manifest.inputs,...manifest.sourceHashes}))assert.equal(hash(await fs.readFile(file)),digest,file);
    const {pathReturns}=await import(pathToFileURL(path.join(directory,'path-returns.mjs')).href);
    for(const entry of await returnDiagnosticCases())for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
      const divided=subdivideDiagnosticPaths(entry.paths,knots,reflect,entry.cfg.width),graph=new CurveGraph(divided.paths,entry.cfg.width),solution=graph.solution(graph.points,1);
      const expected=experimentalSelfReturns(solution,entry.cfg),margin=Math.min(entry.cfg.nominalWidth,.015*entry.cfg.width);
      for(let family=0;family<2;family++)for(let slit=0;slit<divided.paths[family].length;slit++){
        const curves=curvesOf(solution,family,slit),before=JSON.stringify(curves.map(c=>c.p));
        const actual=pathReturns(curves,{margin,local:entry.cfg.localNeighborhoodFactor*entry.cfg.nominalWidth,tolerance:entry.cfg.geometryTolerance,endpointTolerance:.01*entry.cfg.width});
        const reference=expected.filter(r=>r.family===family&&r.slit===slit).map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['family','slit','edgeChain'].includes(k))));
        assert.deepEqual(actual,reference,entry.name+' '+knots+' '+reflect);
        assert.equal(JSON.stringify(curves.map(c=>c.p)),before);
      }
    }
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
});

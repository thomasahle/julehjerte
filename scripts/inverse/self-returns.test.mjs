import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {shortSelfReturns} from '../../static/inverse/core/self-returns.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {solveGraph} from '../../static/inverse/core/solver.js';

const cfg=settings(AUTOMATIC_PRESET);
for(const name of ['gift','anchor'])test(`the saved ${name} return is rejected before editable conversion`,async()=>{
  const geometry=JSON.parse(await fs.readFile(`scripts/inverse/fixtures/editor-${name}-return.json`));
  const solution=loadSolutionJSON({...geometry,schema:'heartcurves-2',units:'mm'}),before=JSON.stringify(geometry);
  const issues=shortSelfReturns(solution,cfg);assert.ok(issues.length);
  for(const issue of issues){
    assert.ok(issue.distanceUpper<issue.required);assert.ok(issue.arcSeparation>=2*issue.required);
    assert.ok(issue.arcSeparation<=cfg.localNeighborhoodFactor*cfg.nominalWidth);
    assert.ok(issue.curves[1]>issue.curves[0]+1);
    assert.deepEqual(issue.edgeChain,solution.paths[issue.family][issue.slit].slice(issue.curves[0],issue.curves[1]+1).map(([edge])=>edge));
    assert.ok(Math.hypot(...issue.points[0].map((v,i)=>v-issue.points[1][i]))<issue.required);
  }
  assert.ok(validate(solution,cfg).issues.some(i=>i.type==='short_self_clearance'));
  assert.equal(JSON.stringify(geometry),before);
});

test('MILP routing excludes an integral short-return chain before publishing an incumbent',async()=>{
  const points=[[50,0],[50,45],[51,45],[54,45],[54,45.7],[51,45.7],[50,45.7],[50,100]];
  const path=points.slice(1).map((p,i)=>Cubic.line(points[i],p).p);
  const model=new CurveGraph([[path],[[Cubic.line([0,80],[100,80]).p]]]),graph=model.solution(model.points,1).graph;
  let audits=0,incumbents=0;
  await assert.rejects(solveGraph(graph,settings({...AUTOMATIC_PRESET,timeLimit:5,maxRounds:2}),{
    onProgress:r=>{if(r.validatedIncumbent)incumbents++;},
    coreGate:()=>{audits++;return{passed:true,summary:{status:'pass'}};}
  }),error=>{
    assert.equal(error.report.termination,'candidate_graph_exhausted');
    assert.ok(error.report.history[0].shortReturnChains>0);
    return true;
  });
  assert.equal(audits,0);assert.equal(incumbents,0,'An uneditable chain must never become a validated candidate');
});

test('ordinary right-angle corners stay valid when their legs are subdivided',()=>{
  for(const step of [1,4,10]){
    const points=[[20,0],[20,49],[20,50],[21,50],[60,50],[60,100]],curves=[];
    for(let i=1;i<points.length;i++){
      const line=Cubic.line(points[i-1],points[i]),count=Math.ceil(line.length()/step);
      for(let j=0;j<count;j++)curves.push(line.subcurve(j/count,(j+1)/count).p);
    }
    const graph=new CurveGraph([[curves],[[Cubic.line([0,80],[100,80]).p]]]);
    assert.deepEqual(shortSelfReturns(graph.solution(graph.points,1),cfg),[]);
  }
});

test('reflecting a short return cannot hide it from the spatial candidate search',async()=>{
  const geometry=JSON.parse(await fs.readFile('scripts/inverse/fixtures/editor-anchor-return.json'));
  const source=loadSolutionJSON({...geometry,schema:'heartcurves-2',units:'mm'}),width=source.graph.target.width;
  let reference;
  for(const flips of [[false,false],[true,false],[false,true],[true,true]]){
    const paths=source.paths.map((paths,family)=>paths.map((_,slit)=>{
      let curves=curvesOf(source,family,slit).map(c=>c.p.map(p=>p.map((v,axis)=>flips[axis]?width-v:v)));
      // Preserve the required endpoint order after reflecting its travel axis.
      if(flips[1-family])curves=curves.reverse().map(c=>c.reverse());
      return curves;
    }));
    const model=new CurveGraph(paths),issues=shortSelfReturns(model.solution(model.points,1),cfg);
    const gaps=issues.map(i=>i.distanceUpper).sort((a,b)=>a-b);
    assert.ok(gaps.length,'Every reflection must expose the original short return');
    if(reference){
      assert.equal(gaps.length,reference.length);
      gaps.forEach((gap,i)=>assert.ok(Math.abs(gap-reference[i])<1e-8));
    }else reference=gaps;
  }
});

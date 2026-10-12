import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {shortSelfReturns} from '../../static/inverse/core/self-returns.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';

const cfg=settings(AUTOMATIC_PRESET);
for(const name of ['gift','anchor'])test(`the saved ${name} return is rejected before editable conversion`,async()=>{
  const geometry=JSON.parse(await fs.readFile(`scripts/inverse/fixtures/editor-${name}-return.json`));
  const solution=loadSolutionJSON({...geometry,schema:'heartcurves-2',units:'mm'}),before=JSON.stringify(geometry);
  const issues=shortSelfReturns(solution,cfg);assert.ok(issues.length);
  for(const issue of issues){
    assert.ok(issue.distanceUpper<issue.required);assert.ok(issue.arcSeparation>=2*issue.required);
    assert.ok(issue.arcSeparation<=cfg.localNeighborhoodFactor*cfg.nominalWidth);
    assert.ok(issue.curves[1]>issue.curves[0]+1);
    assert.ok(Math.hypot(...issue.points[0].map((v,i)=>v-issue.points[1][i]))<issue.required);
  }
  assert.ok(validate(solution,cfg).issues.some(i=>i.type==='short_self_clearance'));
  assert.equal(JSON.stringify(geometry),before);
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

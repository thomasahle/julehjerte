/** Recheck actual editable SVG cuts in the solver's physical coordinate frame.
 * The converter keeps the overlap axes: right cuts are family A, left cuts B.
 * Expected counts prevent an omitted cut from silently passing. SVG import
 * regenerates IDs, so only actual straight square edges are excluded.
 */
import assert from 'node:assert/strict';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {settings} from '../../static/inverse/core/settings.js';

export function editablePaperSolution(design,overlap,raw,counts){
  assert.ok([overlap.left,overlap.top,overlap.width,overlap.height].every(Number.isFinite)&&overlap.width>0&&overlap.height>0,'An editable template needs a finite overlap');
  assert.ok(Math.abs(overlap.width-overlap.height)<1e-5,'Do not stretch a rectangular SVG into a different physical template');
  const cfg=settings(raw),scale=p=>[(p.x-overlap.left)*cfg.width/overlap.width,(p.y-overlap.top)*cfg.width/overlap.height];
  const families=['right','left'].map((lobe,i)=>{
    const cuts=design.fingers.filter(f=>f.lobe===lobe).map(cut=>cut.segments.map(segment=>[segment.p0,segment.p1,segment.p2,segment.p3].map(scale)))
      .filter(path=>![0,cfg.width].some(edge=>path.length&&path.every(c=>c.every(p=>Math.abs(p[i]-edge)<1e-8))));
    assert.equal(cuts.length,counts[lobe],'Recheck every exported slit');
    return cuts.map(path=>path[0][0][1-i]>path.at(-1)[3][1-i]?path.toReversed().map(c=>c.toReversed()):path)
      .sort((a,b)=>a[0][0][i]-b[0][0][i]);
  });
  const graph=new CurveGraph(families,cfg.width),solution=graph.solution(graph.points,design.weaveParity?-1:1);
  return{solution,cfg};
}

export function auditEditablePaper(design,overlap,raw,counts){
  const {solution,cfg}=editablePaperSolution(design,overlap,raw,counts);
  const geometry=validate(solution,cfg),paper=geometry.passed?finalMaterialAudit(solution,cfg).summary:null;
  return{geometry,paper,materialResolution:cfg.materialResolution};
}

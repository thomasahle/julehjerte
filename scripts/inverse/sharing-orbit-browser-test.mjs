/** Replay controlled seam perturbations through the served cleanup module.
 * These are geometry regressions; fresh-fit UI cases live in paint-browser-test.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {framePaths} from './fixtures/symmetric-frame.mjs';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232',output=process.env.INVERSE_TEST_OUTPUT||'tmp/sharing-orbit-browser';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const cases=[
  {name:'full-square',symmetry:{mirrorX:true,transpose:true}},
  {name:'both-diagonals',symmetry:{transpose:true,antiTranspose:true}},
  {name:'unequal-mirrors',unequal:true,symmetry:{mirrorX:true,mirrorY:true}},
  {name:'unequal-half-turn',unequal:true,symmetry:{rotate180:true}},
];
const report={origin,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Analytic fitted perturbations, served cleanup and validation modules; independent resvg comparison with known unperturbed cuts. No fresh optimization or UI injection.',sourceHashes:{},results:[]};
await fs.mkdir(output,{recursive:true});
for(const name of ['share','shared-span','sharing-orbit','symmetry']){
  const file=`static/inverse/core/direct/${name}.js`,source=await fs.readFile(file),response=await fetch(origin+'/'+file.replace(/^static\//,''));
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),source);
  report.sourceHashes[file]=createHash('sha256').update(source).digest('hex');
}
const truth=new Map();
for(const unequal of[false,true]){
  const graph=new CurveGraph(framePaths(0,unequal),100);
  truth.set(unequal,await renderExportedWeave(solutionJSON(graph.solution(graph.points,1)),1600));
}
for(const name of names){
  const browser=await browsers[name].launch({headless:true});
  try{
    const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/en/editor/paint/');
    for(const spec of cases){
      const row={browser:name,browserVersion:browser.version(),name:spec.name};report.results.push(row);
      try{
        const actual=await page.evaluate(async({spec,paths,target})=>{
          const {CurveGraph}=await import('/inverse/core/direct/curves.js'),{settings}=await import('/inverse/core/settings.js');
          const {sampleWeave,validate}=await import('/inverse/core/validate.js'),{materialAudit}=await import('/inverse/core/material.js');
          const {finalizeShared}=await import('/inverse/core/direct/share.js'),{symmetryReport}=await import('/inverse/core/direct/symmetry.js');
          const {solutionJSON}=await import('/inverse/core/graph.js');
          const solution=paths=>{const graph=new CurveGraph(paths,100);return graph.solution(graph.points,1);};
          const before=solution(paths),mask=sampleWeave(solution(target),400),saved=solutionJSON(before),copy=mask.slice();
          before.graph.target.sourceImage={resolution:400,mask};before.paths[0].reverse();before.paths[1].reverse();
          const cfg=settings({symmetry:spec.symmetry,preferMatchingSheets:false}),after=finalizeShared(before,cfg);
          if(mask.some((v,i)=>v!==copy[i]))throw new Error('Cleanup modified the source.');
          if(finalizeShared(after,cfg)!==after)throw new Error('Already shared seams were changed again.');
          return{geometry:solutionJSON(after),before:saved,sharing:after.report.finalSharing,validation:validate(after,cfg,{checkImage:false}),material:materialAudit(after,cfg),symmetry:symmetryReport(after,spec.symmetry),hiddenLength:after.graph.edges.filter(e=>!e.visible).reduce((sum,e)=>sum+e.curve.length(),0)};
        },{spec,paths:framePaths(.16,!!spec.unequal),target:framePaths(0,!!spec.unequal)});
        assert.equal(actual.sharing.applied,true);assert.equal(actual.sharing.errorAfter,0);
        assert.equal(actual.validation.passed,true);assert.equal(actual.material.passed,true);
        assert.deepEqual(actual.symmetry.honoured.slice().sort(),Object.keys(spec.symmetry).sort());
        assert.ok(actual.hiddenLength>84);
        const target=truth.get(!!spec.unequal),old=await renderExportedWeave(actual.before,1600),rendered=await renderExportedWeave(actual.geometry,1600);
        const error=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-target.coverage[i]),0)/r.coverage.length;
        row.coverageBefore=error(old);row.coverageAfter=error(rendered);assert.ok(row.coverageAfter<row.coverageBefore/5);
        for(let y=0;y<1600;y++)for(let x=0;x<1600;x++){
          const u=Math.min(x+.5,1599.5-x)/16,v=Math.min(y+.5,1599.5-y)/16;
          if(u>24&&u<31&&v>24&&v<31)assert.equal(rendered.coverage[y*1600+x],target.coverage[y*1600+x]);
        }
        const dir=path.join(output,name+'-'+spec.name);await fs.mkdir(dir,{recursive:true});
        await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(actual,null,2));
        for(const [label,value]of[['before',old],['after',rendered],['truth',target]])await fs.writeFile(path.join(dir,label+'.png'),value.png);
        Object.assign(row,{seconds:actual.sharing.seconds,hiddenLength:actual.hiddenLength,maskBefore:actual.sharing.errorBefore,maskAfter:actual.sharing.errorAfter});
        assert.deepEqual(errors,[]);row.passed=true;
      }catch(error){row.passed=false;row.failure=error.stack;process.exitCode=1;}
      await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(row));
    }
    await context.close();
  }finally{await browser.close();}
}

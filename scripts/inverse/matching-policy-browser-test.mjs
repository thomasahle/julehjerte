/** Controlled matching-policy fixtures in the served engine, not fresh fits.
 * Compare normal selection and retained checkpoints against independent SVG
 * renders, including results above the image-fidelity warning threshold.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {renderExportedWeave} from './export-renderer.mjs';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const output=process.env.INVERSE_TEST_OUTPUT||'tmp/matching-policy-browser';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const cases=[
  {name:'cross-warning',x:47.25,y:50.8,baseline:.0275,error:.0345875,allowance:.01,warning:.03,identical:true},
  {name:'already-warning',x:46.5,y:50.8,baseline:.035,error:.041975,allowance:.01,warning:.03,identical:true},
  {name:'outside-allowance',x:47.25,y:50.8,baseline:.0275,error:.0275,allowance:.001,warning:.03,identical:false},
  {name:'custom-warning',x:50,y:51,baseline:0,error:.00995,allowance:.01,warning:.005,identical:true},
];
await fs.mkdir(output,{recursive:true});
const report={origin,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),method:'Analytic valid fitted pairs and original binary targets; actual served matching/Stop/export code. No optimizer or UI result injection. Exported geometry is independently rasterized by resvg.',sourceHashes:{},results:[]};
for(const file of ['static/inverse/core/direct/prefer-matching.js','static/inverse/core/stopped.js','static/inverse/core/engine.js']){
  const source=await fs.readFile(file),response=await fetch(origin+'/'+file.replace(/^static\//,''));
  assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),source);
  report.sourceHashes[file]=createHash('sha256').update(source).digest('hex');
}
for(const name of names){
  const browser=await browsers[name].launch({headless:true});
  try{
    const context=await browser.newContext();
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
    const page=await context.newPage(),pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(origin+'/en/editor/paint/');
    for(const spec of cases){
      const row={browser:name,browserVersion:browser.version(),name:spec.name};report.results.push(row);
      try{
        const actual=await page.evaluate(async spec=>{
          const {Cubic}=await import('/inverse/core/bezier.js'),{CurveGraph}=await import('/inverse/core/direct/curves.js');
          const {sampleWeave}=await import('/inverse/core/validate.js'),{settings}=await import('/inverse/core/settings.js');
          const {matchingProposals,preferMatchingSolution}=await import('/inverse/core/direct/prefer-matching.js');
          const {matchingSummary}=await import('/inverse/core/direct/matching.js'),{solutionJSON,loadSolutionJSON}=await import('/inverse/core/graph.js');
          const {finish}=await import('/inverse/core/engine.js'),{finishStopped}=await import('/inverse/core/stopped.js');
          const pair=(x,y)=>{const graph=new CurveGraph([[[Cubic.line([x,0],[x,100]).p]],[[Cubic.line([0,y],[100,y]).p]]]);return graph.solution(graph.points,1);};
          const original=pair(50,spec.y),mask=sampleWeave(pair(spec.x,spec.y),400),before=mask.slice();
          original.graph.target.sourceImage={mask,resolution:400};
          const cfg=settings({trials:0,roundHidden:false,matchingErrorAllowance:spec.allowance,maxImageError:spec.warning});
          const packet=solution=>({geometry:JSON.stringify(solutionJSON(solution)),error:null});
          const packets=[packet(original),...matchingProposals(original).map(p=>{const graph=new CurveGraph(p.paths);return packet(graph.solution(graph.points,1));})];
          const normal=finish(preferMatchingSolution(original,cfg,{deadline:0}),cfg);
          const stopped=await finishStopped(original.graph.target,cfg,packets);
          // The reports and exported coordinates, rather than the input pair,
          // carry the selected matching status. Parsing happens independently
          // in Node's export renderer below.
          const saved=result=>({report:result.report,geometry:result.files['cut_geometry.json'],identical:matchingSummary(loadSolutionJSON(result.files['cut_geometry.json'])).identical});
          if(mask.some((value,i)=>value!==before[i]))throw new Error('Matching changed the original source.');
          return{mask:Array.from(mask),normal:saved(normal),stopped:saved(stopped)};
        },spec);
        const dir=path.join(output,name+'-'+spec.name);await fs.mkdir(dir,{recursive:true});
        for(const method of ['normal','stopped']){
          const value=actual[method],r=value.report;
          assert.equal(value.identical,spec.identical);
          assert.equal(r.solver.matchingPreference.identical,spec.identical);
          assert.equal(r.solver.matchingPreference.baselineImageError,spec.baseline);
          assert.ok(r.solver.matchingPreference.additionalImageError<=spec.allowance);
          assert.equal(r.solver.matchingPreference.maximumMatchingImageError,spec.baseline+spec.allowance);
          assert.equal(r.validation.passed,true);assert.equal(r.manufacturing.status,'pass');
          assert.equal(r.imageFidelity.features.passed,true);assert.equal(r.templateExportAllowed,true);
          assert.equal(r.imageFidelity.passed,spec.error<=spec.warning);
          assert.equal(r.warnings.some(w=>w.includes('above the')),spec.error>spec.warning);
          assert.equal(Boolean(r.stoppedEarly),method==='stopped');
          const exported=await renderExportedWeave(value.geometry,400),error=exported.mask.reduce((sum,v,i)=>sum+Number(v!==actual.mask[i]),0)/actual.mask.length;
          assert.equal(error,spec.error);assert.equal(r.imageError.mismatchFraction,error);
          row[method]={error,identical:r.solver.matchingPreference.identical,baseline:r.solver.matchingPreference.baselineImageError,additionalError:r.solver.matchingPreference.additionalImageError,warnings:r.warnings};
          await fs.writeFile(path.join(dir,method+'.json'),JSON.stringify(value,null,2));
          await fs.writeFile(path.join(dir,method+'.png'),exported.png);
        }
        assert.deepEqual(JSON.parse(actual.normal.geometry),JSON.parse(actual.stopped.geometry));
        assert.deepEqual(pageErrors,[]);row.passed=true;
      }catch(error){row.failure=error.stack;row.passed=false;process.exitCode=1;}
      await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(row));
    }
    await context.close();
  }finally{await browser.close();}
}

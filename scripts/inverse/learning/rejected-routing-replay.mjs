/** Diagnose continuous refinement of a frozen rejected MILP incumbent.
 * No candidate from this experiment is fed back into production search.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {prepare} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {curvesOf,loadSolutionJSON,solutionJSON} from '../../../static/inverse/core/graph.js';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../../static/inverse/core/direct/refine.js';
import {repairRejectedRouting} from '../../../static/inverse/core/direct/rejected-routing.js';
import {loadNumericalKernel} from '../../../static/inverse/core/numerical-kernel.js';
import {validate} from '../../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {auditEditablePaper} from '../editable-paper-audit.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.fixture||!args.output||Object.keys(args).some(k=>!['fixture','output','bounded'].includes(k))||(args.bounded!==undefined&&args.bounded!=='true'))throw new Error('Use --fixture=file.json --output=new-directory [--bounded=true]');
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(args.fixture),fixture=JSON.parse(bytes);
assert.equal(fixture.schema,'woven-heart-rejected-routing-fixture-1');
const n=fixture.resolution;assert.ok(Number.isInteger(n)&&n>=32&&n<=1000);
const mask=new Uint8Array(n*n);let end=0;
for(const [start,length]of fixture.maskRuns){
  assert.ok(Number.isInteger(start)&&Number.isInteger(length)&&start>=end&&length>0&&start+length<=mask.length);
  mask.fill(1,start,start+length);end=start+length;
}
assert.equal(hash(mask),fixture.maskSha256);
const raw={...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0},cfg=settings(raw),input=prepare({type:'mask',mask,resolution:n},raw).target;
assert.equal(hash(input.sourceImage.mask),fixture.maskSha256);
const probability=input.sourceImage.probability.slice();
await fs.mkdir(args.output,{recursive:false});
await loadNumericalKernel();
const report={schema:'woven-heart-rejected-routing-replay-1',status:'running',fixture:args.fixture,fixtureSha256:hash(bytes),maskSha256:hash(mask),configuration:cfg,refinement:args.bounded?'production bounded repair':fixture.refinement,
  scope:'Captured invalid routing seeds through unchanged continuous refinement and actual editable SVG conversion. Not a fresh solve, deployment, or claim about total solver time.',sourceHashes:{},rows:[]};
const sources=['scripts/inverse/learning/rejected-routing-replay.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/editable-paper-audit.mjs',
  'src/lib/inverse/toHeartDesign.ts','src/lib/inverse/conversionFidelity.ts','src/lib/inverse/simplifyCurves.ts','src/lib/utils/heartDesign.ts','src/lib/editor/curveIssues.ts','src/lib/paint/rasterize.ts',
  ...(await fs.readdir('static/inverse/core',{recursive:true})).filter(p=>p.endsWith('.js')).map(p=>'static/inverse/core/'+p)];
for(const file of sources)report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(args.output,'vite-cache'),server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
try{
  const {convertValidatedCutGeometry,convertCutGeometry}=await loader.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts');
  const {conversionFidelity}=await loader.ssrLoadModule('/src/lib/inverse/conversionFidelity.ts');
  const {serializeHeartToSVG,parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
  const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
  const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
  const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
  for(const seed of fixture.seeds){
    const proposal=loadSolutionJSON(seed.geometry),phase=proposal.graph.target.phase?-1:1;
    const graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width),initial=graph.solution(graph.points,phase,input);
    const row={smoothRadius:seed.smoothRadius,counts:graph.families.map(f=>f.length),before:{geometry:validate(initial,cfg),paper:materialAudit(initial,cfg)}};
    report.rows.push(row);assert.equal(row.before.geometry.passed,false,'The fixture must retain a rejected geometry.');
    const initialRender=await renderExportedWeave(seed.geometry,n);
    row.before.independentImageError=initialRender.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    await fs.writeFile(path.join(args.output,String(seed.smoothRadius)+'-initial.png'),initialRender.png);
    const started=performance.now();
    let solution;
    if(args.bounded){
      const repaired=repairRejectedRouting(initial,input,cfg);
      row.repair=repaired.report;row.steps=repaired.report.steps;row.history=repaired.report.history;
      solution=repaired.solution||initial;
    }else{
      const fitted=refineCurves(graph,input.sourceImage.probability,n,phase,cfg,{input,...fixture.refinement});
      row.steps=fitted.steps;row.history=fitted.history;solution=graph.solution(fitted.points,phase,input);
    }
    row.refinementSeconds=(performance.now()-started)/1000;
    const checkedCfg=verifiedPaperSettings(solution,cfg),geometry=solutionJSON(solution),render=await renderExportedWeave(geometry,n);
    row.after={geometry:validate(solution,checkedCfg),paper:materialAudit(solution,checkedCfg),features:auditFeatureFidelity(input.sourceImage,render.mask,cfg),
      independentImageError:render.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length};
    const prefix=String(seed.smoothRadius),serialized=JSON.stringify(geometry,null,2)+'\n';
    row.refinedGeometrySha256=hash(serialized);
    // Invalid outcomes remain named diagnostics; only a fully checked
    // conversion below receives an editable template SVG.
    await fs.writeFile(path.join(args.output,prefix+'-diagnostic.json'),serialized);
    await fs.writeFile(path.join(args.output,prefix+'-diagnostic.png'),render.png);
    row.enginePassed=(!args.bounded||row.repair.accepted)&&row.after.geometry.passed&&row.after.paper.passed&&row.after.features.passed&&row.after.independentImageError<=cfg.maxImageError;
    if(row.enginePassed){
      try{
        const reference={mask:{size:n,data:mask}},converted=convertValidatedCutGeometry(serialized,{name:fixture.caseId,enforce:{curve:'off',lobe:'off',lobes:'off'},reference});
        const svg=serializeHeartToSVG(converted.design),design=parseHeartFromSVG(svg,'repaired.svg');assert.ok(design);
        const overlap=inferOverlapRect(design.fingers,design.gridSize),issues=[...findFingersWithIssues(design.fingers,intersectionMarginPx(overlap))];
        const original=convertCutGeometry(serialized,{name:'original',tolerance:0,preserveShared:true,enforce:converted.honoured});
        const woven=rasterizeDesign(design,n).data,physical=auditEditablePaper(design,overlap,checkedCfg,{right:row.counts[0],left:row.counts[1]});
        row.editable={issues,fidelity:conversionFidelity(original.design,reference)(design),physical,features:auditFeatureFidelity(input.sourceImage,woven,cfg),
          imageError:woven.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length,tolerance:converted.editorValidation.tolerance};
        row.editablePassed=!issues.length&&row.editable.fidelity.passed&&physical.geometry.passed&&physical.paper?.status==='pass'&&row.editable.features.passed&&row.editable.imageError<=cfg.maxImageError;
        if(row.editablePassed)await fs.writeFile(path.join(args.output,prefix+'-editable.svg'),svg);
      }catch(error){row.editablePassed=false;row.editableError=error.message;}
    }
    assert.equal(hash(input.sourceImage.mask),fixture.maskSha256);assert.deepEqual(input.sourceImage.probability,probability);
    await save();console.log(JSON.stringify({radius:seed.smoothRadius,enginePassed:row.enginePassed,editablePassed:row.editablePassed||false,error:row.after.independentImageError,seconds:row.refinementSeconds}));
  }
  report.status='complete';await save();
  await fs.writeFile(path.join(args.output,'index.html'),'<!doctype html><meta charset="utf-8"><title>Rejected routing refinement</title><style>body{font:16px system-ui;margin:32px;background:#eee}section{background:white;padding:20px;margin:20px 0}img{width:320px;max-width:45vw}p{max-width:850px}</style><h1>Rejected routing refinement</h1><p>These are saved invalid MILP proposals, not ground-truth templates or fresh solver runs. Left: rejected initial route. Right: continuous refinement, or the original if bounded repair failed. Only independently checked outputs receive an editable SVG.</p>'+report.rows.map(r=>`<section><h2>Trace smoothing ${r.smoothRadius}</h2><p>Mask disagreement ${(100*r.before.independentImageError).toFixed(3)}% → ${(100*r.after.independentImageError).toFixed(3)}%. Engine checks: ${r.enginePassed?'pass':'fail'}. Editable SVG checks: ${r.editablePassed?'pass':'not accepted'}.</p><img src="${r.smoothRadius}-initial.png" alt="Rejected initial route"><img src="${r.smoothRadius}-diagnostic.png" alt="Refined diagnostic"></section>`).join(''));
}finally{await loader.close();dom.window.close();}

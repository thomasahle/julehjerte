/** Fresh corner-seed MILP routing followed by bounded clearance projection.
 * No saved cutting template enters this experiment. Not production scheduling. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {prepare,finish} from '../../../static/inverse/core/engine.js';
import {cornerBorderSeeds} from '../../../static/inverse/core/corner-border-seeds.js';
import {preprocessMask} from '../../../static/inverse/core/input.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET,MATCHING_GRID_PRESET} from '../../../static/inverse/core/presets.js';
import {buildGraph,curvesOf,solutionJSON} from '../../../static/inverse/core/graph.js';
import {solveBoundary} from '../../../static/inverse/core/routing.js';
import {CurveGraph} from '../../../static/inverse/core/direct/curves.js';
import {projectShortReturns} from '../../../static/inverse/core/direct/short-return-project.js';
import {fittingMargin,refineCurves} from '../../../static/inverse/core/direct/refine.js';
import {validate} from '../../../static/inverse/core/validate.js';
import {materialAudit} from '../../../static/inverse/core/material.js';
import {featureComponentMetrics,auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {auditEditablePaper} from '../editable-paper-audit.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.output||Object.keys(args).some(k=>!['output','seconds','refine-seconds'].includes(k)))throw new Error('Use --output=<new directory> [--seconds=20] [--refine-seconds=0]');
const seconds=Number(args.seconds??20),refineSeconds=Number(args['refine-seconds']??0);
if(!Number.isFinite(seconds)||seconds<=0||seconds>60)throw new RangeError('The routing budget must be in (0,60] seconds.');
if(!Number.isFinite(refineSeconds)||refineSeconds<0||refineSeconds>10)throw new RangeError('The optional refinement budget must be in [0,10] seconds.');
const hash=b=>createHash('sha256').update(b).digest('hex'),fixtureFile='scripts/inverse/fixtures/stacked-hearts-corner-mask.json';
const fixtureBytes=await fs.readFile(fixtureFile),fixture=JSON.parse(fixtureBytes),n=fixture.resolution,mask=new Uint8Array(n*n);
let at=0,value=fixture.first;
for(const run of fixture.runs){assert.ok(Number.isInteger(run)&&run>0&&at+run<=mask.length);mask.fill(value,at,at+run);at+=run;value^=1;}
assert.equal(at,mask.length);assert.equal(hash(mask),fixture.maskSha256);
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
const sourceHashes={};
for(const file of [fixtureFile,'scripts/inverse/diagnostics/corner-clearance-repair.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/editable-paper-audit.mjs',
  ...(await fs.readdir('static/inverse',{recursive:true})).filter(f=>/\.(js|wasm)$/.test(f)).map(f=>'static/inverse/'+f),
  ...(await fs.readdir('src/lib',{recursive:true})).filter(f=>f.endsWith('.ts')).map(f=>'src/lib/'+f)])sourceHashes[file]=hash(await fs.readFile(file));
const report={schema:'woven-heart-corner-clearance-repair-1',status:'running',fixtureSha256:hash(fixtureBytes),maskSha256:hash(mask),sourceHashes,
  scope:'One frozen photographic mask; fresh corner-seed routing with fixed 0.75 mm tracing tolerance, then at most five seconds of clearance projection and optional ordinary refinement. Original mask remains the reference. No pretrained cuts, production scheduling, or ten-second claim.',routingBudgetSeconds:seconds,refinementBudgetSeconds:refineSeconds,events:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();let loader=null;
try{
  const started=performance.now(),cfg=settings({...AUTOMATIC_PRESET,timeLimit:seconds,trials:0});report.settings=cfg;
  const input=prepare({type:'mask',mask,resolution:n},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
  assert.deepEqual(input.sourceImage.mask,mask);const probability=input.sourceImage.probability.slice();
  const seed=cornerBorderSeeds(mask,n,cfg.width,cfg.nominalWidth)[0];assert.ok(seed);report.seed=seed.metadata;
  const target=preprocessMask(seed.mask,n,{...cfg,fitTolerance:.75,maxSpan:30,smoothRadius:.3,snapRadius:.75,borderRadius:0,polygonal:false,mixedBoundaries:true},input.metadata.preprocessing);
  target.sourceImage=input.sourceImage;
  const graphCfg=settings({...cfg,...MATCHING_GRID_PRESET,maxTurn:cfg.maxTurn,localNeighborhoodFactor:cfg.localNeighborhoodFactor});
  const initialGraph=buildGraph({...target,curves:target.curves.slice()},graphCfg);let proposal=null;
  try{
    await solveBoundary(target,graphCfg,{initialGraph,expandNeighbors:false,coefficientQuantum:1e-7,stopAfterValidated:true,
      coreGate:s=>materialAudit(s,cfg),onProgress:e=>report.events.push(e),onRejectedCandidate:(candidate,timing)=>{proposal=candidate;report.captureTiming=timing;return true;}});
  }catch(error){report.routing=error.report;if(!proposal)throw error;assert.equal(error.report.termination,'rejected_candidate_observer');}
  assert.ok(proposal,'This replay expects a rejected integer candidate to repair.');
  report.routingSeconds=(performance.now()-started)/1000;report.initialGeometry=validate(proposal,cfg,{checkImage:false});
  const initialBytes=JSON.stringify(solutionJSON(proposal));report.initialGeometrySha256=hash(initialBytes);
  await fs.writeFile(path.join(args.output,'rejected.json'),initialBytes);
  const graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width),before=graph.points.slice(),phase=proposal.graph.target.phase?-1:1;
  const repairStart=performance.now(),projected=projectShortReturns(graph,before,phase,input,cfg,{initialAudit:report.initialGeometry,clearanceMargin:fittingMargin(cfg,cfg.width),maxIterations:128,maxMilliseconds:5000});
  report.repairSeconds=(performance.now()-repairStart)/1000;report.projection=projected.report;assert.deepEqual(graph.points,before);
  if(projected.points){
    const checkedCfg={...cfg,materialResolution:700};let solution=graph.solution(projected.points,phase,input);
    if(refineSeconds){
      const refinementStart=performance.now(),refinementGraph=new CurveGraph(graph.nested(projected.points),cfg.width);
      const refined=refineCurves(refinementGraph,input.sourceImage.probability,n,phase,checkedCfg,{input,steps:800,rate:.008,
        checkpointEvery:20,selection:'mask',skipRepeatedRollbacks:true,deadline:refinementStart+1000*refineSeconds});
      report.refinement={seconds:(performance.now()-refinementStart)/1000,steps:refined.steps,skippedSteps:refined.skippedSteps,history:refined.history};
      solution=refinementGraph.solution(refined.points,phase,input);
    }
    solution.report={algorithm:'diagnostic-clearance-projection',paperVerification:{requestedResolution:cfg.materialResolution,resolution:700},physicalAssemblyTested:false};
    const done=finish(solution,checkedCfg,()=>{},{refine:false});report.finish=done.report;
    report.fitAndFinishSeconds=(performance.now()-started)/1000;
    const geometry=done.files['cut_geometry.json'],rendered=await renderExportedWeave(geometry,n);
    for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg'])await fs.writeFile(path.join(args.output,name),done.files[name]);
    await fs.writeFile(path.join(args.output,'woven.png'),rendered.png);
    report.independentImageError=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    report.features=auditFeatureFidelity(input.sourceImage,rendered.mask,cfg);
    report.components=featureComponentMetrics(input.sourceImage,rendered.mask);
    const finer=await renderExportedWeave(geometry,2*n),finerMask=Uint8Array.from({length:4*n*n},(_,i)=>mask[Math.floor(Math.floor(i/(2*n))/2)*n+Math.floor(i%(2*n)/2)]);
    report.independentFiner={resolution:2*n,reference:'Each original mask cell repeated 2 x 2; no extra photo information.',
      imageError:finer.mask.reduce((sum,v,i)=>sum+Number(v!==finerMask[i]),0)/finerMask.length,components:featureComponentMetrics({mask:finerMask,resolution:2*n},finer.mask)};
    report.geometry=validate(solution,checkedCfg);report.paper=materialAudit(solution,checkedCfg).summary;
    report.enginePassed=done.report.templateChecksPassed&&report.independentImageError<=cfg.maxImageError&&report.features.passed&&report.paper.status==='pass';
    loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(args.output,'vite-cache'),server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
    const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
    const {convertValidatedCutGeometry,convertCutGeometry}=await loader.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts');
    const {conversionFidelity}=await loader.ssrLoadModule('/src/lib/inverse/conversionFidelity.ts');
    const {serializeHeartToSVG,parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
    const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
    const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
    const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
    try{
      const reference={mask:{size:n,data:mask}},converted=convertValidatedCutGeometry(geometry,{name:'stacked-hearts-clearance',enforce:{curve:'off',lobe:'off',lobes:'off'},reference});
      const svg=serializeHeartToSVG(converted.design),design=parseHeartFromSVG(svg,'repaired.svg');assert.ok(design);
      const overlap=inferOverlapRect(design.fingers,design.gridSize),issues=[...findFingersWithIssues(design.fingers,intersectionMarginPx(overlap))];
      const original=convertCutGeometry(geometry,{name:'original',tolerance:0,preserveShared:true,enforce:converted.honoured});
      const woven=rasterizeDesign(design,n).data,physical=auditEditablePaper(design,overlap,checkedCfg,{right:graph.families[0].length,left:graph.families[1].length});
      report.editable={issues,fidelity:conversionFidelity(original.design,reference)(design),physical,features:auditFeatureFidelity(input.sourceImage,woven,cfg),
        components:featureComponentMetrics(input.sourceImage,woven),imageError:woven.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length,tolerance:converted.editorValidation.tolerance};
      report.editablePassed=!issues.length&&report.editable.fidelity.passed&&physical.geometry.passed&&physical.paper?.status==='pass'&&report.editable.features.passed&&report.editable.imageError<=cfg.maxImageError;
      if(report.enginePassed&&report.editablePassed)await fs.writeFile(path.join(args.output,'editable.svg'),svg);
    }catch(error){report.editablePassed=false;report.editableError=error.stack;}
  }
  assert.deepEqual(input.sourceImage.mask,mask);assert.deepEqual(input.sourceImage.probability,probability);
  for(const [file,expected]of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),expected,file);
  report.status='complete';await save();
  console.log(JSON.stringify({routingSeconds:report.routingSeconds,repairSeconds:report.repairSeconds,fitAndFinishSeconds:report.fitAndFinishSeconds,projection:report.projection,enginePassed:report.enginePassed,editablePassed:report.editablePassed,error:report.independentImageError}));
}catch(error){report.status='failed';report.error=error.stack;await save();throw error;}
finally{await loader?.close();}

/** Replay bounded corner interpretations against the ORIGINAL classified mask.
 * This is an offline routing experiment, not a new production acceptance rule.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare,finish} from '../../../static/inverse/core/engine.js';
import {cornerBorderSeeds} from '../../../static/inverse/core/corner-border-seeds.js';
import {preprocessMask,sampleTarget} from '../../../static/inverse/core/input.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {reindex,inspectBoundaryEndpoints} from '../../../static/inverse/core/graph.js';
import {initializeTopology} from '../../../static/inverse/core/direct/topology.js';
import {featureComponentMetrics} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.output)throw new Error('Use --output=<new directory> [--fixture=<RLE mask JSON>] [--seconds=20]');
const seconds=Number(args.seconds??20);
if(!Number.isFinite(seconds)||seconds<=0||seconds>60)throw new Error('Each routing attempt needs 0 < seconds <= 60.');
const fixtureFile=args.fixture||'scripts/inverse/fixtures/stacked-hearts-corner-mask.json';
const hash=b=>createHash('sha256').update(b).digest('hex'),fixtureBytes=await fs.readFile(fixtureFile),fixture=JSON.parse(fixtureBytes);
const n=fixture.resolution;
assert.ok(Number.isInteger(n)&&n>=4&&n<=1024);assert.ok(fixture.first===0||fixture.first===1);
const mask=new Uint8Array(n*n);let offset=0,value=fixture.first;
for(const run of fixture.runs){assert.ok(Number.isInteger(run)&&run>0&&offset+run<=mask.length);mask.fill(value,offset,offset+run);offset+=run;value^=1;}
assert.equal(offset,mask.length);assert.equal(hash(mask),fixture.maskSha256);
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
const sourceHashes={};
for(const file of ['scripts/inverse/diagnostics/corner-fragment-routing.mjs','scripts/inverse/export-renderer.mjs',
  ...(await fs.readdir('static/inverse',{recursive:true})).filter(f=>/\.(js|wasm)$/.test(f)).map(f=>'static/inverse/'+f)])sourceHashes[file]=hash(await fs.readFile(file));
const report={schema:'woven-heart-corner-fragment-routing-1',status:'running',sourceHashes,
  fixture:fixtureFile,fixtureSha256:hash(fixtureBytes),maskSha256:hash(mask),secondsPerAttempt:seconds,
  scope:'One image-derived corner seed, three fixed tracing tolerances. Original mask, image-error ceiling and geometry/paper gates unchanged. Balanced endpoint counts are not a successful reconstruction. No runtime integration.',runs:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
  const cfg=settings({...AUTOMATIC_PRESET,timeLimit:seconds,trials:0});
  const input=prepare({type:'mask',mask,resolution:n},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
  assert.deepEqual(input.sourceImage.mask,mask);
  const seeds=cornerBorderSeeds(mask,n,cfg.width,cfg.nominalWidth);
  report.proposals=seeds.map(s=>s.metadata);
  // Rank only by the change from the photographed mask; no saved cuts,
  // ground-truth templates or downstream solver scores choose the seed.
  const seed=seeds[0];
  if(seed)for(const tolerance of [.5,.75,1]){
    const row={tolerance,events:[]};report.runs.push(row);const started=performance.now();
    const target=preprocessMask(seed.mask,n,{...cfg,fitTolerance:tolerance,maxSpan:30,smoothRadius:.3,
      snapRadius:.75,borderRadius:0,polygonal:false,mixedBoundaries:true},input.metadata.preprocessing);
    target.sourceImage=input.sourceImage;row.curves=target.curves.length;
    row.endpointIssue=inspectBoundaryEndpoints(reindex({target,edges:target.curves.map(curve=>({curve,visible:true}))}),cfg.nominalWidth).issue??null;
    const sampled=sampleTarget(target,n);
    row.traceError=sampled.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    if(!row.endpointIssue&&row.traceError<=cfg.maxImageError){
      const routed=await initializeTopology({...input,boundarySeed:target},cfg,{maximumError:cfg.maxImageError,seconds,onProgress:e=>row.events.push(e)});
      row.routing=routed.report;
      if(routed.graph){
        const solution=routed.graph.solution(routed.graph.points,routed.phase,input);
        solution.report={...routed.report,algorithm:'diagnostic-corner-routing'};
        const done=finish(solution,cfg,()=>{},{refine:false});row.report=done.report;
        const directory=path.join(args.output,'tolerance-'+tolerance);await fs.mkdir(directory);
        for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg'])await fs.writeFile(path.join(directory,name),done.files[name]);
        const rendered=await renderExportedWeave(done.files['cut_geometry.json'],n);
        await fs.writeFile(path.join(directory,'woven.png'),rendered.png);
        row.independentImageError=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
        row.components=featureComponentMetrics(input.sourceImage,rendered.mask,cfg.width);
        row.currentChecksPassed=done.report.templateChecksPassed&&row.independentImageError<=cfg.maxImageError;
        row.allSourceComponentsEnclosed=row.components.every(f=>f.intersectionPixels>0&&f.touchesBorder===false);
      }
    }
    row.seconds=(performance.now()-started)/1000;await save();
    console.log(JSON.stringify({tolerance,seconds:row.seconds,traceError:row.traceError,endpointIssue:row.endpointIssue,
      routingAccepted:row.routing?.accepted??false,currentChecksPassed:row.currentChecksPassed??false,allSourceComponentsEnclosed:row.allSourceComponentsEnclosed??null}));
  }
  assert.deepEqual(input.sourceImage.mask,mask);
  for(const [file,expected]of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),expected,file);
  report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.stack;await save();throw error;}

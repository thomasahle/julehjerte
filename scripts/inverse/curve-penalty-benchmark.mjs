/** Compare the actual previous curve-quality penalty with the current source.
 * Fixed geometries exercise numerical equivalence; fresh solves are separate.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {cpus} from 'node:os';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {settings} from '../../static/inverse/core/settings.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {curvesOf,loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {fixture} from './fixtures.mjs';

const reference=execFileSync('git',['rev-parse','--verify','--end-of-options',(process.env.INVERSE_PENALTY_REFERENCE||'55701b7')+'^{commit}'],{encoding:'utf8'}).trim();
const source='static/inverse/core/direct/refine.js',candidateFile=process.env.INVERSE_PENALTY_CANDIDATE||source;
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232',output=process.env.INVERSE_TEST_OUTPUT||'tmp/curve-penalty-benchmark';
const names=(process.env.INVERSE_TEST_BROWSERS||'node,chromium,firefox,webkit').split(',');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const previousSource=execFileSync('git',['show',`${reference}:${source}`],{encoding:'utf8'}),currentSource=await fs.readFile(candidateFile,'utf8'),dependencies={};
for(const file of execFileSync('git',['ls-tree','-r','--name-only',reference,'--','static/inverse/core'],{encoding:'utf8'}).trim().split('\n')){
  if(file===source)continue;
  const bytes=await fs.readFile(file);dependencies[file]=hash(bytes);
  assert.equal(hash(execFileSync('git',['show',`${reference}:${file}`])),dependencies[file],`Unchanged dependency ${file}`);
}
const asGraph=s=>new CurveGraph(s.paths.map((family,f)=>family.map((_,i)=>curvesOf(s,f,i).map(c=>c.p))),s.graph.target.width);
const line=(a,b)=>Cubic.line(a,b).p,shared=[[25,25],[25,48],[60,42],[75,75]];
const cases=[
  ...[[3,8],[8,8],[8,16]].map(([n,k])=>({id:`grid-${n}-${k}`,graph:new CurveGraph(gridPaths(gridModel([n,n],k,17)))})),
  ...['hidden-corner','thin','neck'].map(id=>({id,graph:asGraph(fixture(id))})),
  {id:'hat',graph:asGraph(loadSolutionJSON(JSON.parse(await fs.readFile('scripts/inverse/fixtures/free-border-hat.json')).geometry))},
  {id:'reversed-shared',graph:new CurveGraph([[[line([25,0],[25,25]),shared,line([75,75],[75,100])]],[[line([0,75],[75,75]),shared.toReversed(),line([25,25],[100,25])]]])},
  {id:'collapsed-handles',graph:new CurveGraph([[[[[20,0],[20,0],[20,40],[20,40]],[[20,40],[20,40],[21,100],[21,100]]],[line([22,0],[22,100])]],[[line([0,50],[100,50])]]])},
  {id:'outside-tiles',graph:new CurveGraph([[[[[-30,0],[-15,40],[110,60],[120,100]]]],[ [line([0,-10],[100,120])] ]])}
].map(({id,graph})=>({id,width:graph.width,paths:graph.nested()}));
const variants=[
  {id:'default',settings:{minWidth:2,materialResolution:360},separationWeight:12},
  {id:'wide-clearance',settings:{minWidth:4,materialResolution:80},separationWeight:80},
  {id:'no-separation',settings:{minWidth:1,localNeighborhoodFactor:3},separationWeight:0}
];

// Runs unchanged in Node and in each browser, including all assertions. Input
// construction, warmups, equality checks and serialization are outside timers.
function runCase(entry,variant,cfg,current,previous,CurveGraph){
  const graph=new CurveGraph(entry.paths,entry.width),options={separationWeight:variant.separationWeight};
  const original=graph.points.slice(),points=original.slice(),results=[];
  const equal=(a,b,label)=>{
    if(a.length!==b.length)throw new Error(label+': length');
    for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))throw new Error(`${label}: coordinate ${i}`);
  };
  // Reuse and mutate the same point buffer; geometry-dependent caches must not
  // reuse positions or gradients from the previous call.
  let prior=null;
  for(const [position,offset]of [['original',0],['moved',.3],['moved-again',-.7]]){
    for(let i=0;i<points.length;i++)points[i]=original[i]+offset*Math.sin(i*17.3);
    const saved=points.slice(),expected=previous.curvePenalty(graph,points,cfg,options),runs=[],warmupMilliseconds={},calibrationMilliseconds={};
    let evaluations=0;
    const check=value=>{
      if(!Object.is(value.loss,expected.loss)||!Object.is(value.minRadius,expected.minRadius))throw new Error(entry.id+': scalar penalty differs');
      equal(value.gradient,expected.gradient,entry.id+': gradient');
      equal(points,saved,'Input points changed');equal(graph.points,original,'Original graph changed');
      if(prior){equal(prior.value.gradient,prior.snapshot,'Previously returned gradient changed');if(value.gradient===prior.value.gradient)throw new Error('Returned gradient buffer was reused');}
      prior={value,snapshot:value.gradient.slice()};evaluations++;
    };
    check(current.curvePenalty(graph,points,cfg,options));
    const timed=variant.id==='default'&&position!=='moved-again';
    let repetitions=0;
    if(timed){
      const batch=(policy,count)=>{
        const values=[],fn=(policy==='current'?current:previous).curvePenalty,start=performance.now();
        for(let i=0;i<count;i++)values.push(fn(graph,points,cfg,options));
        const milliseconds=performance.now()-start;
        for(const value of values)check(value);
        return milliseconds;
      };
      for(const policy of ['previous','current'])warmupMilliseconds[policy]=batch(policy,256);
      for(const policy of ['current','previous'])calibrationMilliseconds[policy]=batch(policy,48);
      // Small fixtures otherwise take just 1–2 browser-clock ticks per batch.
      // Use the same batch size for both implementations, sized for the faster.
      repetitions=Math.min(1024,Math.max(48,48*Math.ceil(20/Math.max(.25,Math.min(...Object.values(calibrationMilliseconds))))));
      for(let round=0;round<6;round++){
        const times={};
        for(const policy of round%2?['current','previous']:['previous','current']){
          times[policy]=batch(policy,repetitions)/repetitions;
        }runs.push(times);
      }
    }
    results.push({position,identical:true,evaluations,gradientCoordinates:expected.gradient.length,loss:expected.loss,minRadius:Number.isFinite(expected.minRadius)?expected.minRadius:'Infinity',warmupMilliseconds,calibrationMilliseconds,repetitions,runs});
  }
  return results;
}

await fs.mkdir(output,{recursive:true});
const report={reference,candidateFile,previousSha256:hash(previousSource),currentSha256:hash(currentSource),dependencies,harnessSha256:hash(await fs.readFile('scripts/inverse/curve-penalty-benchmark.mjs')),cpu:cpus()[0]?.model,
  method:'Ten fixed graphs, three clearance configurations and three consecutive in-place point perturbations. The loss, minimum radius and every gradient coordinate must match the original source with Object.is. Input and previously returned output ownership are checked too. Default/original and default/moved rows have 256 warmup calls and 48 calibration calls per implementation, recorded separately. Six alternating-order timed rounds use equal-sized batches estimated to take at least 20 ms in the faster implementation, bounded to 48–1024 calls. Times are milliseconds per call; comparisons, fixture construction and imports are outside timers. These are routine timings, not complete solver speed measurements.',
  cases:cases.map(({paths,...c})=>({...c,geometrySha256:hash(JSON.stringify(paths))})),results:[]};
const append=async row=>{report.results.push(row);await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({browser:row.browser,id:row.id,variant:row.variant,identical:row.positions.every(p=>p.identical)}));};
const rewritten=(body,base)=>body.replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,base).href}'`);
for(const name of names){
  if(name==='node'){
    const base=pathToFileURL(path.resolve(source));
    const [current,previous]=await Promise.all([currentSource,previousSource].map(body=>import('data:text/javascript;base64,'+Buffer.from(rewritten(body,base)).toString('base64'))));
    for(const entry of cases)for(const variant of variants)await append({browser:name,version:process.version,id:entry.id,variant:variant.id,positions:runCase(entry,variant,settings({trials:0,width:entry.width,...variant.settings}),current,previous,CurveGraph)});
    continue;
  }
  // The candidate module is served explicitly so a prototype can be measured
  // before changing production. Its unchanged dependencies must match too.
  for(const [file,sha]of Object.entries(dependencies)){
    const response=await fetch(origin+'/'+file.replace(/^static\//,''));assert.equal(response.status,200,file);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())),sha,`Served dependency ${file}`);
  }
  const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await browsers[name].launch({headless:true}),context=await browser.newContext();
  const pageURL=origin+'/inverse/qa-penalty.html',base=origin+'/inverse/core/direct/refine.js',urls={current:origin+'/inverse/qa-penalty-current.js',previous:origin+'/inverse/qa-penalty-previous.js'};
  try{
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url===pageURL)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Curve penalty comparison</title>'});
      if(url===urls.current||url===urls.previous)return route.fulfill({contentType:'text/javascript',body:rewritten(url===urls.current?currentSource:previousSource,base)});
      return new URL(url).origin===new URL(origin).origin?route.continue():route.abort();
    });
    const page=await context.newPage();await page.goto(pageURL);
    await page.evaluate(async({urls,origin,run})=>{
      const [current,previous,curves]=await Promise.all([import(urls.current),import(urls.previous),import(origin+'/inverse/core/direct/curves.js')]);
      window.penaltyBench={current,previous,CurveGraph:curves.CurveGraph,run:eval('('+run+')')};
    },{urls,origin,run:runCase.toString()});
    for(const entry of cases)for(const variant of variants){
      const positions=await page.evaluate(({entry,variant,cfg})=>{const b=window.penaltyBench;return b.run(entry,variant,cfg,b.current,b.previous,b.CurveGraph);},{entry,variant,cfg:settings({trials:0,width:entry.width,...variant.settings})});
      await append({browser:name,version:browser.version(),id:entry.id,variant:variant.id,positions});
    }
  }finally{await context.close();await browser.close();}
}

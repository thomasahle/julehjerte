/** Fixed-input browser comparison of every initialized count/phase candidate.
 * Uses original source modules for the baseline, not a second current caller.
 */
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {settings} from '../../static/inverse/core/settings.js';
import {initializationMask,sourceWeights} from '../../static/inverse/core/image-reference.js';
import {borderEvidence,countHypotheses} from '../../static/inverse/core/direct/counts.js';
import {orbitObjective,orbitMean,symmetryOrbit} from '../../static/inverse/core/direct/symmetry.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';

const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const root=process.env.INVERSE_GRID_INPUT||'tmp/lp-topology-browser';
const output=process.env.INVERSE_TEST_OUTPUT||'tmp/grid-parity-browser';
const reference=process.env.INVERSE_GRID_REFERENCE||'950dd23';
const names=(process.env.INVERSE_TEST_BROWSERS||'firefox,chromium,webkit').split(',');
const cases=(process.env.INVERSE_TEST_CASES||'house-free-small,hat-free-small,top-hat,top-hat-independent,hat-free,house-free').split(',');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const show=file=>execFileSync('git',['show',`${reference}:${file}`],{maxBuffer:16*1024*1024});
const sourceHashes={},previousSourceHashes={},sources={current:{},previous:{}};
const files=execFileSync('git',['ls-tree','-r','--name-only',reference,'--','static/inverse/core'],{encoding:'utf8'}).trim().split('\n');
for(const file of files){
  const current=await fs.readFile(file),previous=show(file);sourceHashes[file]=hash(current);previousSourceHashes[file]=hash(previous);
  if(!['static/inverse/core/direct/grid.js','static/inverse/core/direct/initialize.js'].includes(file))assert.equal(hash(current),hash(previous),`Unchanged dependency ${file}`);
  if(['grid.js','initialize.js','counts.js'].some(name=>file===`static/inverse/core/direct/${name}`)){sources.current[file.split('/').at(-1)]=current.toString();sources.previous[file.split('/').at(-1)]=previous.toString();}
}
const inputs=[];
for(const name of cases){
  const file=`${root}/firefox-${name}/prepared.json`,prepared=JSON.parse(await fs.readFile(file)),report=JSON.parse(await fs.readFile(`${root}/firefox-${name}/engine-report.json`));
  const source={resolution:prepared.resolution,mask:Uint8Array.from(prepared.mask),probability:Float32Array.from(prepared.mask),weights:Float64Array.from(prepared.weights)},cfg=settings(report.settings);
  const weights=sourceWeights(source),orbit=symmetryOrbit(cfg.symmetry),full=orbitObjective(source.probability,source.resolution,orbit,weights),n=Math.min(256,source.resolution),small=resizeObjective(full.probability,source.resolution,n,full.weights),rawGuide=Float64Array.from(initializationMask(source)),guideProb=orbit?orbitMean(rawGuide,source.resolution,orbit):rawGuide,evidence=borderEvidence(guideProb,source.resolution);
  inputs.push({name,sourceSha256:hash(await fs.readFile(file)),context:{options:countHypotheses({prob:small.probability,n,cfg,evidence,weights:small.weights}),fullProb:Array.from(full.probability),resolution:source.resolution,prob:Array.from(small.probability),n,evidence,weights:small.weights&&Array.from(small.weights),fullWeights:full.weights&&Array.from(full.weights),guideProb:Array.from(guideProb)}});
}
const report={reference,sourceHashes,previousSourceHashes,harnessSha256:hash(await fs.readFile('scripts/inverse/grid-parity-browser-benchmark.mjs')),method:'Six actual uploaded masks. Both engines receive every original count/phase option with unlimited initialization deadlines. Independent source snapshots, warmup and three alternating-order timed rounds per image. Seed coordinates, errors, order, rounds and termination reasons must match exactly. Every selected seed mask is also compared pixel for pixel with the old exhaustive grid renderer. Initialization times exclude imports, input reconstruction, comparisons and hashing.',results:[]};
await fs.mkdir(output,{recursive:true});
const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
for(const name of names){
  const browser=await browsers[name].launch({headless:true}),context=await browser.newContext(),pageURL=origin+'/inverse/qa-grid-parity.html';
  try{
    await context.route('**/*',route=>route.request().url()===pageURL?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Ordered grid comparison</title>'}):new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
    const page=await context.newPage();await page.goto(pageURL);
    await page.evaluate(async({sources,origin})=>{
      window.gridReplay={};
      for(const [policy,source]of Object.entries(sources)){
        const urls={};
        for(const file of['grid.js','initialize.js','counts.js']){
          const body=source[file].replace(/from '(\.[^']+)'/g,(_,path)=>`from '${urls[path.slice(2)]||new URL(path,origin+'/inverse/core/direct/'+file).href}'`);
          urls[file]=URL.createObjectURL(new Blob([body],{type:'text/javascript'}));
        }
        const [grid,counts]=await Promise.all([import(urls['grid.js']),import(urls['counts.js'])]);window.gridReplay[policy]={grid,counts};
      }
    },{sources,origin});
    for(const input of inputs){
      const row=await page.evaluate(async({name,context:raw})=>{
        const input={...raw};for(const key of['fullProb','prob','weights','fullWeights','guideProb'])if(input[key])input[key]=Float64Array.from(input[key]);
        const previous=window.gridReplay.previous,current=window.gridReplay.current;
        const run=policy=>window.gridReplay[policy].counts.initializeCounts(input).seeds;
        const expected=run('previous');
        const metadata=seeds=>seeds.map(s=>({counts:s.model.counts,k:s.model.k,phase:s.phase,floor:s.floor,error:s.error,rounds:s.initializationRounds,terminations:s.initializationTerminations,seedKind:s.seedKind}));
        const check=actual=>{
          if(JSON.stringify(metadata(actual))!==JSON.stringify(metadata(expected)))throw new Error(name+': seed metadata differs');
          for(let i=0;i<actual.length;i++)if(actual[i].model.z.length!==expected[i].model.z.length||actual[i].model.z.some((v,j)=>!Object.is(v,expected[i].model.z[j])))throw new Error(name+': seed controls differ');
        };
        check(run('current'));
        let maskPixels=0;
        for(const seed of expected){
          const a=current.grid.gridMask(seed.model,input.resolution,seed.phase,seed.floor),b=previous.grid.gridMask(seed.model,input.resolution,seed.phase,seed.floor);
          if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw new Error(name+': seed mask differs');maskPixels+=a.length;
        }
        const runs=[];
        for(let round=0;round<3;round++){
          const times={};
          for(const policy of round%2?['current','previous']:['previous','current']){const start=performance.now(),seeds=run(policy);times[policy]=performance.now()-start;check(seeds);}
          runs.push(times);
        }
        const bytes=Float64Array.from(expected.flatMap(s=>Array.from(s.model.z))).buffer;
        const coordinateSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
        return{identical:true,seeds:metadata(expected),maskPixels,coordinateSha256,runs};
      },input);
      report.results.push({browser:name,version:browser.version(),name:input.name,sourceSha256:input.sourceSha256,...row});
      console.log(JSON.stringify({browser:name,name:input.name,identical:row.identical,runs:row.runs}));await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2)+'\n');
    }
  }finally{await context.close();await browser.close();}
}

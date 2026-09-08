/** Replay identical photographed masks through real browser model construction. */
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../static/inverse/core/engine.js';
import {preprocessMask} from '../../static/inverse/core/input.js';
import {buildGraph} from '../../static/inverse/core/graph.js';
import {formulate} from '../../static/inverse/core/solver.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../src/lib/inverse/presets.js';
import assert from 'node:assert/strict';
const {firefox,chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:4173';
const output=`tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g,'-')}-models`;await fs.mkdir(output,{recursive:true});const results=[];
const source=process.env.INVERSE_HUNODAN_CASES;if(!source)throw new Error('Set INVERSE_HUNODAN_CASES to the photograph corpus cases.json');
const entry=JSON.parse(await fs.readFile(source)).cases.find(c=>c.id==='hjfig-05'), im=await loadImage(entry.photoFile),c=createCanvas(im.width,im.height),cx=c.getContext('2d');cx.drawImage(im,0,0);
const cfg=settings({...DIRECT_PRESET,trials:0}),target=prepare({type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba:cx.getImageData(0,0,c.width,c.height).data,quad:entry.crop.candidates[0].quad},DIRECT_PRESET).target;
const spec={mask:Array.from(target.sourceImage.mask),n:target.sourceImage.resolution,cfg};
const graph=buildGraph(preprocessMask(target.sourceImage.mask,spec.n,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius:.3,snapRadius:1.5,maxSpan:30,borderRadius:3}),cfg), form=formulate(graph,cfg), baseline=JSON.parse(JSON.stringify({points:graph.edges.map(e=>e.curve.p),model:form.m}));form.m.canonicalize(1e-7);const canonical=JSON.parse(JSON.stringify(form.m));

for(const [name,engine]of Object.entries({firefox,chromium,webkit})){
 const b=await engine.launch();try{const page=await b.newPage();await page.goto(`${origin}/en/generate/`);
 const data=await page.evaluate(async({mask,n,cfg})=>{
 const {preprocessMask}=await import('/inverse/core/input.js'),{buildGraph}=await import('/inverse/core/graph.js'),{formulate}=await import('/inverse/core/solver.js');
 const graph=buildGraph(preprocessMask(Uint8Array.from(mask),n,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius:.3,snapRadius:1.5,maxSpan:30,borderRadius:3}),cfg),form=formulate(graph,cfg);const result=JSON.parse(JSON.stringify({points:graph.edges.map(e=>e.curve.p),model:form.m}));form.m.canonicalize(1e-7);return{...result,canonical:JSON.parse(JSON.stringify(form.m))};
 },spec);
 assert.deepEqual(data.canonical,canonical,`${name}: canonical MILP differs from Node`);
 function diffs(a,b,path='',out=[]){if(typeof a==='number'){if(a!==b)out.push({path,a,b,delta:a-b});}else if(a&&typeof a==='object')for(const k of Object.keys(a))diffs(a[k],b[k],path+'.'+k,out);return out;}
 const d=diffs(baseline,data);const r={browser:name,rawScalarDifferences:d.length,maximumRawDifference:Math.max(0,...d.map(d=>Math.abs(d.delta))),canonicalModelMatchesNode:true,coefficientQuantum:1e-7};results.push(r);console.log(r);
 }finally{await b.close();}
}

await fs.writeFile(`${output}/results.json`,JSON.stringify({source:process.env.INVERSE_HUNODAN_CASES,case:entry.id,origin,results},null,2));console.log(output);

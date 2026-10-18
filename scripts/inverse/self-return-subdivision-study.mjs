/** Offline representation audit: no source images or fitted templates change. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Cubic,distance} from '../../static/inverse/core/bezier.js';
import {curvesOf,loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {shortSelfReturns} from '../../static/inverse/core/self-returns.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {experimentalSelfReturns} from './diagnostics/self-return-candidate.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const line=(a,b)=>Cubic.line(a,b).p;
const pathsOf=solution=>solution.paths.map((f,k)=>f.map((_,s)=>curvesOf(solution,k,s).map(c=>c.p)));
export const diagnosticSubdivisions={original:[0,1],halves:[0,.5,1],thirds:[0,1/3,2/3,1],unequal:[0,.17,.61,1]};

export async function returnDiagnosticCases(){
  const cfg=settings(AUTOMATIC_PRESET),cases=[];
  for(const name of ['gift','anchor']){
    const file=`scripts/inverse/fixtures/editor-${name}-return.json`,bytes=await fs.readFile(file),geometry=JSON.parse(bytes);
    cases.push({name,paths:pathsOf(loadSolutionJSON({...geometry,schema:'heartcurves-2',units:'mm'})),cfg,expectedShortReturn:true,file,sha256:hash(bytes)});
  }
  for(const [name,filename]of [['bird','editable-subdivision-return.json'],['gift','editable-gift-subdivision-return.json'],['turning-bird','editable-turning-bird-return.json']]){
    const file='scripts/inverse/fixtures/'+filename,bytes=await fs.readFile(file),fixture=JSON.parse(bytes);
    cases.push({name:`editable-${name}-return`,paths:[[],[fixture.path]],cfg:fixture.settings,expectedShortReturn:true,file,sha256:hash(bytes)});
  }
  const file='scripts/inverse/fixtures/photographic-subdivision-bend.json',bytes=await fs.readFile(file),fixture=JSON.parse(bytes);
  const detail=fixture.original.flatMap((points,i)=>{
    const curve=new Cubic(points),knots=fixture.knots[i];
    return knots.slice(1).map((hi,j)=>curve.subcurve(knots[j],hi).p);
  });
  for(const [name,slit]of Object.entries({original:fixture.original,detailed:detail})){
    cases.push({name:'photographic-'+name,paths:[[],[slit]],cfg,expectedShortReturn:null,file,sha256:hash(bytes)});
  }
  for(const angle of [90,45,30]){
    const radians=angle*Math.PI/180,end=[50+10*Math.sin(radians),50-10*Math.cos(radians)];
    const points=[[50,0],[50,50],end,[80,end[1]],[80,100]];
    cases.push({name:`bend-${angle}`,paths:[[points.slice(1).map((p,i)=>line(points[i],p))],[[line([0,80],[100,80])]]],cfg,expectedShortReturn:false});
  }
  for(const gap of [1,2]){
    const middle=[[50,48],[53,48],[53,48+gap],[50,48+gap]];
    cases.push({name:`curved-return-${gap}`,paths:[[[line([50,0],middle[0]),middle,line(middle[3],[50,100])]],[[line([0,80],[100,80])]]],cfg,expectedShortReturn:gap<1.5});
  }
  return cases;
}

export function subdivideDiagnosticPaths(paths,knots,reflect=false,width=100){
  let maximumGeometryDifference=0;
  const transformed=paths.map(f=>f.map(p=>p.flatMap(points=>{
    const curve=new Cubic(points);
    return knots.slice(1).map((hi,i)=>{
      const lo=knots[i],part=curve.subcurve(lo,hi);
      for(let j=0;j<=16;j++)maximumGeometryDifference=Math.max(maximumGeometryDifference,distance(curve.point(lo+(hi-lo)*j/16),part.point(j/16)));
      return part.p.map(([x,y])=>[reflect?width-x:x,y]);
    });
  })));
  if(reflect)transformed[1]=transformed[1].map(p=>p.reverse().map(c=>c.reverse()));
  return{paths:transformed,maximumGeometryDifference};
}

async function run(args){
  if(!args.output)throw new Error('Use --output=<new directory> and optionally --corpus=<saved release directory>');
  const cases=await returnDiagnosticCases();
  if(args.corpus)for(const group of ['hunodan','photos']){
    const directory=path.join(args.corpus,group);
    for(const name of (await fs.readdir(directory,{recursive:true})).sort()){
      if(!name.endsWith('/cut_geometry.json'))continue;
      const file=path.join(directory,name),bytes=await fs.readFile(file),geometry=JSON.parse(bytes);
      const report=JSON.parse(await fs.readFile(path.join(path.dirname(file),'report.json')));
      cases.push({name:`${group}/${name.split('/')[0]}`,paths:pathsOf(loadSolutionJSON({...geometry,schema:'heartcurves-2',units:'mm'})),cfg:report.settings,file,sha256:hash(bytes),templateChecksPassed:report.templateChecksPassed,expectedShortReturn:null});
    }
  }
  await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
  const rows=[];
  for(const entry of cases){
    const original=JSON.stringify(entry.paths);
    for(const [representation,knots]of Object.entries(diagnosticSubdivisions))for(const reflect of [false,true]){
      const transformed=subdivideDiagnosticPaths(entry.paths,knots,reflect,entry.cfg.width),model=new CurveGraph(transformed.paths,entry.cfg.width),solution=model.solution(model.points,1);
      const at=performance.now(),baseline=shortSelfReturns(solution,entry.cfg),baselineMs=performance.now()-at,start=performance.now(),candidate=experimentalSelfReturns(solution,entry.cfg),candidateMs=performance.now()-start;
      rows.push({name:entry.name,file:entry.file,sha256:entry.sha256,templateChecksPassed:entry.templateChecksPassed,expectedShortReturn:entry.expectedShortReturn,representation,reflect,maximumGeometryDifference:transformed.maximumGeometryDifference,baseline,candidate,baselineMs,candidateMs});
    }
    if(JSON.stringify(entry.paths)!==original)throw new Error('Input paths mutated: '+entry.name);
    console.log(entry.name,JSON.stringify(rows.slice(-8).map(r=>[r.baseline.length,r.candidate.length])));
  }
  const sourceHashes={};
  for(const file of ['scripts/inverse/self-return-subdivision-study.mjs','scripts/inverse/diagnostics/self-return-candidate.mjs','static/inverse/core/self-returns.js','static/inverse/core/bezier.js'])sourceHashes[file]=hash(await fs.readFile(file));
  const record={scope:'Saved and analytic geometry, exact de Casteljau subdivisions and reflection. No refitting, source-mask changes or production validation changes. The experimental stationary/turning predicate is not a complete clearance proof.',sourceHashes,rows};
  await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify(record,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
  await run(args);
}

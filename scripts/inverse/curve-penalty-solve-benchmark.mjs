/** Alternating fresh-process full fits to separate routine speed from total cost. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {cpus} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture,topHatFixture} from './motif-fixture.mjs';
import {shapeCells} from '../../src/lib/paint/frame.ts';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {renderExportedWeave} from './export-renderer.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv[2]==='--worker'){
  const [engineFile,inputFile,output]=process.argv.slice(3),{prepare,design}=await import(pathToFileURL(engineFile).href),raw=JSON.parse(await fs.readFile(inputFile));
  const input={type:'mask',resolution:raw.resolution,mask:Uint8Array.from(raw.mask),weights:Float64Array.from(raw.weights)},cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0};
  const cpuStart=process.cpuUsage(),start=performance.now(),prepared=prepare(input,cfg),answer=await design(prepared.target,cfg),seconds=(performance.now()-start)/1000,cpu=process.cpuUsage(cpuStart);
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],raw.resolution),error=referenceError(input,woven.mask).mismatchFraction;
  const row={seconds,cpuSeconds:(cpu.user+cpu.system)/1e6,error,templateChecksPassed:answer.report.templateChecksPassed,geometryPassed:answer.report.validation.passed,paper:answer.report.manufacturing.status,counts:answer.report.slits,geometrySha256:hash(answer.files['cut_geometry.json']),inputSha256:hash(await fs.readFile(inputFile))};
  assert.ok(row.templateChecksPassed&&row.geometryPassed&&row.paper==='pass'&&error<=.03&&seconds<=10,JSON.stringify(row));
  await fs.writeFile(output,JSON.stringify(row,null,2)+'\n');
}else{
  const output=path.resolve(process.env.INVERSE_TEST_OUTPUT||'tmp/curve-penalty-paired'),reference=execFileSync('git',['rev-parse','--verify','--end-of-options',(process.env.INVERSE_PENALTY_REFERENCE||'55701b7')+'^{commit}'],{encoding:'utf8'}).trim();
  await fs.mkdir(output,{recursive:true});assert.equal((await fs.readdir(output)).length,0,'Use an empty output directory; preserve previous measurements.');
  const sources={current:{},previous:{}},files=execFileSync('git',['ls-files','static/inverse/core'],{encoding:'utf8'}).trim().split('\n');
  for(const file of files){const current=await fs.readFile(file),previous=execFileSync('git',['show',`${reference}:${file}`]);sources.current[file]=hash(current);sources.previous[file]=hash(previous);if(!file.endsWith('/direct/refine.js'))assert.deepEqual(current,previous,file);}
  for(const policy of ['current','previous']){
    const root=path.join(output,policy);await fs.mkdir(root);await fs.cp('static/inverse/core',path.join(root,'core'),{recursive:true});await fs.symlink(path.resolve('static/inverse/vendor'),path.join(root,'vendor'),'dir');
    if(policy==='previous')await fs.writeFile(path.join(root,'core/direct/refine.js'),execFileSync('git',['show',`${reference}:static/inverse/core/direct/refine.js`]));
    for(const file of files)assert.equal(hash(await fs.readFile(path.join(root,file.replace('static/inverse/','')))),sources[policy][file],file);
  }
  const cases=[];
  for(const [shape,size]of [['top-hat',.84],['house',.84],['circle',.84],['top-hat',.64]]){
    const n=200,image=shape==='top-hat'?topHatFixture(n):motifFixture(shape,{n}).original,c=createCanvas(n,n),ctx=c.getContext('2d');ctx.drawImage(await loadImage(image),0,0);
    const rgba=ctx.getImageData(0,0,n,n).data,mask=Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128)),weights=Array.from(shapeCells({mode:'free',shape:'diamond',size},n)),id=`${shape}-${size}`,input=path.join(output,id+'.json');
    await fs.writeFile(input,JSON.stringify({resolution:n,mask,weights}));cases.push({id,input,inputSha256:hash(await fs.readFile(input))});
  }
  const report={reference,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),harnessSha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),runtime:process.version,cpu:cpus()[0]?.model,sources,
    method:'Four fixed 200-pixel free-border inputs, three alternating-order pairs per input. Every fit runs in a fresh Node process. Both complete engine snapshots have identical dependencies and differ only in refine.js. Each timer includes prepare, solve, validation and export; imports, process startup, fixture generation and independent export replay are outside it. Every result must meet the existing 3% image and 10-second limits and retain geometry/paper checks. Each paired cut_geometry.json hash must match exactly.',cases:cases.map(({id,inputSha256})=>({id,inputSha256})),results:[]};
  for(const [index,entry]of cases.entries())for(let round=0;round<3;round++){
    const order=(index+round)%2?['current','previous']:['previous','current'],row={id:entry.id,round,order};
    for(const policy of order){
      const resultFile=path.join(output,`${entry.id}-${round}-${policy}.json`),log=path.join(output,`${entry.id}-${round}-${policy}.log`),handle=await fs.open(log,'w');
      const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',path.join(output,policy,'core/engine.js'),entry.input,resultFile],{stdio:['ignore',handle.fd,handle.fd]});child.once('error',reject);child.once('exit',resolve);});await handle.close();assert.equal(exit,0,`Failed ${policy} ${entry.id}; see ${log}`);
      row[policy]=JSON.parse(await fs.readFile(resultFile));assert.equal(row[policy].inputSha256,entry.inputSha256);
    }
    assert.equal(row.current.geometrySha256,row.previous.geometrySha256);assert.equal(row.current.error,row.previous.error);report.results.push(row);await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({id:entry.id,round,previous:row.previous.seconds,current:row.current.seconds,identical:true}));
  }
}

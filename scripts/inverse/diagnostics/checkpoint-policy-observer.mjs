/** Offline A/B observer. Never imported by the app or the normal test suite.
 * CHECKPOINT_BASELINE optionally substitutes only fit.js and grid.js from a
 * commit. Tests, inputs, validators and all other solver code stay unchanged.
 * Captures happen in memory; compression and disk writes follow test execution.
 */
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import path from 'node:path';

const output=process.env.CHECKPOINT_OUTPUT;
if(!output)throw new Error('CHECKPOINT_OUTPUT is required.');
const now=performance.now.bind(performance),records={file:process.argv[1],revision:process.env.CHECKPOINT_BASELINE||'working-tree',fits:[],clearance:[]};
let depth=0;
const cloneModel=model=>({...model,counts:model.counts.slice(),offsets:model.offsets.slice(),z:model.z.slice()});
globalThis.__checkpointBegin=(options)=>{
 const record={...globalThis.__checkpointContext,options,checkpoints:[],started:now()};
 records.clearance.push(record);return record;
};
globalThis.__checkpointNow=now;
globalThis.__checkpointRecord=(record,model,phase,floor,value,started)=>{
 const preferenceMilliseconds=now()-started;
 if(record)record.checkpoints.push({model:cloneModel(model),phase,floor,preferred:value,preferenceMilliseconds});
};
globalThis.__checkpointEnd=(record,model,error,steps)=>{
 if(record)Object.assign(record,{milliseconds:now()-record.started,result:{model:cloneModel(model),error,steps}});
};
globalThis.__checkpointCapture=async(kind,args,run,serialize)=>{
 const outer=depth++===0,start=now();
 try{
  const value=await run();
  if(outer){
   const source=args[0].sourceImage,settings=value.report?.settings||args[1];
   records.fits.push({kind,source,settings,wallMilliseconds:now()-start,...serialize(value)});
  }
  return value;
 }finally{depth--;}
};

const replacements=new Map();
if(process.env.CHECKPOINT_BASELINE){
 const revision=execFileSync('git',['rev-parse','--verify',`${process.env.CHECKPOINT_BASELINE}^{commit}`],{encoding:'utf8'}).trim();
 records.revision=revision;
 for(const file of ['fit.js','grid.js'])replacements.set(file,execFileSync('git',['show',`${revision}:static/inverse/core/direct/${file}`],{encoding:'utf8'}));
}
function replace(source,needle,replacement){
 if(!source.includes(needle))throw new Error(`Checkpoint observer no longer matches: ${needle.slice(0,100)}`);
 return source.replace(needle,replacement);
}
registerHooks({load(url,context,next){
 const loaded=next(url,context);
 if(!url.includes('/static/inverse/core/'))return loaded;
 let source=Buffer.from(loaded.source).toString();
 if(url.endsWith('/direct/grid.js')){
  source=replacements.get('grid.js')||source;
  const marker="  if(optimizationTarget&&optimizationObjective)throw new Error('Supply only one grid optimization objective.');";
  source=replace(source,marker,`  const observation=clearance?globalThis.__checkpointBegin({prob,size,counts,phase,steps,k,initial,seed,floor,clearance,resolution,optimizationTarget,optimizationObjective,weights}):null;\n${marker}`);
  const old='const preferred=()=>!preferCheckpoint||preferCheckpoint({model,phase,floor});';
  if(source.includes(old))source=replace(source,old,`const preferred=()=>{const at=globalThis.__checkpointNow(),value=!preferCheckpoint||preferCheckpoint({model,phase,floor});globalThis.__checkpointRecord(observation,model,phase,floor,value,at);return value;};`);
  else if(source.includes('const preferred=(candidate=model)=>{')){
   source=replace(source,'const preferred=(candidate=model)=>{','const preferred=(candidate=model)=>{const at=globalThis.__checkpointNow();');
   source=replace(source,'return Number(value);','globalThis.__checkpointRecord(observation,candidate,phase,floor,value,at);return Number(value);');
  }else{
   source=replace(source,'const preferred=()=>{','const preferred=()=>{const at=globalThis.__checkpointNow();');
   source=replace(source,'return Number(value);','globalThis.__checkpointRecord(observation,model,phase,floor,value,at);return Number(value);');
  }
  source=replace(source,'model.z=best.z;return{model,phase,floor,error:best.error,steps:completed};','model.z=best.z;globalThis.__checkpointEnd(observation,model,best.error,completed);return{model,phase,floor,error:best.error,steps:completed};');
 }else if(url.endsWith('/direct/fit.js')){
  source=replacements.get('fit.js')||source;
  source=replace(source,"    const clear=stage('directClearance'",`    globalThis.__checkpointContext={selected:{seed:selected.seed,counts:selected.model.counts,k:selected.model.k,phase:selected.phase,error:selected.error},cfg:refinementCfg,source};\n    const clear=stage('directClearance'`);
  source=replace(source,'export async function fitDirect(','async function observedFitDirect(');
  source+=`\nimport {solutionJSON as __checkpointSerialize} from '../graph.js';\nexport async function fitDirect(...args){return globalThis.__checkpointCapture('direct',args,()=>observedFitDirect(...args),value=>({report:{solver:value.report},geometry:JSON.stringify(__checkpointSerialize(value))}));}\n`;
 }else if(url.endsWith('/engine.js')){
  source=replace(source,'export async function design(','async function observedDesign(');
  source+=`\nexport async function design(...args){return globalThis.__checkpointCapture('design',args,()=>observedDesign(...args),value=>({report:value.report,geometry:value.files['cut_geometry.json']}));}\n`;
 }
 return {...loaded,source};
}});
process.on('exit',()=>{
 if(!records.fits.length&&!records.clearance.length)return;
 const replacer=(_key,value)=>ArrayBuffer.isView(value)?{typed:value.constructor.name,values:Array.from(value)}:value;
 const bytes=gzipSync(JSON.stringify(records,replacer));
 if(bytes.length>12*1024*1024)throw new Error('Checkpoint observation exceeds the bounded artifact allowance.');
 mkdirSync(output,{recursive:true});writeFileSync(path.join(output,`${path.basename(process.argv[1])}-${process.pid}.json.gz`),bytes);
});

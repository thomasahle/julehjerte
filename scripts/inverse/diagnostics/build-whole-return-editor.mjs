/** Build an isolated whole-cut editor experiment, without changing the app. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const hash=b=>createHash('sha256').update(b).digest('hex');
function replaceOnce(source,before,after){
  if(source.split(before).length!==2)throw new Error('Unsupported experiment source layout: '+before.slice(0,80));
  return source.replace(before,after);
}

export async function buildWholeReturnEditor(output){
  if(!output)throw new Error('Use --output=<new directory inside this worktree>');
  const directory=path.resolve(output),relative=path.relative(process.cwd(),directory);
  if(!relative||relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))throw new Error('Experiment output must be inside this worktree.');
  const files=['scripts/inverse/diagnostics/build-whole-return-editor.mjs','scripts/inverse/diagnostics/self-return-candidate.mjs','scripts/inverse/diagnostics/return-cone.mjs','src/lib/editor/curveIssues.ts','static/inverse/core/bezier.js','static/inverse/core/geometry.js'];
  const sources=Object.fromEntries(await Promise.all(files.map(async file=>[file,await fs.readFile(file,'utf8')])));
  const source=sources[files[1]],marker='export function experimentalSelfReturns(solution,cfg){';
  if(source.split(marker).length!==2)throw new Error('The return predicate entry point changed.');
  const parts=source.split(marker),tail=parts[1];let head=parts[0];
  head=replaceOnce(head,"import {curvesOf} from '../../../static/inverse/core/graph.js';\n",'');
  const bodyStart='  const curves=curvesOf(solution,family,slit),segments=[];let arc=0;\n',bodyEnd=' }\n return issues;\n}\n';
  if(tail.split(bodyStart).length!==2||!tail.endsWith(bodyEnd))throw new Error('The return predicate path loop changed.');
  let body=tail.split(bodyStart)[1].slice(0,-bodyEnd.length);
  body=replaceOnce(body,'cfg.geometryTolerance','tolerance');
  body=replaceOnce(body,'distance(p,end)<.01*width','distance(p,end)<endpointTolerance');
  body=replaceOnce(body,'issues.push({family,slit,curves:','issues.push({curves:');
  body=replaceOnce(body,',edgeChain:solution.paths[family][slit].slice(a.order,b.order+1).map(([edge])=>edge)','');
  if(/\b(solution|cfg|family|slit|width)\b/.test(body))throw new Error('The extracted path search still depends on its graph wrapper.');
  const prefix=path.relative(directory,path.resolve('static/inverse/core')).split(path.sep).join('/');
  const core=prefix.startsWith('.')?prefix:'./'+prefix;
  head=head.replaceAll('../../../static/inverse/core',core);
  const kernel=head+"import {excludesReturnByCone} from './return-cone.mjs';\n"+
    'export function pathReturns(curves,{margin,local=Infinity,tolerance=.01,endpointTolerance=0}){\n'+
    ' const cache=new WeakMap(),issues=[],segments=[];let arc=0;\n'+
    ' if(!(margin>0)||local<2*margin||!curves.length||excludesReturnByCone(curves))return issues;\n'+body+' return issues;\n}\n';
  const adapter=`import {Cubic} from '${core}/bezier.js';
import {pathReturns} from './path-returns.mjs';
export function completePathReturns(segments,minDistance,endpointTolerance){
 if(!segments.length||!(minDistance>0))return[];
 const scale=1.5/minDistance,origin=segments[0].p0;
 const curves=segments.map(s=>new Cubic([s.p0,s.p1,s.p2,s.p3].map(p=>[(p.x-origin.x)*scale,(p.y-origin.y)*scale])));
 return pathReturns(curves,{margin:1.5,tolerance:.01,endpointTolerance:endpointTolerance*scale});
}
`;
  let editor="import {completePathReturns} from './adapter.mjs';\n"+sources[files[3]];
  editor=replaceOnce(editor,'\t\t\tif (bboxDistanceSq(ba, bb) >= minDist2) continue;',
    '\t\t\t// Same-cut proximity is checked over the whole path below.\n\t\t\tif (same) continue;\n\t\t\tif (bboxDistanceSq(ba, bb) >= minDist2) continue;');
  editor=replaceOnce(editor,'\n\tif (\n\t\tsegmentsHaveIssues(segs,',
    '\n\tif (completePathReturns(segs, minDistance, SELF_ENDPOINT_TOLERANCE * 2).length) return true;\n\n\tif (\n\t\tsegmentsHaveIssues(segs,');
  await fs.mkdir(path.dirname(directory),{recursive:true});await fs.mkdir(directory);
  const generated={'editor.ts':editor,'adapter.mjs':adapter,'path-returns.mjs':kernel,'return-cone.mjs':sources[files[2]]},sourceHashes={};
  for(const [name,code]of Object.entries(generated)){
    const file=path.join(directory,name);await fs.writeFile(file,code);sourceHashes[path.relative(process.cwd(),file)]=hash(code);
  }
  const manifest={scope:'Offline editor prototype: complete same-cut search, existing crossing/inter-cut rules, conservative directional exclusion. No production source files changed. Generated TS still requires a production module/typing integration.',baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputs:Object.fromEntries(files.map(file=>[file,hash(sources[file])])),sourceHashes};
  await fs.writeFile(path.join(directory,'source.json'),JSON.stringify(manifest,null,2)+'\n');return directory;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
  console.log(await buildWholeReturnEditor(args.output));
}

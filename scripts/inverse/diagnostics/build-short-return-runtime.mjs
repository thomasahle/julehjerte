/** Build an isolated experiment; never rewrite the application's runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export async function buildShortReturnRuntime(output){
  if(!output)throw new Error('Use --output=<new directory inside this worktree>');
  const directory=path.resolve(output),relative=path.relative(process.cwd(),directory);
  if(!relative||relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))throw new Error('Experiment output must be inside this worktree.');
  await fs.mkdir(path.dirname(directory),{recursive:true});await fs.mkdir(directory);
  await fs.cp('static/inverse',path.join(directory,'inverse'),{recursive:true});
  const candidate='scripts/inverse/diagnostics/self-return-candidate.mjs';
  let code=await fs.readFile(candidate,'utf8');
  for(const file of ['bezier.js','graph.js','geometry.js'])code=code.replace(`'../../../static/inverse/core/${file}'`,`'./${file}'`);
  code=code.replace('export function experimentalSelfReturns(', 'export function shortSelfReturns(');
  await fs.writeFile(path.join(directory,'inverse/core/self-returns.js'),code);
  const patch='scripts/inverse/diagnostics/short-return-projection.patch',destination=path.join(relative,'inverse/core');
  execFileSync('git',['apply','--check','--directory='+destination,patch]);
  execFileSync('git',['apply','--directory='+destination,patch]);
  const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHashes={};
  for(const name of await fs.readdir(path.join(directory,'inverse'),{recursive:true})){
    const file=path.join(directory,'inverse',name);if(!(await fs.stat(file)).isFile())continue;
    sourceHashes[path.relative(process.cwd(),file)]=hash(await fs.readFile(file));
  }
  const inputs={};for(const file of [candidate,patch,'static/inverse/core/direct/refine.js'])inputs[file]=hash(await fs.readFile(file));
  const manifest={scope:'Offline experimental short-return predicate and projection of failed refinement checkpoints. The live static/inverse runtime is unchanged.',baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputs,sourceHashes};
  await fs.writeFile(path.join(directory,'source.json'),JSON.stringify(manifest,null,2)+'\n');
  return directory;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
  console.log(await buildShortReturnRuntime(args.output));
}

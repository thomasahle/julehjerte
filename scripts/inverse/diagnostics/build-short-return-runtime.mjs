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
  const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHashes={};
  for(const name of await fs.readdir(path.join(directory,'inverse'),{recursive:true})){
    const file=path.join(directory,'inverse',name);if(!(await fs.stat(file)).isFile())continue;
    sourceHashes[path.relative(process.cwd(),file)]=hash(await fs.readFile(file));
  }
  const inputs={};for(const file of ['static/inverse/core/direct/refine.js','static/inverse/core/direct/short-return-project.js','static/inverse/core/complete-self-returns.js','static/inverse/core/return-search.js','static/inverse/core/validate.js'])inputs[file]=hash(await fs.readFile(file));
  const manifest={scope:'Isolated snapshot of the production whole-cut checker and checkpoint projection for diagnostic replay. Building the snapshot never changes the live static/inverse runtime.',baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputs,sourceHashes};
  await fs.writeFile(path.join(directory,'source.json'),JSON.stringify(manifest,null,2)+'\n');
  return directory;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
  console.log(await buildShortReturnRuntime(args.output));
}

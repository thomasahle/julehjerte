/** Build an isolated whole-cut editor experiment, without changing the app. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildReturnSearch} from '../build-return-search.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
function replaceOnce(source,before,after){
  if(source.split(before).length!==2)throw new Error('Unsupported experiment source layout: '+before.slice(0,80));
  return source.replace(before,after);
}

export async function buildWholeReturnEditor(output){
  if(!output)throw new Error('Use --output=<new directory inside this worktree>');
  const directory=path.resolve(output),relative=path.relative(process.cwd(),directory);
  if(!relative||relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))throw new Error('Experiment output must be inside this worktree.');
  await buildReturnSearch({check:true});
  const files=['scripts/inverse/diagnostics/build-whole-return-editor.mjs','scripts/inverse/build-return-search.mjs','src/lib/editor/curveIssues.ts','src/lib/geometry/curveReturns.ts','src/lib/geometry/returnSearch.ts','static/inverse/core/return-search.js'];
  const sources=Object.fromEntries(await Promise.all(files.map(async file=>[file,await fs.readFile(file,'utf8')])));
  const importPath=file=>{
    const relative=path.relative(directory,path.resolve(file)).split(path.sep).join('/');
    return relative.startsWith('.')?relative:'./'+relative;
  };
  const kernel=`export {pathReturns} from '${importPath('static/inverse/core/return-search.js')}';\n`;
  let editor=`import {hasSelfReturn} from '${importPath('src/lib/geometry/curveReturns.ts')}';\n`+sources['src/lib/editor/curveIssues.ts'];
  editor=replaceOnce(editor,'\t\t\tif (bboxDistanceSq(ba, bb) >= minDist2) continue;',
    '\t\t\t// Same-cut proximity is checked over the whole path below.\n\t\t\tif (same) continue;\n\t\t\tif (bboxDistanceSq(ba, bb) >= minDist2) continue;');
  editor=replaceOnce(editor,'\n\tif (\n\t\tsegmentsHaveIssues(segs,',
    '\n\tif (hasSelfReturn(segs, minDistance)) return true;\n\n\tif (\n\t\tsegmentsHaveIssues(segs,');
  await fs.mkdir(path.dirname(directory),{recursive:true});await fs.mkdir(directory);
  const generated={'editor.ts':editor,'path-returns.mjs':kernel},sourceHashes={};
  for(const [name,code]of Object.entries(generated)){
    const file=path.join(directory,name);await fs.writeFile(file,code);sourceHashes[path.relative(process.cwd(),file)]=hash(code);
  }
  const manifest={scope:'Offline editor prototype using the shared typed return search and a physical endpoint exemption. Existing crossing/inter-cut rules are retained. The app has not enabled the checker or final repair.',baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inputs:Object.fromEntries(files.map(file=>[file,hash(sources[file])])),sourceHashes};
  await fs.writeFile(path.join(directory,'source.json'),JSON.stringify(manifest,null,2)+'\n');return directory;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
  console.log(await buildWholeReturnEditor(args.output));
}

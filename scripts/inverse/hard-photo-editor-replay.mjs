/** Replay saved engine outputs through production editable conversion and SVG I/O.
 * This isolates the final stage; it does not replace actual browser upload QA.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {createCanvas,loadImage} from 'canvas';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {auditEditablePaper} from './editable-paper-audit.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.run||!args.output)throw new Error('Use --run=<benchmark directory> --output=<new directory>');
const benchmark=JSON.parse(await fs.readFile(path.join(args.run,'results.json'))),output=args.output;
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),results=[],sourceHashes={};
for(const file of ['src/lib/inverse/toHeartDesign.ts','src/lib/inverse/conversionFidelity.ts','src/lib/inverse/simplifyCurves.ts','src/lib/utils/heartDesign.ts','src/lib/editor/curveIssues.ts','src/lib/paint/rasterize.ts','scripts/inverse/hard-photo-editor-replay.mjs','scripts/inverse/editable-paper-audit.mjs','static/inverse/core/direct/curves.js','static/inverse/core/validate.js','static/inverse/core/material.js','static/inverse/core/settings.js'])sourceHashes[file]=hash(await fs.readFile(file));
const ledger={benchmarkRun:args.run,cropMode:benchmark.cropMode,targetMode:benchmark.targetMode||'photo',sourceHashes,method:'Saved engine geometry and exact classified mask through production validated conversion, SVG serialization/parsing, editor intersection rules and source-mask replay. No new fitting or crop correction. Not a browser interaction test.',results};
const loader=await createServer({configFile:false,cacheDir:path.resolve(output,'vite-cache'),server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
try{
  const {convertValidatedCutGeometry,convertCutGeometry}=await loader.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts');
  const {conversionFidelity}=await loader.ssrLoadModule('/src/lib/inverse/conversionFidelity.ts');
  const {serializeHeartToSVG,parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
  const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/src/lib/editor/curveIssues.ts');
  const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
  const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
  for(const entry of benchmark.results)for(const run of entry.runs){
    if(run.independentImageError===undefined)continue;
    const row={id:entry.id,preset:run.preset,engineChecksPassed:run.report.templateChecksPassed,independentEngineError:run.independentImageError};results.push(row);
    const dir=path.join(args.run,entry.id,run.preset),geometryBytes=await fs.readFile(path.join(dir,'cut_geometry.json'));
    const image=await loadImage(path.join(dir,'mask.png')),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    assert.equal(image.width,image.height);const pixels=ctx.getImageData(0,0,image.width,image.height).data,mask=Uint8Array.from({length:image.width**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));
    assert.equal(hash(mask),run.maskSha256,'Replay must use the original classified pixels');
    assert.ok(!run.report.symmetry.requested.length,'This replay currently covers unconstrained photographic fits');
    row.geometrySha256=hash(geometryBytes);row.maskSha256=hash(mask);
    const started=performance.now();
    try{
      const reference={mask:{size:image.width,data:mask}},converted=convertValidatedCutGeometry(geometryBytes.toString(),{name:entry.id,enforce:{curve:'off',lobe:'off',lobes:'off'},reference});
      const svg=serializeHeartToSVG(converted.design),design=parseHeartFromSVG(svg,entry.id+'.svg');assert.ok(design);
      const issues=[...findFingersWithIssues(design.fingers,intersectionMarginPx(inferOverlapRect(design.fingers,design.gridSize)))];
      row.editorIssues=issues;assert.deepEqual(issues,[],'Downloaded SVG must pass the editor rules too');
      const original=convertCutGeometry(geometryBytes.toString(),{name:'original',tolerance:0,preserveShared:true,enforce:converted.honoured});
      row.fidelity=conversionFidelity(original.design,reference)(design);assert.ok(row.fidelity.passed);
      const woven=rasterizeDesign(design,image.width).data;
      row.editableError=woven.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
      const features=auditImageFeatures({mask,resolution:image.width},woven);row.missingFeatures=features.missing.length;
      row.physical=auditEditablePaper(design,inferOverlapRect(design.fingers,design.gridSize),run.report.settings,run.report.slits);
      if(run.report.validation.passed)assert.equal(row.physical.geometry.passed,true,'Editable cuts must retain the engine geometry constraints');
      if(run.report.templateChecksPassed)assert.equal(row.physical.paper?.status,'pass','Editable cuts must retain the verified paper support');
      row.conversionPassed=true;row.completeCandidatePassed=run.passed&&features.passed&&row.editableError<=.03&&row.physical.geometry.passed&&row.physical.paper?.status==='pass';
      row.tolerance=converted.editorValidation.tolerance;
      await fs.writeFile(path.join(output,`${entry.id}-${run.preset}.svg`),svg);
    }catch(error){row.conversionPassed=false;row.completeCandidatePassed=false;row.error=error.message;row.errorCode=error.code;}
    row.seconds=(performance.now()-started)/1000;
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify(ledger,null,2));
    console.log(JSON.stringify({id:row.id,conversion:row.conversionPassed,passed:row.completeCandidatePassed,error:row.editableError,failure:row.error}));
  }
  if(!results.length)throw new Error('No exported candidates to replay');
  if(results.some(row=>!row.conversionPassed))process.exitCode=1;
}finally{await loader.close();dom.window.close();}

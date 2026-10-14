/** Compare actual downloaded SVGs under exact subdivision and reflection.
 * No fitting, resampling, crop changes or acceptance-threshold changes.
 * The current independent editor and the proposed engine are both recorded.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {Cubic,distance} from '../../../static/inverse/core/bezier.js';
import {editablePaperSolution} from '../editable-paper-audit.mjs';
import {diagnosticSubdivisions} from '../self-return-subdivision-study.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function subdivideEditableDesign(design,overlap,knots,reflect=false){
  let maximumGeometryDifference=0;
  const fingers=design.fingers.map(finger=>({...finger,segments:finger.segments.flatMap(segment=>{
    const curve=new Cubic([segment.p0,segment.p1,segment.p2,segment.p3].map(p=>[p.x,p.y]));
    return knots.slice(1).map((hi,i)=>{
      const lo=knots[i],part=curve.subcurve(lo,hi);
      for(let j=0;j<=16;j++)maximumGeometryDifference=Math.max(maximumGeometryDifference,distance(curve.point(lo+(hi-lo)*j/16),part.point(j/16)));
      return Object.fromEntries(part.p.map(([x,y],k)=>['p'+k,{x:reflect?2*overlap.left+overlap.width-x:x,y}]));
    });
  })}));
  return{design:{...design,fingers},maximumGeometryDifference};
}

async function run(args){
  if(!args.run||!args.editable||!args.runtime||!args.output)throw new Error('Use --run=<benchmark> --editable=<editor replay> --runtime=<experimental runtime> --output=<new directory>');
  const benchmark=JSON.parse(await fs.readFile(path.join(args.run,'results.json')));
  const editor=JSON.parse(await fs.readFile(path.join(args.editable,'results.json')));
  const manifestFile=path.join(args.runtime,'source.json'),manifest=JSON.parse(await fs.readFile(manifestFile));
  const verifyRuntime=async()=>{for(const [file,expected]of Object.entries(manifest.sourceHashes))assert.equal(hash(await fs.readFile(file)),expected,file);};
  await verifyRuntime();
  const {validate}=await import(pathToFileURL(path.resolve(args.runtime,'inverse/core/validate.js')).href);
  await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
  const editorModule=args['editor-module']||'src/lib/editor/curveIssues.ts',baselineModule=args['baseline-editor-module']||null,editorManifestFile=args['editor-manifest']||null;
  const editorManifest=editorManifestFile?JSON.parse(await fs.readFile(editorManifestFile)):null;
  const verifyEditor=async()=>{if(editorManifest)for(const [file,expected]of Object.entries({...editorManifest.inputs,...editorManifest.sourceHashes}))assert.equal(hash(await fs.readFile(file)),expected,file);};
  await verifyEditor();
  const sourceHashes={};
  for(const file of ['scripts/inverse/diagnostics/editable-return-study.mjs','scripts/inverse/editable-paper-audit.mjs','static/inverse/core/bezier.js','static/inverse/core/direct/curves.js','static/inverse/core/settings.js',editorModule,...[baselineModule,editorManifestFile].filter(Boolean),'src/lib/utils/heartDesign.ts','src/lib/utils/overlapRect.ts',manifestFile])sourceHashes[file]=hash(await fs.readFile(file));
  const rows=[],ledger={method:'Actual production-converted, serialized and reparsed SVGs; four exact subdivisions, each with and without reflection. Editor and experimental engine validation are separate. No shape repair or fitting.',run:args.run,editable:args.editable,runtime:args.runtime,editorModule,baselineModule,editorManifestFile,sourceHashes,rows};
  const loader=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},cacheDir:path.resolve(args.output,'vite-cache'),server:{middlewareMode:true,hmr:false,ws:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
  const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
  try{
    const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
    const {findFingersWithIssues,intersectionMarginPx}=await loader.ssrLoadModule('/'+path.relative(process.cwd(),path.resolve(editorModule)));
    const baseline=baselineModule?await loader.ssrLoadModule('/'+path.relative(process.cwd(),path.resolve(baselineModule))):null;
    const {inferOverlapRect}=await loader.ssrLoadModule('/src/lib/utils/overlapRect.ts');
    for(const row of editor.results){
      if(!row.conversionPassed)continue;
      const entry=benchmark.results.find(e=>e.id===row.id),fit=entry.runs.find(r=>r.preset===row.preset);
      const file=path.join(args.editable,`${row.id}-${row.preset}.svg`),bytes=await fs.readFile(file),design=parseHeartFromSVG(bytes.toString(),row.id+'.svg');assert.ok(design);
      const overlap=inferOverlapRect(design.fingers,design.gridSize),original=JSON.stringify(design);
      for(const [representation,knots]of Object.entries(diagnosticSubdivisions))for(const reflect of [false,true]){
        const transformed=subdivideEditableDesign(design,overlap,knots,reflect),measurements={};
        const order=baseline?(rows.length%2?['candidate','baseline']:['baseline','candidate']):['candidate'];
        for(const method of order){
          const start=performance.now(),find=method==='baseline'?baseline.findFingersWithIssues:findFingersWithIssues;
          const issues=[...find(transformed.design.fingers,intersectionMarginPx(overlap))];measurements[method]={issues,milliseconds:performance.now()-start};
        }
        const editorIssues=measurements.candidate.issues,editorMs=measurements.candidate.milliseconds;
        const {solution,cfg}=editablePaperSolution(transformed.design,overlap,fit.report.settings,fit.report.slits),at=performance.now();
        const geometry=validate(solution,cfg,{checkImage:false}),candidateMs=performance.now()-at;
        rows.push({id:row.id,preset:row.preset,engineChecksPassed:row.engineChecksPassed,completeCandidatePassed:row.completeCandidatePassed,svg:file,svgSha256:hash(bytes),representation,reflect,maximumGeometryDifference:transformed.maximumGeometryDifference,editorIssues,geometry,editorMs,candidateMs,...(baseline?{baselineEditor:measurements.baseline}:{})});
      }
      assert.equal(JSON.stringify(design),original,'The downloaded SVG must remain unchanged');
      console.log(row.id,JSON.stringify(rows.slice(-8).map(r=>[r.editorIssues.length,r.geometry.passed])));
      await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify(ledger,null,2)+'\n');
    }
    assert.ok(rows.length,'No editable SVGs to audit');
    await verifyRuntime();await verifyEditor();
    for(const [file,expected]of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),expected,file);
  }finally{await loader.close();dom.window.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
  await run(args);
}

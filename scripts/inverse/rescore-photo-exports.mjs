/** Rescore saved direct exports without rerunning or initializing the fitter.
 * The inventory supplies source metadata; reports supply the actual fixed crops.
 */
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {renderExportedWeave} from './export-renderer.mjs';
import {writeHardPhotoReport} from './hard-photo-report.mjs';

const [directory,inventoryFile,preset='direct']=process.argv.slice(2);
const inventory=JSON.parse(await fs.readFile(inventoryFile));
const existing=JSON.parse(await fs.readFile(`${directory}/results.json`));
await fs.writeFile(`${directory}/results-before-rescore.json`,JSON.stringify(existing,null,2));
const results=[];
for(const entry of inventory.results){
  const row={...entry,runs:[]};results.push(row);
  if(['incomplete','obscured'].includes(row.cropStatus))continue;
  const folder=`${directory}/${row.id}/${preset}`;
  const report=JSON.parse(await fs.readFile(`${folder}/report.json`));
  const im=await loadImage(`${folder}/mask.png`),n=im.width,canvas=createCanvas(n,n),ctx=canvas.getContext('2d');
  ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,n,n).data;
  const mask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i+1]<128));
  const rendered=await renderExportedWeave(await fs.readFile(`${folder}/cut_geometry.json`,'utf8'),n);
  const band=Math.round(n*.05);let edgePixels=0,edgeErrors=0,interiorErrors=0;
  for(let i=0;i<mask.length;i++){
    const edge=Math.min(i%n,Math.floor(i/n),n-1-i%n,n-1-Math.floor(i/n))<band,miss=mask[i]!==rendered.mask[i];
    edgePixels+=edge;if(edge)edgeErrors+=miss;else interiorErrors+=miss;
  }
  const independentImageError=(edgeErrors+interiorErrors)/mask.length;
  const passed=report.templateExportAllowed&&independentImageError<=.03;
  const prior=existing.results.find(x=>x.id===row.id)?.runs.find(x=>x.preset===preset);
  row.effectiveQuad=report.input.sourceImage.cropCorners;
  row.runs=[{...prior,preset,direct:true,curves:0,settings:report.settings,report,
    seconds:prior?.seconds??null,solverSeconds:report.solver.seconds,
    preprocessing:{preprocessing:report.input.preprocessing},independentImageError,passed,
    status:passed?'validated':report.solver.termination,
    spatialError:{bandFraction:.05,edgePixels,edgeErrors,interiorErrors,edgeMismatch:edgeErrors/edgePixels,interiorMismatch:interiorErrors/(mask.length-edgePixels)}}];
  row.status=passed?'validated':'failed';
  await fs.writeFile(`${folder}/independent-weave.png`,rendered.png);
}
const data={...existing,shard:null,results,rescoredAt:new Date().toISOString(),
  rescore:{inventoryFile,source:'Saved report.json, classified mask.png and cut_geometry.json for every case; no fitting rerun',missingTotalTimings:'Solver timings remain in all reports. Original wall timings are only retained where present in the prior summary.'}};
await fs.writeFile(`${directory}/results.json`,JSON.stringify(data,null,2));
await writeHardPhotoReport(`${directory}/results.json`);
console.log(`${results.filter(x=>x.runs.some(r=>r.passed)).length}/${results.filter(x=>x.runs.length).length} passed`,directory);

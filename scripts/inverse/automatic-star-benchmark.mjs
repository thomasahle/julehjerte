/** Full reconstruction of automatically located star photos and perturbations.
 * No reference cutting paths, hand-picked corners or crop insets are inputs.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {GENERAL_PRESET} from '../../src/lib/inverse/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';
const output=`tmp/inverse-automatic-star/${new Date().toISOString().replace(/[:.]/g,'-')}`;
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const settings={...GENERAL_PRESET,timeLimit:30,trials:0},results=[],sources=[];
const files={user:'scripts/inverse/fixtures/yellow-star-photo.png',web:'tmp/inverse-hard-photos/sources/bibel-star-curved.png'};
const sourceSha256={};for(const p of ['src/lib/inverse/presets.js','static/inverse/core/border.js','static/inverse/core/crop.js','static/inverse/locator/locator.js','static/inverse/locator/palette.js','static/inverse/core/input.js'])sourceSha256[p]=hash(await fs.readFile(p));
const save=()=>fs.writeFile(`${output}/results.json`,JSON.stringify({settings,sourceSha256,sources,criteria:'Validated geometry, strict paper-core pass and at most 3% independent disagreement against the unedited classified automatic crop. Original cutting paths are unknown.',results},null,2));
for(const[id,file]of Object.entries(files)){
  const bytes=await fs.readFile(file).catch(()=>null);if(!bytes){sources.push({id,file,skipped:'Local source absent'});continue;}
  sources.push({id,file,sha256:hash(bytes)});const im=await loadImage(bytes);let originalQuad;
  for(const variant of ['original','left','right','up','down','brighter','darker','jpeg','half']){
    const row={id,variant},start=performance.now();results.push(row);
    try{
      const c=createCanvas(variant==='half'?Math.round(im.width/2):im.width,variant==='half'?Math.round(im.height/2):im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);
      if(variant==='jpeg')ctx.drawImage(await loadImage(c.toBuffer('image/jpeg',{quality:.75})),0,0);
      const input={type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba:ctx.getImageData(0,0,c.width,c.height).data};
      if(['brighter','darker'].includes(variant))for(let i=0;i<input.rgba.length;i++)if(i%4!==3)input.rgba[i]+=variant==='brighter'?8:-8;
      if(['left','right','up','down'].includes(variant))input.quad=originalQuad.map(([x,y])=>[x+(variant==='left'?-1:variant==='right'?1:0),y+(variant==='up'?-1:variant==='down'?1:0)]);
      else{row.proposal=detectHeartCrops(input).candidates[0];input.quad=row.proposal?.quad;if(!input.quad)throw new Error('No automatic crop proposal');}
      if(variant==='original')originalQuad=input.quad;
      row.quad=input.quad;row.decodedPixelsSha256=hash(input.rgba);
      const prepared=prepare(input,settings),result=await design(prepared.target,settings),rendered=await renderExportedWeave(result.files['cut_geometry.json'],prepared.preview.resolution);
      row.independentImageError=rendered.mask.reduce((s,v,i)=>s+Number(v!==prepared.preview.mask[i]),0)/rendered.mask.length;
      row.passed=result.report.templateExportAllowed&&row.independentImageError<=.03;row.slits=result.report.slits;row.geometryPassed=result.report.validation.passed;row.paperStatus=result.report.manufacturing.status;row.border=result.report.input.preprocessing.border;
      const dir=`${output}/${id}-${variant}`;await fs.mkdir(dir);for(const[p,data]of Object.entries(result.files))await fs.writeFile(`${dir}/${p}`,data);await fs.writeFile(`${dir}/independent.png`,rendered.png);
    }catch(e){row.passed=false;row.error=e.message;row.report=e.report;}
    row.seconds=(performance.now()-start)/1000;console.log(id,variant,row.passed,row.independentImageError,row.error||'',row.seconds.toFixed(2));await save();
  }
}
console.log(output);if(results.some(r=>!r.passed))process.exitCode=1;

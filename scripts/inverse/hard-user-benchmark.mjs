/** Separate detector failures from fitting failures on supplied photographs.
 * All crops are fixed before fitting; manual landmarks are diagnostics, not truth.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

const root='scripts/inverse/fixtures/hard-user',catalog=JSON.parse(await fs.readFile(`${root}/manifest.json`));
const output=process.env.INVERSE_HARD_OUT||`tmp/inverse-hard-user/${new Date().toISOString().replace(/[:.]/g,'-')}`;
const cfg={...AUTOMATIC_PRESET,trials:0,timeLimit:Number(process.env.INVERSE_HARD_SECONDS||60),...JSON.parse(process.env.INVERSE_HARD_SETTINGS||'{}')};
const results=[];await fs.mkdir(output,{recursive:true});
for(const entry of catalog.cases){
  const bytes=await fs.readFile(`${root}/${entry.file}`),im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const input={type:'pixels',imageWidth:im.width,imageHeight:im.height,rgba:ctx.getImageData(0,0,im.width,im.height).data};
  const automatic=detectHeartCrops(input),row={id:entry.id,sourceSha256:createHash('sha256').update(bytes).digest('hex'),automatic,crops:[]};results.push(row);
  const crops=[...automatic.candidates.map((c,i)=>({name:`automatic-${i}`,quad:c.quad})),{name:'manual-diagnostic',quad:entry.manualGuide}];
  for(const crop of crops){
    if(process.env.INVERSE_HARD_CROPS&&!process.env.INVERSE_HARD_CROPS.split(',').includes(crop.name))continue;
    const directory=`${output}/${entry.id}/${crop.name}`;await fs.mkdir(directory,{recursive:true});
    const item={...crop,groundTruthAvailable:false};row.crops.push(item);
    ctx.drawImage(im,0,0);ctx.strokeStyle='#00eaff';ctx.lineWidth=4;ctx.beginPath();crop.quad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();
    await fs.writeFile(`${directory}/crop.png`,canvas.toBuffer('image/png'));
    try{
      const started=performance.now(),p=prepare({...input,quad:crop.quad},cfg);item.preparation=p.preview.metadata;
      const n=p.preview.resolution,photo=createCanvas(n,n),pc=photo.getContext('2d'),pixels=pc.createImageData(n,n);
      for(let i=0;i<n*n;i++)pixels.data.set([...p.preview.rgb.slice(3*i,3*i+3),255],4*i);pc.putImageData(pixels,0,0);await fs.writeFile(`${directory}/rectified.png`,photo.toBuffer('image/png'));
      const answer=await design(p.target,cfg);item.seconds=(performance.now()-started)/1000;item.report=answer.report;
      for(const[name,data]of Object.entries(answer.files))await fs.writeFile(`${directory}/${name}`,data);
      const woven=await renderExportedWeave(answer.files['cut_geometry.json'],n);await fs.writeFile(`${directory}/independent.png`,woven.png);
      const areas={border:{pixels:0,errors:0},interior:{pixels:0,errors:0}};
      const comparison=createCanvas(n*4,n),cc=comparison.getContext('2d');cc.drawImage(photo,0,0);
      const maskImage=cc.createImageData(n,n),wovenImage=cc.createImageData(n,n),diffImage=cc.createImageData(n,n);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=y*n+x,target=p.preview.mask[i],actual=woven.mask[i],error=target!==actual;
        const area=areas[Math.min(x,y,n-1-x,n-1-y)<n*.05?'border':'interior'];area.pixels++;area.errors+=Number(error);
        const color=v=>v?[181,68,5,255]:[255,250,230,255];maskImage.data.set(color(target),4*i);wovenImage.data.set(color(actual),4*i);
        diffImage.data.set(error?(target?[224,0,153,255]:[0,177,221,255]):[240,240,240,255],4*i);
      }
      cc.putImageData(maskImage,n,0);cc.putImageData(wovenImage,n*2,0);cc.putImageData(diffImage,n*3,0);await fs.writeFile(`${directory}/comparison.png`,comparison.toBuffer('image/png'));
      item.independentImageError=(areas.border.errors+areas.interior.errors)/(n*n);item.errorByRegion=areas;
    }catch(error){item.failure=error.message;item.failureReport=error.report;}
    console.log(JSON.stringify({id:row.id,crop:crop.name,seconds:item.seconds,error:item.independentImageError,passed:item.report?.templateChecksPassed,failure:item.failure}));
    await fs.writeFile(`${output}/results.json`,JSON.stringify({cfg,results},null,2));
  }
}
console.log(output);

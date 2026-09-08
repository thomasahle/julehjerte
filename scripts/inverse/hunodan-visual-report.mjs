/** Reconstruct a visual audit from photographed inputs and exported templates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../static/inverse/core/engine.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {comparisonPixels} from '../../src/lib/inverse/comparison.ts';
const source=process.argv[2];if(!source)throw new Error('Pass a benchmark output directory');
const run=JSON.parse(await fs.readFile(`${source}/results.json`)),scope=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/scope.json'));
const output=process.env.INVERSE_HUNODAN_REPORT||`${source}/visual-report`;await fs.mkdir(output,{recursive:true});
const rows=[],images=[],size=230;
function pixelsCanvas(pixels,n){const c=createCanvas(n,n),ctx=c.getContext('2d'),d=ctx.createImageData(n,n);d.data.set(pixels);ctx.putImageData(d,0,0);return c;}
for(const r of run.results){
 if(!r.quad)continue;
 const input=await loadImage(r.sourcePhoto),c=createCanvas(input.width,input.height),cx=c.getContext('2d');cx.drawImage(input,0,0);
 const prepared=prepare({type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba:cx.getImageData(0,0,c.width,c.height).data,quad:r.quad},run.cfg),p=prepared.preview,n=p.resolution;
 const geometry=await fs.readFile(`${source}/${r.id}/cut_geometry.json`,'utf8'),rendered=await renderExportedWeave(geometry,n),difference=comparisonPixels(p.mask,rendered.mask,n,['#ffffff','#000000'],'difference');
 if(Math.abs(difference.fraction-r.independentImageError)>1e-12)throw new Error(`${r.id}: report reconstruction disagrees with saved benchmark error`);
 const rgb=new Uint8ClampedArray(4*n*n),mask=new Uint8ClampedArray(4*n*n);
 for(let i=0;i<n*n;i++){rgb.set([p.rgb[3*i],p.rgb[3*i+1],p.rgb[3*i+2],255],4*i);mask.set(p.mask[i]?[0,0,0,255]:[255,255,255,255],4*i);}
 const strip=createCanvas(1240,305),ctx=strip.getContext('2d');ctx.fillStyle='#f4f6f3';ctx.fillRect(0,0,strip.width,strip.height);ctx.fillStyle='#172e35';ctx.font='bold 16px sans-serif';
 const regular=!scope.excluded[r.id],counts=r.report?.solver?.selectedCounts;
 ctx.fillText(`${r.id} · ${(100*difference.fraction).toFixed(2)}% image difference · slits ${counts?.join(' + ')}${regular?'':' · additional interior-cut case'}`,10,22);ctx.font='14px sans-serif';
 const panels=[c,pixelsCanvas(rgb,n),pixelsCanvas(mask,n),await loadImage(rendered.png),pixelsCanvas(difference.pixels,n)],labels=['Photograph and automatic crop','Rectified photograph','Original classified mask','Weave from exported curves','Differences from original mask'];
 for(let i=0;i<panels.length;i++){
  const x=10+246*i,panel=panels[i],scale=Math.min(size/panel.width,size/panel.height);ctx.fillStyle='#172e35';ctx.fillText(labels[i],x,47);const ox=x+(size-panel.width*scale)/2,oy=60+(size-panel.height*scale)/2;ctx.drawImage(panel,ox,oy,panel.width*scale,panel.height*scale);
  if(i===0){ctx.beginPath();r.quad.forEach((p,j)=>{if(j)ctx.lineTo(ox+p[0]*scale,oy+p[1]*scale);else ctx.moveTo(ox+p[0]*scale,oy+p[1]*scale);});ctx.closePath();ctx.strokeStyle='#cb168a';ctx.lineWidth=1.2;ctx.stroke();}
 }
 const filename=`${r.id}.png`;await fs.writeFile(`${output}/${filename}`,strip.toBuffer('image/png'));images.push(strip);rows.push({id:r.id,required:regular,passed:r.passed,independentImageError:difference.fraction,counts,filename});
}
for(let start=0;start<images.length;start+=5){const page=createCanvas(1240,305*Math.min(5,images.length-start)),ctx=page.getContext('2d');for(let i=start;i<Math.min(images.length,start+5);i++)ctx.drawImage(images[i],0,305*(i-start));await fs.writeFile(`${output}/page-${start/5+1}.jpg`,page.toBuffer('image/jpeg',{quality:.94}));}
const required=rows.filter(r=>r.required),pass=required.filter(r=>r.passed).length;
await fs.writeFile(`${output}/index.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hunodan reconstruction audit</title><style>body{font:16px system-ui;background:#f4f6f3;color:#172e35;margin:24px}img{display:block;max-width:100%;margin:18px 0}p{max-width:1000px}a{color:#07617b}</style><h1>${pass}/${required.length} regular designs pass</h1><p>All photographs start with fresh grids; a missing substantial region can trigger a traced routing attempt from the same mask. Automatic corners remain fixed during fitting. Passing requires the geometry and paper checks plus preservation of substantial interior regions and at most 3% difference from the classified input when an independent renderer reads the exported curves. This is a reconstruction score, not 100% pixel identity or proof of physically tested assembly.</p><p>Magenta marks colour present only in the source mask; teal marks colour present only in the reconstruction. Reference drawings and slit counts are used only for validation. ${Object.keys(scope.excluded).length} interior-cut designs are outside the required set; all 27 original source pairs remain in the dataset.</p>${rows.map(r=>`<img src="${r.filename}" alt="${r.id}: ${(100*r.independentImageError).toFixed(2)}% difference">`).join('')}</html>`);
await fs.writeFile(`${output}/results.json`,JSON.stringify({source:path.resolve(source),scope,criteria:run.criteria,rows},null,2));console.log(output);

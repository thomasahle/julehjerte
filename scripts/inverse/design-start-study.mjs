/** Fresh solves of the design-start compositions. No saved cuts seed the search.
 * Reports compare independently rendered exported cuts with the protected motif.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas,loadImage,registerFont} from 'canvas';
import {Resvg} from '@resvg/resvg-js';
import {createServer} from 'vite';
import {motifs} from '../../docs/design-start/motifs.mjs';
import {motifArtwork,frameRegion,frameArtwork} from '../../docs/design-start/motif-frames.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';
const arg=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(root,arg('output')||'tmp/design-start-study');
const seconds=Number(arg('seconds')||12),n=256;
if(!Number.isFinite(seconds)||seconds<=0)throw new Error('--seconds must be a positive number');
const chosen=arg('cases')?.split(',');
const source=await fs.readFile(path.join(root,'docs/design-start/assets/motif-library.js'),'utf8');
const library=JSON.parse(source.slice(source.indexOf(' = ')+3).trim().slice(0,-1));
const art=id=>id==='cat'?`<g transform="scale(${100/library.width})">${library.icons.cat}</g>`:motifs.find(m=>m.id===id).art;
// Freeze variable font weights: resvg does not apply CSS variation weights
// consistently to variable TTFs. Browser previews keep their original fonts.
const fontDir=path.join(root,'tmp/design-start-study-fonts');await fs.mkdir(fontDir,{recursive:true});
execFileSync('python3',['-c',`from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from pathlib import Path
import sys
for name,weight in [('nunito',800),('dancingscript',700)]:
 font=TTFont(Path(sys.argv[1])/(name+'.ttf'))
 font=instantiateVariableFont(font,{'wght':weight},inplace=True)
 font.save(Path(sys.argv[2])/(name+'.ttf'))
`,path.join(root,'docs/design-start/assets/fonts'),fontDir],{stdio:'pipe'});
for(const [id,name,weight]of[['nunito','StudyNunito','800'],['dancingscript','StudyDancing','700']])registerFont(path.join(fontDir,`${id}.ttf`),{family:name,weight});
const options={font:{fontFiles:['nunito','dancingscript'].map(id=>path.join(fontDir,`${id}.ttf`)),loadSystemFonts:false}};
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 200 200">${body}</svg>`;
function textTarget(value,family,woven){
 const ctx=createCanvas(200,200).getContext('2d');const weight=family==='StudyNunito'?800:700;ctx.font=`${weight} 48px ${family}`;const m=ctx.measureText(value),fsz=Math.min(48,48*182/m.width);ctx.font=`${weight} ${fsz}px ${family}`;const v=ctx.measureText(value),w=v.actualBoundingBoxLeft+v.actualBoundingBoxRight,h=v.actualBoundingBoxAscent+v.actualBoundingBoxDescent,y=(v.actualBoundingBoxAscent-v.actualBoundingBoxDescent)/2;
 const text=`<text x="${(v.actualBoundingBoxLeft-v.actualBoundingBoxRight)/2}" y="${y}" font-family="${family==='StudyNunito'?'Nunito':'Dancing Script'}" font-size="${fsz}" font-weight="${family==='StudyNunito'?800:700}" fill="${woven?'white':'black'}">${value}</text>`;
 const cells=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if((woven||r===0||c===0||r===7||c===7)&&(r+c)%2===0)cells.push(`<rect x="${c*25}" y="${r*25}" width="25" height="25" fill="black"/>`);
 return {body:`<rect width="200" height="200" fill="white"/>${cells.join('')}<g transform="translate(100 100) rotate(-45)">${woven?`<rect x="${-w/2-1}" y="${-h/2-1}" width="${w+2}" height="${h+2}" fill="black"/>`:''}${text}</g>`,region:frameRegion('diamond',.7,'fill="black"')};
}
const cases=[
 {id:'tree-circle-rays-8',label:'tree · circle · 8 radial sectors',body:motifArtwork(art('tree'),{rayCount:8}),region:frameRegion('circle',.64,'fill="black"')},
 {id:'checker-control',label:'Classic checker — control',body:frameArtwork({shape:'diamond',size:0,style:'check',cells:4,background:'white',foreground:'black'}),region:'<rect width="200" height="200" fill="black"/>'},
 ...[['tree','diamond','check'],['tree','circle','check'],['tree','circle','rays'],['tree','hexagon','check'],['star','circle','rays'],['heart','circle','check'],['cat','circle','check'],['tree','circle','plain']].map(([motif,shape,style])=>({id:`${motif}-${shape}-${style}`,label:`${motif} · ${shape} · ${style}`,body:motifArtwork(art(motif),{shape,style}),region:frameRegion(shape,.64,'fill="black"')})),
 ...[['ANNA','StudyNunito',false],['ANNA','StudyNunito',true],['Anna','StudyDancing',true]].map(([value,font,woven])=>({id:`text-${font}-${woven?'woven':'air'}`,label:`${value} · ${font} · ${woven?'dense weave':'open field'}`,...textTarget(value,font,woven)}))
] .filter(c=>!chosen||chosen.includes(c.id));
if(chosen?.some(id=>!cases.some(c=>c.id===id)))throw new Error('Unknown --cases entry');
await fs.mkdir(output,{recursive:true});
const server=await createServer({root,configFile:false,logLevel:'error',appType:'custom',server:{middlewareMode:true,hmr:false,watch:null,ws:false},resolve:{alias:{$lib:path.join(root,'src/lib')}}});
const {convertValidatedCutGeometry}=await server.ssrLoadModule('/src/lib/inverse/toHeartDesign.ts');
const {rasterizeDesign}=await server.ssrLoadModule('/src/lib/paint/rasterize.ts');
async function bitmap(text){const png=new Resvg(text,options).render().asPng(),ctx=createCanvas(n,n).getContext('2d');ctx.drawImage(await loadImage(png),0,0);const rgba=ctx.getImageData(0,0,n,n).data;return{png,rgba,mask:Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128))};}
function compare(a,b,region){let total=0,inside=0,outside=0,ic=0,oc=0;for(let i=0;i<a.length;i++){const diff=Number(a[i]!==b[i]);total+=diff;if(region[i]){inside+=diff;ic++;}else{outside+=diff;oc++;}}return{whole:total/a.length,motif:inside/Math.max(1,ic),frame:outside/Math.max(1,oc)};}
const rows=[],cfg={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0,width:100,minWidth:2,preferMatchingSheets:false};
try{
 for(const c of cases){
  const target=await bitmap(svg(c.body)),region=await bitmap(svg(`<rect width="200" height="200" fill="white"/>${c.region}`)),row={id:c.id,label:c.label};rows.push(row);
  const dir=path.join(output,c.id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'target.svg'),svg(c.body));await fs.writeFile(path.join(dir,'target.png'),target.png);
  row.targetHash=crypto.createHash('sha256').update(target.png).digest('hex');const at=performance.now();
  try{
   const p=prepare({type:'pixels',imageWidth:n,imageHeight:n,rgba:target.rgba},cfg),r=await design(p.target,cfg),woven=await renderExportedWeave(r.files['cut_geometry.json'],n);
   Object.assign(row,{checks:r.report.templateChecksPassed,geometry:r.report.validation.passed,paper:r.report.manufacturing.status,featureCheck:r.report.imageFidelity.features.passed,slits:r.report.slits,error:compare(target.mask,woven.mask,region.mask),reportedError:r.report.imageError?.mismatchFraction,warnings:r.report.warnings,nominalWidth:r.report.settings.nominalWidth});
   for(const [name,data]of Object.entries(r.files))await fs.writeFile(path.join(dir,name),data);
   await fs.writeFile(path.join(dir,'exported-weave.svg'),woven.svg);await fs.writeFile(path.join(dir,'exported-weave.png'),woven.png);
   try{const converted=convertValidatedCutGeometry(r.files['cut_geometry.json'],{name:c.label});row.editor={passed:true,error:compare(target.mask,rasterizeDesign(converted.design,n).data,region.mask)};await fs.writeFile(path.join(dir,'editor-design.json'),JSON.stringify(converted.design));}catch(e){row.editor={passed:false,error:e.message};}
  }catch(e){row.failure=e.message;}
  row.seconds=(performance.now()-at)/1000;console.log(JSON.stringify(row));await fs.writeFile(path.join(output,'results.json'),JSON.stringify({date:new Date().toISOString(),settings:cfg,resolution:n,physicalAssemblyTested:false,rows},null,2));
 }
}finally{await server.close();}

/** Verify the served Draw fill and the actual downloaded cutting geometry.
 * Curve IDs can be regenerated on SVG import; compare in geometric order. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232',out=process.env.INVERSE_TEST_OUTPUT||'tmp/clipped-editor-browser';await fs.mkdir(out,{recursive:true});
const loader=await createServer({configFile:false,cacheDir:path.resolve(out,'vite-cache'),server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
const rows=[];
try{
 const {parseHeartFromSVG}=await loader.ssrLoadModule('/src/lib/utils/heartDesign.ts');
 const {computeWeaveData}=await loader.ssrLoadModule('/src/lib/rendering/svgWeave.ts');
 const {heartPaintPaths}=await loader.ssrLoadModule('/src/lib/rendering/heartPaint.ts');
 for(const name of (process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',')){
  const browser=await browsers[name].launch({headless:true});
  try{for(const id of (process.env.INVERSE_TEST_DESIGNS||'classic-3x3,amy-pattern,triple-heart').split(',')){
   const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),row={browser:name,id,errors:[]};rows.push(row);
   try{
    page.on('pageerror',e=>row.errors.push(e.message));
    const original=parseHeartFromSVG(await(await fetch(origin+`/hearts/${id}.svg`)).text(),id+'.svg');
    const paint=heartPaintPaths(original.fingers,computeWeaveData(original.fingers,original.gridSize,original.weaveParity??0));assert.ok(paint.joined);
    await page.goto(origin+`/en/editor/?from=${id}`);
    await page.waitForFunction(expected=>{const g=document.querySelector('svg.heart-svg g[filter]');return g&&JSON.stringify([...g.querySelectorAll('path')].map(p=>p.getAttribute('d')))===JSON.stringify(expected);},[paint.left,paint.right]);
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();
    const file=path.join(out,`${name}-${id}.svg`);await(await pending).saveAs(file);
    const exported=parseHeartFromSVG(await fs.readFile(file,'utf8'),'exported.svg');
    const curves=d=>d.fingers.map(f=>({lobe:f.lobe,segments:f.segments})).sort((a,b)=>a.lobe.localeCompare(b.lobe)||(a.lobe==='left'?a.segments[0].p0.y-b.segments[0].p0.y:a.segments[0].p0.x-b.segments[0].p0.x));
    const a=curves(original),b=curves(exported);assert.equal(a.length,b.length);
    let maximum=0,coordinates=0;
    for(let i=0;i<a.length;i++){
     assert.equal(a[i].lobe,b[i].lobe);assert.equal(a[i].segments.length,b[i].segments.length);
     for(let j=0;j<a[i].segments.length;j++)for(const p of ['p0','p1','p2','p3'])for(const axis of ['x','y']){maximum=Math.max(maximum,Math.abs(a[i].segments[j][p][axis]-b[i].segments[j][p][axis]));coordinates++;}
    }
    assert.ok(maximum<1e-6,`Cutting geometry drifted by ${maximum}`);assert.deepEqual(row.errors,[]);
    await page.screenshot({path:path.join(out,`${name}-${id}.png`),fullPage:true});
    Object.assign(row,{maximumControlDrift:maximum,coordinates,passed:true});console.log(row);
   }catch(error){row.failure=error.stack;await page.screenshot({path:path.join(out,`${name}-${id}-failure.png`),fullPage:true});throw error;}finally{await context.close();}
  }}finally{await browser.close();}
 }
}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(rows,null,2)+'\n');await loader.close();dom.window.close();}

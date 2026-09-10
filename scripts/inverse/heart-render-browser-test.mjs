/** Check the production gallery SVG at fractional screen positions. The old
 * layered fill is a rendering reference, not a second reconstruction algorithm. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
import {createCanvas,loadImage} from 'canvas';

const browsers=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232';
const output=process.env.INVERSE_TEST_OUTPUT||'tmp/heart-render-browser';
const names=(process.env.INVERSE_TEST_BROWSERS||'chromium,firefox,webkit').split(',');
const ids=(process.env.INVERSE_TEST_DESIGNS||'classic-3x3').split(',');
await fs.mkdir(output,{recursive:true});
const loader=await createServer({configFile:false,cacheDir:path.resolve(output,'vite-cache'),server:{middlewareMode:true,hmr:false},resolve:{alias:{$lib:path.resolve('src/lib')}}});
const report={origin,method:'Production gallery SVG, fractional CSS offsets, both paper palettes; pixel samples across uniform lobe joins.',results:[]};
try{
  const {computeWeaveData}=await loader.ssrLoadModule('/src/lib/rendering/svgWeave.ts');
  const {heartPaintPaths}=await loader.ssrLoadModule('/src/lib/rendering/heartPaint.ts');
  const {rasterizeDesign}=await loader.ssrLoadModule('/src/lib/paint/rasterize.ts');
  const catalog=JSON.parse(await fs.readFile('src/lib/data/heart-designs.json','utf8'));
  for(const name of names){
    const browser=await browsers[name].launch({headless:true});
    try{for(const id of ids){
      const design=catalog[id],weave=computeWeaveData(design.fingers,design.gridSize,design.weaveParity),o=weave.overlap,paint=heartPaintPaths(design.fingers,weave);
      assert.equal(paint.joined,true,`${id} must use continuous fill contours`);
      const mask=rasterizeDesign(design,400).data;
      const probes={top:[],left:[]};
      for(const join of ['top','left'])for(let pos=24;pos<376;pos+=4){
        let uniform=true;
        for(let inset=0;inset<16;inset++)for(let offset=-16;offset<=16;offset++){
          const x=join==='top'?pos+offset:inset,y=join==='top'?inset:pos+offset;
          if(mask[y*400+x]!==Number(join==='top'))uniform=false;
        }
        if(uniform)probes[join].push((pos+.5)/400);
      }
      for(const join of ['top','left'])assert.ok(probes[join].length>0,`${id}: no uniform ${join} join to sample`);
      const live=await browser.newPage(),errors=[];
      live.on('pageerror',e=>errors.push(e.message));
      await live.goto(origin+`/en/hjerte/${id}/`);
      const svg=live.locator('svg.paper-heart-svg').first();await svg.waitFor();
      const markup=await svg.evaluate(el=>el.outerHTML);
      const dom=new JSDOM(markup,{contentType:'image/svg+xml'}),root=dom.window.document.documentElement;
      assert.deepEqual([...root.querySelectorAll('path')].map(p=>p.getAttribute('d')),[paint.left,paint.right],'Served gallery is stale or uses different fill geometry');
      assert.deepEqual(errors,[]);await live.close();
      for(const {size,dpr}of [{size:144,dpr:1},{size:600,dpr:1},{size:267,dpr:2}]){
        const context=await browser.newContext({viewport:{width:650,height:650},deviceScaleFactor:dpr}),page=await context.newPage();
        try{
          for(const [palette,colors]of [['paper',['#ffffff','#b91313']],['swapped',['#173e66','#ffff00']]]){
            const row={browser:name,design:id,version:browser.version(),size,dpr,palette,before:{},after:{}};report.results.push(row);
            for(const variant of ['before','after']){
              const [left,right]=colors,group=root.querySelector('g');
              group.innerHTML=variant==='after'?`<path d="${paint.left}" fill="${left}"/><path d="${paint.right}" fill="${right}" fill-rule="evenodd"/>`:
                `<defs><clipPath id="old-clip"><rect x="${o.left}" y="${o.top}" width="${o.width}" height="${o.height}"/></clipPath></defs><path d="${weave.leftLobeClip}" fill="${left}"/><path d="${weave.rightLobeClip}" fill="${right}"/><g clip-path="url(#old-clip)"><rect x="${o.left}" y="${o.top}" width="${o.width}" height="${o.height}" fill="${left}"/><path d="${[...weave.rightOnTopStrips,...weave.leftOnTopStrips].map(s=>s.pathData).join(' ')}" fill="${right}" fill-rule="evenodd"/></g>`;
              await page.setContent(`<style>body{margin:0;background:#d6e1d0}svg{display:block;margin:23.4px 17.2px;width:${size}px;height:${size}px}</style>${root.outerHTML}`);
              const samples=await page.evaluate(({o,dpr,probes})=>{
                const matrix=document.querySelector('svg > g').getScreenCTM(),point=(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(matrix);return{x:p.x*dpr,y:p.y*dpr};};
                return{top:probes.top.map(t=>point(o.left+o.width*t,o.top)),left:probes.left.map(t=>point(o.left,o.top+o.height*t))};
              },{o,dpr,probes});
              const bytes=await page.screenshot(),im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
              const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
              for(const [join,points]of Object.entries(samples)){
                const color=join==='top'?right:left,rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));let max=0,sum=0,n=0;
                for(const p of points)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
                  const k=4*((Math.floor(p.y)+y)*canvas.width+Math.floor(p.x)+x),error=Math.max(...rgb.map((v,c)=>Math.abs(v-rgba[k+c])));max=Math.max(max,error);sum+=error;n++;
                }
                row[variant][join]={max,mean:sum/n};
                if(variant==='after')assert.ok(max<=1,`${name} ${id} ${size}@${dpr} ${palette} ${join}: seam error ${max}`);
              }
              if(size===600&&palette==='paper')await fs.writeFile(path.join(output,`${name}${ids.length>1?'-'+id:''}-${variant}.png`),bytes);
            }
            assert.ok(row.before.top.max>5,'Reference did not reproduce the lobe seam');
            row.passed=true;
            console.log(`${name} ${id} ${size}@${dpr} ${palette}: top ${row.before.top.max} → ${row.after.top.max}, left ${row.before.left.max} → ${row.after.left.max}`);
          }
        }finally{await context.close();}
      }
      dom.window.close();
    }}finally{await browser.close();}
  }
}finally{
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await loader.close();
}

/** Check production entry loading without relying on old content-hashed names. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(Object.keys(args).some(k=>!['output','baseline-assets','baseline-loading'].includes(k))||!args.output)
  throw new Error('Use --output=<new directory>, optionally with --baseline-assets=<json> and --baseline-loading=<json>.');
assert.equal(Boolean(args['baseline-assets']),Boolean(args['baseline-loading']),'Supply both baseline records together.');
const out=path.resolve(args.output),relative=path.relative(process.cwd(),out);
assert.ok(relative&&!relative.startsWith('../')&&relative!=='..'&&!path.isAbsolute(relative),'Output must be inside this worktree.');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const origin=new URL(process.env.INVERSE_TEST_URL||'http://127.0.0.1:5232').origin;
const report={origin,scope:'Fresh Draw/Paint contexts before a solver action. Verify served application bytes, deferred solver/WASM loading, and optional bundle-size comparison. Hash/filename equality across separate builds is not required.',rows:[]};
const baseline=args['baseline-assets']&&JSON.parse(await fs.readFile(args['baseline-assets']));
const oldLoading=args['baseline-loading']&&JSON.parse(await fs.readFile(args['baseline-loading']));
const assets=[];
for(const file of await fs.readdir('build/_app/immutable',{recursive:true})){
  const name=path.posix.join('_app/immutable',file),full=path.join('build',name);
  if(!(await fs.stat(full)).isFile())continue;
  const bytes=await fs.readFile(full);assets.push({file:name,bytes:bytes.length,sha256:sha(bytes)});
}
assert.ok(assets.length,'Build the production application first.');
report.applicationAssets=assets;
report.buildVersion=JSON.parse(await fs.readFile('build/_app/version.json'));
const sizes=rows=>rows.map(r=>r.bytes).sort((a,b)=>a-b);
const total=rows=>rows.reduce((s,r)=>s+r.bytes,0);
const oldAssets=baseline?.assets.filter(r=>r.file.startsWith('_app/immutable/'));
if(baseline){
  assert.ok(oldAssets.length);
  report.baseline={commit:baseline.commit,assetsFile:args['baseline-assets'],loadingFile:args['baseline-loading'],assetsSha256:sha(await fs.readFile(args['baseline-assets'])),loadingSha256:sha(await fs.readFile(args['baseline-loading']))};
  report.applicationComparison={beforeBytes:total(oldAssets),afterBytes:total(assets),beforeCount:oldAssets.length,afterCount:assets.length,identicalContent:assets.filter(r=>oldAssets.some(o=>o.sha256===r.sha256)).length};
}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try{
  for(const route of ['/en/editor/','/en/editor/paint/']){
    const context=await browser.newContext(),page=await context.newPage(),requests=[],pending=[],responses=new Map();
    const row={route,errors:[],failedRequests:[],engine:[]};report.rows.push(row);
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    page.on('request',r=>requests.push({url:r.url(),type:r.resourceType()}));
    page.on('pageerror',e=>row.errors.push(e.message));
    page.on('requestfailed',r=>{if(new URL(r.url()).origin===origin)row.failedRequests.push({url:r.url(),failure:r.failure()});});
    page.on('response',response=>{
      const url=new URL(response.url());
      if(url.origin!==origin)return;
      if(response.status()>=400)row.errors.push(`HTTP ${response.status()}: ${url.pathname}`);
      if(!url.pathname.startsWith('/_app/immutable/'))return;
      pending.push((async()=>{
        const file=url.pathname.slice(1),expected=assets.find(r=>r.file===file);
        assert.ok(expected,`Served application asset is absent from this build: ${file}`);
        const bytes=await response.body();assert.equal(sha(bytes),expected.sha256,`Served bytes: ${file}`);
        responses.set(file,{...expected,url:response.url(),type:response.request().resourceType()});
      })().catch(e=>row.errors.push(e.message)));
    });
    try{
      await page.goto(origin+route);
      await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--paper-left')!=='');
      await page.waitForLoadState('networkidle');await Promise.all(pending);
      row.engine=requests.filter(r=>new URL(r.url).pathname.startsWith('/inverse/')||new URL(r.url).pathname.endsWith('.wasm'));
      row.scripts=[...responses.values()].filter(r=>r.type==='script');
      assert.ok(row.scripts.length,'The hydrated page must load application scripts.');
      assert.deepEqual(row.engine,[]);assert.deepEqual(row.errors,[]);assert.deepEqual(row.failedRequests,[]);
      if(baseline){
        const oldRow=oldLoading.rows.find(r=>r.route===route);assert.ok(oldRow,`Missing baseline route ${route}`);
        const oldScripts=[...new Set(oldRow.scripts.map(r=>new URL(r.url)).filter(url=>url.origin===new URL(oldLoading.origin).origin&&url.pathname.startsWith('/_app/immutable/')).map(url=>url.pathname.slice(1)))].map(file=>{
          const asset=oldAssets.find(r=>r.file===file);assert.ok(asset,`Missing baseline asset ${file}`);return asset;
        });
        row.scriptComparison={beforeBytes:total(oldScripts),afterBytes:total(row.scripts),beforeCount:oldScripts.length,afterCount:row.scripts.length};
        // Filename changes propagate through importers whenever SvelteKit's
        // generated build version changes. Size checks do not imply byte equality.
        assert.deepEqual(sizes(row.scripts),sizes(oldScripts),`Initial script sizes changed for ${route}`);
      }
      row.passed=true;
    }finally{await context.close();}
  }
  if(baseline)for(const ext of ['.js','.css'])assert.deepEqual(sizes(assets.filter(r=>r.file.endsWith(ext))),sizes(oldAssets.filter(r=>r.file.endsWith(ext))),`Built ${ext} sizes changed`);
  report.passed=true;
}catch(e){report.error=e.message;throw e;}
finally{
  await browser.close();report.harnessSha256=sha(await fs.readFile(new URL(import.meta.url)));
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,comparison:report.applicationComparison,rows:report.rows.map(r=>({route:r.route,passed:r.passed,scriptComparison:r.scriptComparison}))}));

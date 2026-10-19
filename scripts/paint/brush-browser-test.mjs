/** Real Paint pointer/keyboard QA. One browser, no solver or network images.
 * PAINT_TEST_URL, PLAYWRIGHT_MODULE and PLAYWRIGHT_CHROME override local setup.
 * Optional PAINT_QA_DIR saves two small UI screenshots.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PAINT_TEST_URL||'http://localhost:4173';
const executablePath=process.env.PLAYWRIGHT_CHROME;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const errors=[];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
// Chromium may switch its canvas rasterizer after repeated readbacks. Compare
// flat paper interiors rather than requiring identical antialias bytes at edges.
// Exact binary mask restoration is separately covered by the gesture tests.
function sameInterior(actual,expected,message){
 assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
 const {width:w,height:h,data:a}=actual,b=expected.data;let checked=0,changed=0;
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
  const i=4*(y*w+x);
  if([-2,0,2].some(dy=>[-2,0,2].some(dx=>[0,1,2,3].some(k=>b[i+4*(dy*w+dx)+k]!==b[i+k]))))continue;
  checked++;if([0,1,2,3].some(k=>a[i+k]!==b[i+k]))changed++;
 }
 assert.ok(checked>10000);assert.equal(changed,0,message);
}
try{
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/en/editor/paint/`,{waitUntil:'networkidle'});
 const canvas=page.locator('.mask-canvas canvas').first();await canvas.waitFor();await settle(page);
 const slider=page.locator('.brush-field input[type=range]');
 const swatches=page.locator('.swatches button');assert.equal(await swatches.count(),3);
 assert.equal(await slider.inputValue(),'6');
 assert.match(await swatches.nth(2).getAttribute('aria-label'),/XOR.*swap/);
 const size=async n=>{
  await slider.press('Home');
  for(let value=1;value<n;value++)await slider.press('ArrowRight');
  assert.equal(await slider.inputValue(),String(n));await settle(page);
 };
 const box=await canvas.boundingBox(),R=Math.SQRT1_2;
 const scale=Math.min((box.width-48)/(1+R),(box.height-48)/(.5+1.5*R));
 const centre={x:box.x+box.width/2,y:box.y+box.height/2-(R/2-.5)/2*scale};
 const point=offset=>({x:centre.x+offset*scale,y:centre.y});
 const pixel=async p=>canvas.evaluate((c,{p,box})=>Array.from(c.getContext('2d').getImageData(Math.round((p.x-box.x)*c.width/box.width),Math.round((p.y-box.y)*c.height/box.height),1,1).data),{p,box});
 const snapshot=async()=>{
  const image=await loadImage(await canvas.evaluate(c=>c.toDataURL()));
  const c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);
  return ctx.getImageData(0,0,c.width,c.height);
 };
 await size(24);await swatches.nth(1).click();await page.mouse.click(centre.x,centre.y);
 await page.waitForFunction(({p,box})=>{
  const c=document.querySelector('.mask-canvas canvas');
  const [r,g]=c.getContext('2d').getImageData(Math.round((p.x-box.x)*c.width/box.width),Math.round((p.y-box.y)*c.height/box.height),1,1).data;
  return r>g*2;
 },{p:centre,box},{timeout:3000});await settle(page);
 const red=await pixel(centre),left=point(-.16),right=point(.16),white=await pixel(left);
 assert.notDeepEqual(red,white,'Create a red patch on the white mask through the UI.');
 const before=await snapshot();
 await swatches.nth(2).click();await size(7);await page.mouse.move(centre.x,centre.y);await settle(page);
 const outline=page.locator('.brush-outline');assert.equal(await outline.count(),1);
 const ring=await outline.boundingBox();assert.ok(Math.abs(ring.width-14*scale/400)<.2);
 assert.ok(Math.abs(ring.x+ring.width/2-centre.x)<1);
 assert.equal(await outline.evaluate(e=>getComputedStyle(e).pointerEvents),'none');
 // An actual keyboard step and arbitrary slider value both change the outline.
 await page.keyboard.press('Tab');await page.keyboard.press(']');assert.equal(await slider.inputValue(),'8');
 await size(7);await page.mouse.move(centre.x,centre.y);await settle(page);
 const gesture=async()=>{
  await page.mouse.move(left.x,left.y);await page.mouse.down();
  await page.mouse.move(right.x,right.y,{steps:18});
  await page.mouse.move(left.x,left.y,{steps:18});
  await page.mouse.up();await settle(page);
 };
 await gesture();
 assert.deepEqual(await pixel(centre),white,'XOR changes red to white even after retracing.');
 assert.deepEqual(await pixel(left),red,'XOR changes white to red once in the same stroke.');
 const inverted=await snapshot();
 await page.locator('.history button').nth(0).click();await settle(page);
 sameInterior(await snapshot(),before,'One undo restores the whole XOR gesture.');
 assert.deepEqual(await pixel(centre),red);assert.deepEqual(await pixel(left),white);
 await page.locator('.history button').nth(1).click();await settle(page);
 sameInterior(await snapshot(),inverted,'Redo restores the XOR gesture.');
 await gesture();sameInterior(await snapshot(),before,'Repeating a separate XOR stroke restores both colours.');
 await page.mouse.move(centre.x,centre.y);await size(19);await page.mouse.move(centre.x,centre.y);await settle(page);
 assert.ok(Math.abs((await outline.boundingBox()).width-38*scale/400)<.2);
 if(process.env.PAINT_QA_DIR){await fs.mkdir(process.env.PAINT_QA_DIR,{recursive:true});await page.screenshot({path:`${process.env.PAINT_QA_DIR}/brush-desktop.png`});}
 await page.mouse.move(0,0);assert.equal(await outline.count(),0,'Leaving the canvas removes the outline.');
 await page.goto(`${base}/editor/mal/`,{waitUntil:'networkidle'});
 assert.match(await page.locator('.swatches button').nth(2).getAttribute('aria-label'),/byt farven/);
 assert.equal(await page.locator('.brush-field input').getAttribute('aria-label'),'Pensel');
 await page.setViewportSize({width:390,height:844});await settle(page);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page has no horizontal overflow.');
 await page.locator('.paper-row').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('.swatches button').count(),3);
 const mobileRow=await page.locator('.paper-row').boundingBox();assert.ok(mobileRow.x>=0&&mobileRow.x+mobileRow.width<=390);
 if(process.env.PAINT_QA_DIR)await page.screenshot({path:`${process.env.PAINT_QA_DIR}/brush-mobile.png`});
 assert.deepEqual(errors,[]);console.log('PASS Paint XOR retracing, two-colour round trip, undo/redo, slider, keyboard, hover geometry, both languages and mobile layout.');
}finally{await browser.close();}

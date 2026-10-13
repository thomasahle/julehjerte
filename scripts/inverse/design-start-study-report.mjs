/** Build the review page from saved, fresh solver runs; never invent cut paths.
 * Run design-start-study.mjs with the three groups documented in the report first.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas,loadImage} from 'canvas';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'docs/design-start/study');
await fs.mkdir(out,{recursive:true});
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>(100*n).toFixed(2)+'%';
const sources=[['initial','design-start-study-initial'],['text','design-start-text-study'],['retry','design-start-frame-retries']];
const runs=[],rows=[];
for(const [group,folder]of sources){
 const run=await read(path.join(root,'tmp',folder,'results.json'));
 // Initial text run used variable fonts whose renderer ignored the requested
 // weight. Only the corrected, frozen-font text run is included in the study.
 const selected=run.rows.filter(r=>group!=='initial'||!r.id.startsWith('text-'));
 runs.push({group,...run,rows:selected});
 for(const row of selected)rows.push({...row,group,folder,key:group+'-'+row.id,timeLimit:run.settings.timeLimit});
}
async function mask(file){
 const img=await loadImage(await fs.readFile(file)),n=img.width;
 const ctx=createCanvas(n,n).getContext('2d');ctx.drawImage(img,0,0);
 const rgba=ctx.getImageData(0,0,n,n).data;
 return{n,data:Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128))};
}
function maskPath({n,data}){
 const p=[];
 for(let y=0;y<n;y++)for(let x=0;x<n;){
  if(!data[y*n+x]){x++;continue;}
  const start=x;while(x<n&&data[y*n+x])x++;
  p.push(`M${start} ${y}h${x-start}v1H${start}Z`);
 }
 return `<path d="${p.join('')}"/>`;
}
function heart(bitmap,difference=false){
 const paper=difference?'#f0f0eb':'#fff9ed',ink=difference?'#7852bc':'#b82535';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 350"><g transform="translate(100 80) rotate(45 100 100)"><path d="M0 0A100 100 0 0 0 0 200L200 200V0Z" fill="${paper}"/><path d="M0 0A100 100 0 0 1 200 0V200H0Z" fill="${difference?paper:ink}"/><g transform="scale(${200/bitmap.n})"><rect width="${bitmap.n}" height="${bitmap.n}" fill="${paper}"/><g fill="${ink}">${maskPath(bitmap)}</g></g></g></svg>`;
}
function cutDrawing(data,family){
 const w=data.square_width_mm;
 const paths=data[family+'_overlap_paths'].map(slit=>{
  const d=slit.map((ref,i)=>{
   const cp=data.curves[ref.curve].control_points.slice();if(ref.reverse)cp.reverse();
   return (i===0?`M${cp[0].join(',')}`:'')+`C${cp.slice(1).map(p=>p.join(',')).join(' ')}`;
  }).join('');
  return `<path d="${d}"/>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 ${w+6} ${w+6}"><rect width="${w}" height="${w}" fill="#fff9ed" stroke="#bbc8b9" stroke-width=".5"/><g fill="none" stroke="${family==='A'?'#b82535':'#2e5041'}" stroke-width=".7">${paths}</g></svg>`;
}
const names={
 'checker-control':'Classic checker · control',
 'tree-circle-rays-8':'Tree · circle · four broad rays',
 'tree-diamond-check':'Tree · diamond · checker',
 'tree-circle-check':'Tree · circle · checker',
 'tree-hexagon-check':'Tree · hexagon · checker',
 'tree-circle-rays':'Tree · circle · eight narrow rays',
 'star-circle-rays':'Star · circle · eight narrow rays',
 'heart-circle-check':'Heart · circle · checker',
 'cat-circle-check':'Phosphor cat · circle · checker',
 'tree-circle-plain':'Tree · circle · plain outline',
 'text-StudyNunito-air':'ANNA · Nunito 800 · open field',
 'text-StudyNunito-woven':'ANNA · Nunito 800 · weave to text',
 'text-StudyDancing-woven':'Anna · Dancing Script 700 · weave to text'
};
const notes={
 'tree-circle-rays-8':'Four broad red rays (eight alternating sectors) needed only two cuts per sheet. A promising first paper trial; low cut count alone does not establish easy assembly.',
 'tree-diamond-check':'The three tested shapes all preserved this simple tree with three cuts per sheet.',
 'tree-circle-check':'A circular field is compatible with a checker surround in this case.',
 'tree-hexagon-check':'The hexagonal field also worked for this tree at this size.',
 'tree-circle-rays':'The narrower rays distorted both the tree and its surround. A longer search helped slightly but did not pass.',
 'star-circle-rays':'This radial composition did not pass the image checks in the allotted search.',
 'heart-circle-check':'Whole-image error is below 3%, but two interior regions were lost. The feature check correctly rejects it.',
 'cat-circle-check':'Seven interior regions were lost. A silhouette or a redesigned cat may be a better starting point; this test does not establish impossibility.',
 'tree-circle-plain':'A plain outline was harder than a structured surround. One interior region was lost.',
 'text-StudyNunito-air':'Three interior regions were lost; a readable font preview is not enough to produce the intended woven letters.',
 'text-StudyNunito-woven':'Extending the checker to the text helped the overall image, but two letter regions were still lost.',
 'text-StudyDancing-woven':'Whole-image error is below 3%, but one interior region was lost. Handwriting needs a stricter check than global similarity.',
 'checker-control':'The familiar weave provides a zero-error control for the rendering and comparison.'
};
const cards=new Map();
for(const r of rows){
 const src=path.join(root,'tmp',r.folder,r.id),dest=path.join(out,r.key);await fs.mkdir(dest,{recursive:true});
 const target=await mask(path.join(src,'target.png')),woven=await mask(path.join(src,'exported-weave.png'));
 const diff={n:target.n,data:target.data.map((v,i)=>Number(v!==woven.data[i]))};
 for(const [name,data]of [['target',target],['woven',woven],['difference',diff]])await fs.writeFile(path.join(dest,name+'.svg'),heart(data,name==='difference'));
 const geometry=await read(path.join(src,'cut_geometry.json'));
 for(const family of ['A','B'])await fs.writeFile(path.join(dest,'cuts-'+family+'.svg'),cutDrawing(geometry,family));
 const passed=r.checks&&r.editor.passed&&r.error.motif<.01&&r.editor.error.motif<.01;
 if(passed)for(const name of ['print_templates.html','cut_geometry.json','editor-design.json'])await fs.copyFile(path.join(src,name),path.join(dest,name));
 const asset=(name,label)=>`<figure><img src="${r.key}/${name}.svg" alt="${esc(label+' — '+names[r.id])}" loading="lazy"><figcaption>${label}</figcaption></figure>`;
 cards.set(r.key,`<article class="case" id="${r.key}"><div class="case-heading"><h3>${esc(names[r.id])}${r.group==='retry'&&r.id!=='tree-circle-rays-8'?' · longer search':''}</h3><span class="badge ${passed?'pass':'fail'}">${passed?'Candidate for paper trial':'Needs work'}</span></div><div class="comparison">${asset('target','Requested picture')}${asset('woven','Rendered from actual cuts')}${asset('difference','Differences in purple')}</div><div class="metrics"><span>Central field <b>${pct(r.error.motif)}</b> changed</span><span>Whole square <b>${pct(r.error.whole)}</b> changed</span><span><b>${r.slits.left} + ${r.slits.right}</b> cuts</span><span><b>${r.seconds.toFixed(1)} s</b> elapsed</span></div><p>${notes[r.id]}</p><details><summary>Cut paths and validation details</summary><div class="cuts">${asset('cuts-A','Sheet A · overlap square')}${asset('cuts-B','Sheet B · overlap square')}</div><p>Both diagrams use the common overlap coordinates. The printable sheets include the rounded tops and fold marks.</p><dl><dt>Geometry</dt><dd>${r.geometry?'Pass':'Fail'}</dd><dt>Paper connectivity model</dt><dd>${esc(r.paper)}</dd><dt>Image feature preservation</dt><dd>${r.featureCheck?'Pass':'Fail'}</dd><dt>All existing engine checks</dt><dd>${r.checks?'Pass':'Fail'}</dd><dt>Editor geometry after conversion</dt><dd>${r.editor.passed?'Pass':'Fail'}</dd><dt>Central error after editor conversion</dt><dd>${r.editor.passed?pct(r.editor.error.motif):esc(r.editor.error)}</dd><dt>Frame-only error</dt><dd>${pct(r.error.frame)}</dd><dt>Search time setting</dt><dd>${r.timeLimit} seconds (soft limit)</dd></dl></details>${passed?`<p><a class="button" href="${r.key}/print_templates.html">Open both test templates →</a> <a href="${r.key}/cut_geometry.json" download>Cut geometry</a> · <a href="${r.key}/editor-design.json" download>Editor design</a></p>`:''}</article>`);
}
const primary=rows.filter(r=>r.group!=='retry'||r.id==='tree-circle-rays-8');
primary.sort((a,b)=>Number(b.id==='tree-circle-rays-8')-Number(a.id==='tree-circle-rays-8'));
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({physicalAssemblyTested:false,runs},null,2)+'\n');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>From motif to woven heart · Juleflet study</title><style>
*{box-sizing:border-box}body{margin:0;background:#f9f9f3;color:#1e2a25;font:16px/1.6 system-ui,sans-serif}a{color:#2e5041;text-underline-offset:3px}header{background:#d6e1d0;padding:36px max(24px,calc((100vw - 1060px)/2)) 42px}header a{font-weight:650}h1{font-size:clamp(32px,4.3vw,54px);line-height:1.08;letter-spacing:-.035em;margin:28px 0 18px}h2{font-size:28px;line-height:1.2;margin:44px 0 18px}h3{font-size:20px;line-height:1.3;margin:0}p{max-width:78ch}.lead{font-size:21px;max-width:65ch}.kicker{letter-spacing:.12em;font-size:12px;text-transform:uppercase}.wrap{max-width:1108px;margin:auto;padding:0 24px 70px}.callout{background:#e7eee0;border-left:4px solid #2e5041;padding:12px 22px;margin:28px 0}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.steps article{padding:22px;background:white;border:1px solid #cfd9cf;border-radius:12px}.steps b{font-size:20px}.case{margin:24px 0;padding:24px;background:#fff;border:1px solid #cfd9cf;border-radius:14px;scroll-margin-top:20px}.case-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.badge{font-size:12px;font-weight:650;white-space:nowrap;padding:5px 10px;border-radius:20px}.pass{background:#e0ebdd;color:#274c35}.fail{background:#f5e6d4;color:#785018}.comparison{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.comparison img{width:100%;display:block}.comparison figure{background:#f9f9f3;border-radius:9px;padding:10px}.comparison figcaption{text-align:center;font-size:13px;color:#5f6d66}figure{margin:0}.metrics{display:flex;flex-wrap:wrap;gap:10px 24px;font-size:13px}.metrics b{font-size:17px}.cuts{display:grid;grid-template-columns:repeat(2,minmax(0,240px));gap:24px;margin:20px 0}.cuts img{display:block;width:100%}.cuts figcaption{font-size:13px}details{padding:12px 0}summary{cursor:pointer;color:#2e5041;font-weight:600}dl{display:grid;grid-template-columns:minmax(170px,330px) auto;gap:6px;font-size:14px}dd{margin:0}li{margin:9px 0}.button{display:inline-block;background:#2e5041;color:white;padding:9px 15px;border-radius:8px;text-decoration:none;margin-right:10px}pre{overflow:auto;background:#e7eee0;padding:18px;border-radius:8px;font-size:12px}code{font-size:.88em;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:12px 10px;text-align:left;border-bottom:1px solid #cfd9cf;vertical-align:top}nav{display:flex;flex-wrap:wrap;gap:8px 20px}footer{margin-top:50px;color:#5f6d66;font-size:13px}@media(max-width:650px){.wrap{padding:0 16px 45px}header{padding:25px 20px 32px}.steps{grid-template-columns:1fr}.case{padding:16px}.case-heading{display:block}.badge{display:inline-block;margin-top:10px}.comparison{gap:4px}.comparison figure{padding:3px}.comparison figcaption{font-size:10px;line-height:1.3;min-height:30px}.metrics{gap:8px 18px}dl{grid-template-columns:1fr 1fr}.button{margin-bottom:8px}h2{font-size:25px}}
</style></head><body><header><a href="../#figure">← Back to the design mockup</a><p class="kicker">Juleflet · feasibility study · 13 October 2026</p><h1>From a picture to<br>a heart you can weave</h1><p class="lead">Circular frames can work. The existing solver found accurate cutting paths for a tree with broad rays, and for the same tree in three checker frames. Arbitrary icons and ordinary font lettering still need more work.</p><nav><a href="#requirements">What the geometry requires</a><a href="#results">See actual results</a><a href="#implementation">Implementation plan</a><a href="#method">Method &amp; reproduction</a></nav></header><main class="wrap">
<div class="callout"><p><strong>These are fresh solver results, not decorative previews.</strong> Every “rendered from actual cuts” image comes from exported Bézier cutting paths. The successful candidates also pass the current geometry, paper-connectivity and feature checks. None has been assembled in paper yet.</p></div>
<section id="requirements"><h2>The frame is part of the weaving structure</h2><p>A motif outline cannot simply become a cutting line. The program has to distribute its boundaries between two sheets of folded paper, continuing each cut to the appropriate edges. In the overlap, each sheet is divided into fingers; alternating which paper shows produces the picture.</p><div class="steps"><article><b>1. Preserve the picture</b><p>Protect the whole central field: the red motif <em>and</em> its cream background. Small eyes, letter holes and gaps matter even when they occupy very few pixels.</p></article><article><b>2. Find two sets of cuts</b><p>Within a sheet, paths must stay separate and must not cross themselves. Cuts on opposite sheets can follow the same route: their two colour changes cancel, allowing a hidden connection through an otherwise plain area.</p></article><article><b>3. Keep usable paper</b><p>Cut paths must leave connected, sufficiently wide fingers. Check the unfolded paper too, then check the picture again after conversion to the editor and printable geometry.</p></article></div><p>The colour at a point follows the parity of the cuts crossed on the two sheets, together with a global starting colour. One crossing flips the colour; two crossings cancel. This is why hidden shared cuts are useful, and why surrounding rays or checker squares can provide routes that a plain outline does not.</p><p>At a 100 mm overlap width, this study requested 2 mm usable paper, allowed 0.25 mm cutting error on either side and used the solver’s default 0.2% shrink allowance. That requires about <strong>2.505 mm nominal separation</strong>. The same motif made smaller may fail. Sharp hooks and awkward turns can also make assembly difficult despite passing these numerical checks.</p></section>
<section id="results"><h2>What worked, and what lost details</h2><p>Thirteen distinct compositions, plus two longer-search comparisons. Red is one paper colour; cream is the other. Purple marks changed pixels in the overlap square. “Central field” includes the motif and its surrounding background inside the selected frame. Lower error is better.</p><p>The four-ray example has eight alternating red/cream sectors. The eight-ray examples have sixteen sectors. Only the former passed in these runs. The mockup now offers both and starts with the broader rays.</p>${primary.map(r=>cards.get(r.key)).join('')}<details><summary>Two longer searches: narrow rays and the cat</summary><p>Increasing the search setting from 12 to 30 seconds did not rescue either composition. This is a limit of these searches, not a proof that no construction exists.</p>${rows.filter(r=>r.group==='retry'&&r.id!=='tree-circle-rays-8').map(r=>cards.get(r.key)).join('')}</details></section>
<section id="implementation"><h2>How I would build the real feature</h2><table><thead><tr><th>Stage</th><th>Implementation</th><th>What the person sees</th></tr></thead><tbody><tr><td>Compose</td><td>Use the selected SVG motif or font outlines, physical heart size, central frame and surround as a reproducible target.</td><td>“Dit motiv” with circle, diamond or hexagon; rays, checker or plain surround.</td></tr><tr><td>Find a weave</td><td>Reuse the inverse worker. Try a small set of frame densities, phases and cut counts. Prefer fewer, wider fingers while preserving the centre.</td><td>“Find en fletning” with progress, cancellation and useful alternative designs.</td></tr><tr><td>Check and compare</td><td>Require geometry, paper, image-feature and central-field checks. Render the converted editor design and compare again.</td><td>The actual woven result beside the requested picture. Make visible adjustments explicit.</td></tr><tr><td>Print and guide</td><td>Reuse the editor and PDF pipeline after validation. Store the source composition and settings so it can be regenerated.</td><td>Actual-size templates, fold/cut marks, and guidance appropriate to the found cuts.</td></tr></tbody></table>
<p><strong>The first release should use a small set of tested combinations.</strong> Start with simple silhouettes, selected sizes and a few frame recipes. Keep the large icon library available for experimentation, but a searchable icon is not automatically a verified weaving pattern. Simplify troublesome details, enlarge the heart, or propose a different frame when a search fails.</p>
<p><strong>Give the solver real freedom outside the motif.</strong> The paint editor already has circle, diamond and hexagon regions. Its current “free” frame substitutes a checker band before solving; it does not optimize an unconstrained surround. A future weighted objective should strongly protect the centre and treat the requested outer pattern as a preference. The same weighting must govern initialization, refinement, candidate selection and final acceptance. White pixels in the centre must not become “don’t care” pixels.</p>
<p><strong>Close a gap in the existing acceptance flow.</strong> The engine emits files even when <code>templateChecksPassed</code> is false. The paint UI converts the returned cuts and checks editor geometry, but that alone does not enforce the engine’s full paper and image-feature result. Every failed picture in this study still passed editor geometry. The new flow must use both sets of checks, then verify the converted result’s fidelity.</p>
<p><strong>Text needs its own construction strategy.</strong> The tested ordinary fonts lost letter details, including with the weave extended to the lettering. Convert selected fonts to actual glyph outlines for consistent geometry, then check counters, thin strokes and spacing. For a reliable starting point, use letters designed for weaving and test short names before offering arbitrary fonts. <a href="https://cs.au.dk/~gerth/julehjerter/">Gerth’s generator</a> has special letter constructions and marks gray areas that must be cut out; that is beyond the current editor’s finger-only representation. Supporting those cut-outs requires an explicit geometry/export extension, or a different letter construction that avoids them. We have not copied his glyphs or generator.</p>
<p><strong>Make image acceptance local as well as global.</strong> The current 3% whole-image limit can hide missing eyes or letter holes. The existing feature audit catches several such failures here, but it has minimum feature sizes and is not a complete topology guarantee. I propose a stricter central-field comparison (initially under 1% changed pixels), explicit hole/component checks at print size, and visual review of the actual result. The 1% value is a proposed product threshold, not proof of correctness.</p>
<p><strong>The next physical trial is concrete.</strong> Print the broad-ray tree and the circle/checker tree at 100%, measure the 20 mm calibration line, transfer each template to folded paper and follow its cut/fold marks. Record where fingers snag, whether narrow areas tear and whether both sides finish as intended. Use that evidence to choose the launch examples and write a useful weaving order; slit count alone is not a difficulty rating.</p></section>
<section id="method"><h2>Method, limits and reproducibility</h2><p>Each solve starts from the target artwork; no saved gallery cutting geometry seeds it. Figure targets use the same <code>motif-frames.mjs</code> composition as the mockup: 64% central frame and 70% motif size. Text uses Nunito 800 or Dancing Script 700 with an eight-cell checker. Variable fonts were frozen to those weights with Python fontTools before rendering; an earlier incorrectly weighted text run is excluded.</p><p>Source masks and independent output comparisons are 256 × 256. The automatic preset retains its internal resolution setting of 400. Physical overlap width is 100 mm, minimum usable width 2 mm, no perturbation trials, and matching-sheet preference disabled. Initial non-text searches use a 12-second soft limit, corrected text searches 15 seconds, and the broad-ray plus retry group 30 seconds. Postprocessing can exceed the time setting. Rendering exported cuts uses resvg independently of the solver’s sampler; editor conversion is checked with the editor’s rasterizer.</p><p>These hand-selected examples do not measure the success rate of the 1,525-icon library or every font. Raster checks have finite resolution; the paper model does not certify tear strength or physical assembly. Short-search failures do not prove a design impossible. The linked templates are candidates for a paper trial.</p><details><summary>Reproduce the study</summary><p>Run from the repository root with existing npm dependencies and Python fontTools available. Output directories below retain the full solver reports locally; this review page keeps only compact comparisons, results and successful test templates.</p><pre>node scripts/inverse/design-start-study.mjs --seconds=12 --output=tmp/design-start-study-initial --cases=checker-control,tree-diamond-check,tree-circle-check,tree-circle-rays,tree-hexagon-check,star-circle-rays,heart-circle-check,cat-circle-check,tree-circle-plain
node scripts/inverse/design-start-study.mjs --seconds=15 --output=tmp/design-start-text-study --cases=text-StudyNunito-air,text-StudyNunito-woven,text-StudyDancing-woven
node scripts/inverse/design-start-study.mjs --seconds=30 --output=tmp/design-start-frame-retries --cases=tree-circle-rays-8,tree-circle-rays,cat-circle-check
node scripts/inverse/design-start-study-report.mjs</pre><p>Time-limited optimization can vary with machine load. <a href="results.json">Recorded results and settings</a> include target hashes, timestamps, errors before/after editor conversion, validation outcomes and solver warnings.</p><p>Implementation references in the repository: <code>static/inverse/core/engine.js</code>, <code>validate.js</code>, <code>material.js</code>, <code>image-features.js</code>; <code>src/lib/paint/frame.ts</code>; <code>src/lib/inverse/toHeartDesign.ts</code>; and <code>scripts/inverse/export-renderer.mjs</code>. Icon/font provenance and licenses are retained under <code>docs/design-start/assets/</code>.</p></details></section><footer>Local design study. Production code has not been changed or deployed. The interactive mockup still shows target pictures; its “Lav skabelon” button is not connected to the solver.</footer></main></body></html>`;
await fs.writeFile(path.join(out,'index.html'),html);
console.log(`Wrote ${rows.length} comparisons to ${path.relative(root,out)}/index.html`);

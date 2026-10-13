/* Clickable design exploration only. Motif previews are illustrations, not solved cutting patterns. */
(() => {
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const dialog = $('#dialog');
  const content = $('#dialog-content');
  const state = {view:'start', motif:'star', category:'all', text:'ANNA', type:'block', size:70, palette:0, border:'check', preview:'heart', offset:0, textMotif:null};
  const palettes = [
    {name:'Rød og creme', a:'#fffdf5', b:'#b72f2b'},
    {name:'Grøn og creme', a:'#fffdf5', b:'#365943'},
    {name:'Lilla og guld', a:'#ddba6b', b:'#725483'},
    {name:'Blå og lyserød', a:'#efd6cc', b:'#344e66'}
  ];
  const paths = {
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back:'<path d="M19 12H5m6 6-6-6 6-6"/>',
    upload:'<path d="M12 15V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    pencil:'<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14 7l3 3"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    external:'<path d="M14 4h6v6M20 4 10 14M18 13v6H5V6h6"/>',
    move:'<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    undo:'<path d="m9 14-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3"/>'
  };
  const icon = (name, cls='') => `<svg class="${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
  const motifs = [
    {id:'star', name:'Stjerne', category:'jul', art:'<path d="M50 5 61 36 94 37 68 58 76 90 50 71 23 90 31 58 5 37 39 36Z"/>'},
    {id:'tree', name:'Juletræ', category:'jul', art:'<path d="M50 4 72 31H61L83 56H68L94 83H57V97H43V83H6L32 56H17L39 31H28Z"/>'},
    {id:'heart', name:'Hjerte', category:'form', art:'<path d="M50 88 13 51C-10 24 22-3 50 25 78-3 110 24 87 51Z"/>'},
    {id:'snow', name:'Snefnug', category:'jul', art:'<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="square"><path d="M50 6V94M12 28 88 72M12 72 88 28M37 15l13 13 13-13M37 85l13-13 13 13M14 43l18-5-5-18M86 57l-18 5 5 18M14 57l18 5-5 18M86 43l-18-5 5-18"/></g>'},
    {id:'angel', name:'Engel', category:'jul', art:'<circle cx="50" cy="18" r="13"/><path d="M41 38Q16 15 7 39T29 68L19 93H81L71 68Q103 61 93 39T59 38L50 30Z"/>'},
    {id:'bell', name:'Klokke', category:'jul', art:'<path d="M42 12V6H58V12C76 17 78 33 77 50L91 77H9L23 50C22 33 24 17 42 12M36 84H64A14 14 0 0 1 36 84"/>'},
    {id:'gift', name:'Gave', category:'jul', art:'<path d="M10 47H44V94H10ZM56 47H90V94H56ZM4 29H44V41H4ZM56 29H96V41H56Z"/><path d="M48 31C5 34 16-14 43 10L50 22 57 10C84-14 95 34 52 31" fill="none" stroke="currentColor" stroke-width="9"/>'},
    {id:'circle', name:'Cirkel', category:'form', art:'<circle cx="50" cy="50" r="40"/>'},
    {id:'flower', name:'Blomst', category:'form', art:'<circle cx="50" cy="25" r="21"/><circle cx="74" cy="43" r="21"/><circle cx="64" cy="73" r="21"/><circle cx="35" cy="73" r="21"/><circle cx="25" cy="43" r="21"/><circle cx="50" cy="49" r="11" fill="var(--paper-left,#fffdf5)"/>'},
    {id:'house', name:'Hus', category:'jul', art:'<path d="M2 43 50 5 98 43H86V94H60V63H40V94H14V43Z"/>'},
    {id:'moon', name:'Måne', category:'form', art:'<path d="M71 6A45 45 0 1 0 94 73 42 42 0 0 1 71 6Z"/>'},
    {id:'diamond', name:'Rude', category:'form', art:'<path d="M50 3 89 50 50 97 11 50Z"/>'}
  ];
  const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const motif = (id, cls='') => `<svg class="motif-svg ${cls}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${motifs.find(m=>m.id===id)?.art || motifs[0].art}</svg>`;
  let serial = 0;
  const heart = (id, cls='') => {
    const data = window.JULEFLET_HEARTS[id];
    const markup = data.markup.replaceAll(`mock-${id}`, `heart-instance-${serial++}`);
    return `<svg class="heart-art ${cls}" viewBox="${data.viewBox}" aria-hidden="true">${markup}</svg>`;
  };
  function sketch({text=null, id='star', border='check', size=70, type='block', offset=0, accent=null}={}) {
    const checker = [];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if((r===0||c===0||r===7||c===7)&&(r+c)%2===0) checker.push(`<rect x="${c*25}" y="${r*25}" width="25" height="25"/>`);
    const unique = `motif-clip-${serial++}`;
    const shape = text!==null ? `<text x="0" y="${accent?38:(text.length>5?12:16)}" text-anchor="middle" font-family="${type==='round'?'Georgia,serif':'Helvetica,Arial,sans-serif'}" font-weight="700" font-size="${Math.min(52,190/Math.max(text.length,1)*1.5)}" letter-spacing="${text.length>5?0:1}">${esc(text||'…')}</text>` : `<g transform="translate(-60 -60) scale(1.2)">${motifs.find(m=>m.id===id)?.art||motifs[0].art}</g>`;
    return `<svg class="hero-heart" viewBox="0 0 400 350" role="img" aria-label="Motivskitse: ${esc(text!==null?text:motifs.find(m=>m.id===id)?.name)} i et julehjerte"><defs><clipPath id="${unique}"><path d="M200 39 341 180 200 321 59 180Z"/></clipPath></defs>
    <g transform="translate(100 80) rotate(45 100 100)"><path d="M0 0A100 100 0 0 0 0 200L200 200V0Z" fill="var(--paper-left)"/><path d="M0 0A100 100 0 0 1 200 0V200H0Z" fill="var(--paper-right)"/><rect width="200" height="200" fill="var(--paper-left)"/>${border==='check'?`<g fill="var(--paper-right)">${checker.join('')}</g>`:'<path d="M0 0V200H200V0" fill="none" stroke="var(--paper-right)" stroke-width="5"/>'}</g>
    <g clip-path="url(#${unique})" fill="var(--paper-right)" color="var(--paper-right)"><g transform="translate(200 ${180+offset}) scale(${size/70})">${accent?`<g transform="translate(-17 -43) scale(.34)">${motifs.find(m=>m.id===accent).art}</g>`:''}${shape}</g></g></svg>`;
  }
  function brushArt(vector=false) {
    return `<svg class="tool-art" viewBox="0 0 180 125" aria-hidden="true"><rect x="9" y="6" width="162" height="113" rx="10" fill="#fffdf6"/><path d="M25 33H155M25 56H155M25 79H155M48 18V105M82 18V105M116 18V105M150 18V105" stroke="#ecede6" stroke-width="1"/>${vector?'<path d="M28 93C62 91 44 26 86 28S130 89 155 37" fill="none" stroke="#bd302d" stroke-width="3"/><path d="M48 47 109 9M111 92 162 73" stroke="#d39b91" stroke-width="1.5"/><g fill="#fff" stroke="#bd302d" stroke-width="2"><circle cx="48" cy="47" r="3"/><circle cx="109" cy="9" r="3"/><circle cx="111" cy="92" r="3"/><circle cx="162" cy="73" r="3"/><rect x="81" y="23" width="9" height="9"/><rect x="24" y="88" width="9" height="9"/><rect x="151" y="32" width="9" height="9"/></g>':'<path d="M40 79Q49 35 72 55Q91 8 111 53Q157 51 116 85Q94 113 67 84Q38 97 40 79Z" fill="#b72f2b"/><path d="m119 71 32-32 10 10-32 32-18 9Z" fill="#ddb868"/><path d="m111 90 4-12 9 8Z" fill="#334736"/>'}</svg>`;
  }
  const nav = () => `<header class="site-header"><a class="wordmark" href="#start" data-view="start">Juleflet.dk</a><nav class="header-links" aria-label="Hovedmenu"><a href="https://juleflet.dk/" target="_blank" rel="noopener">Skabeloner</a><a href="https://juleflet.dk/saadan-goer-du/" target="_blank" rel="noopener">Sådan gør du</a><a class="active" href="#start" data-view="start">Design et hjerte</a></nav><div class="header-right"><a class="small-link" href="https://juleflet.dk/#mine" target="_blank" rel="noopener">Mine hjerter</a><a class="lang" href="https://juleflet.dk/en/" target="_blank" rel="noopener" aria-label="English website">EN</a></div></header>`;
  const arrow = `<span class="choice-arrow">${icon('arrow')}</span>`;
  function start() {
    return `${nav()}<main class="start-main"><div class="start-intro"><div><div class="eyebrow">Fra din idé til klip og flet</div><h1>Design dit eget julehjerte</h1><p>Begynd med en figur, et navn eller et mønster, du kan lide.<br>Så hjælper vi dig videre til din egen skabelon.</p></div><div class="intro-art" aria-hidden="true">${heart('juletrae')}${heart('simple-5star')}${heart('nemt-hjerte')}</div></div>
    <div class="featured-grid"><button class="choice featured" data-view="figure"><div class="choice-art"><span class="card-badge">Et godt sted at starte</span><div class="art-motifs">${['star','tree','heart','snow','angel','bell'].map(id=>`<span>${motif(id)}</span>`).join('')}</div><div class="art-heart">${heart('simple-5star')}</div></div><div class="choice-body"><div><h2>Vælg en figur</h2><p>Stjerner, juletræer, hjerter og andre små motiver.</p></div>${arrow}</div></button>
    <button class="choice featured text-card" data-view="text"><div class="choice-art"><div class="name-slip"><small>Et hjerte til …</small>ANNA<span class="tiny-cursor"></span></div><div class="art-heart">${sketch({text:'ANNA',size:65})}</div></div><div class="choice-body"><div><h2>Skriv et navn</h2><p>Et navn, jeres initialer eller en lille julehilsen.</p></div>${arrow}</div></button></div>
    <div class="section-line">Har du allerede en idé?</div><div class="other-grid">
    <button class="choice other-card" data-dialog="templates"><div class="choice-art template-stack">${heart('classic-3x3')}${heart('stjerne')}</div><div class="choice-body"><div><h2>Fra en skabelon</h2><p>Tag et hjerte fra samlingen og gør det til dit eget.</p></div>${arrow}</div></button>
    <button class="choice other-card" data-dialog="upload"><div class="choice-art upload-art"><img class="photo-mini" src="assets/5star-photo.jpg" alt="">${icon('arrow','art-flow-arrow')}${heart('5star')}</div><div class="choice-body"><div><h2>Fra et billede</h2><p>Brug en tegning, en silhuet eller et foto af et hjerte.</p></div>${arrow}</div></button>
    <button class="choice other-card" data-dialog="paint"><div class="choice-art">${brushArt()}</div><div class="choice-body"><div><h2>Mal selv</h2><p>Mal dit motiv direkte på hjertet med pensel og viskelæder.</p></div>${arrow}</div></button>
    <button class="choice other-card" data-dialog="draw"><div class="choice-art">${brushArt(true)}</div><div class="choice-body"><div><h2>Tegn selv</h2><p>Tilpas snit og kurver. Til dig, der vil styre detaljerne.</p></div>${arrow}</div></button></div>
    <div class="start-steps"><span><i>1</i>Vælg din idé</span>${icon('arrow')}<span><i>2</i>Tilpas hjertet</span>${icon('arrow')}<span><i>3</i>Print, klip og flet</span></div><div class="start-bottom"><button data-dialog="help">Første julehjerte? Vi hjælper dig i gang.</button></div></main>`;
  }
  function editorHeader() {
    return `<header class="site-header editor-header"><div class="back-area"><button class="back-button" aria-label="Vælg en anden start" data-view="start">${icon('back')}<span>Vælg en anden start</span></button><a class="wordmark" href="#start" data-view="start">Juleflet.dk</a></div><div class="stepper" aria-label="Trin 2 af 3: Tilpas hjertet"><span class="done"><i>✓</i>Din idé</span><b></b><span class="current"><i>2</i>Tilpas hjertet</span><b></b><span><i>3</i>Klip og flet</span></div><div class="header-right"><a class="small-link" href="https://juleflet.dk/saadan-goer-du/" target="_blank" rel="noopener">Sådan gør du</a><button class="icon-button" data-dialog="help" aria-label="Hjælp">${icon('help')}</button></div></header>`;
  }
  function library() {
    const isText = state.view==='text';
    return `<section class="panel library-panel"><h1>${isText?'Et hjerte med dit navn':'Hvad skal der være i hjertet?'}</h1><p class="intro">${isText?'Gør julehjertet personligt med et navn eller en kort hilsen.':'Vælg et motiv. Du kan prøve dig frem og skifte igen.'}</p><div class="panel-switch" aria-label="Motivtype"><button data-view="figure" aria-pressed="${!isText}">Figurer</button><button data-view="text" aria-pressed="${isText}">Tekst</button></div>
    ${isText?`<label for="heart-name">Navn eller tekst</label><input id="heart-name" class="name-input" maxlength="10" value="${esc(state.text)}" autocomplete="off" spellcheck="false"><div class="name-input-meta"><span>Korte ord giver mere plads.</span><span id="name-count">${state.text.length} / 10</span></div><div class="name-examples">${['ANNA','JUL','A+M'].map(n=>`<button data-name="${n}">${n}</button>`).join('')}</div><label>Bogstaver</label><div class="type-choices"><button class="type-choice" data-type="block" aria-pressed="${state.type==='block'}"><b>Ab</b>Enkle</button><button class="type-choice serif" data-type="round" aria-pressed="${state.type==='round'}"><b>Ab</b>Klassiske</button></div><div class="text-accent"><label>En lille figur over teksten</label><div class="accent-choices">${[[null,"Ingen"],["star","Stjerne"],["heart","Hjerte"],["tree","Juletræ"]].map(([id,label])=>`<button data-accent="${id||"none"}" aria-label="${label} over teksten" aria-pressed="${state.textMotif===id}">${id?motif(id):"–"}</button>`).join("")}</div></div><p class="friendly-note"><strong>En lille hilsen, der kan gemmes.</strong><br>Brug for eksempel hjertet som et personligt til-og-fra-kort på en gave.</p>`:
    `<div class="category-row" aria-label="Figurkategori">${[['all','Alle'],['jul','Jul'],['form','Former']].map(([id,label])=>`<button data-category="${id}" aria-pressed="${state.category===id}">${label}</button>`).join('')}</div><div class="motif-grid">${motifs.filter(m=>state.category==='all'||m.category===state.category).map(m=>`<button class="motif-choice" data-motif="${m.id}" aria-pressed="${state.motif===m.id}" aria-label="Vælg ${m.name.toLowerCase()}">${motif(m.id)}<span>${m.name}</span></button>`).join('')}</div><button class="panel-small-action" data-dialog="upload">${icon('upload')}Brug din egen figur</button>`}
    <button class="start-another" data-view="start">← Se alle måder at begynde på</button></section>`;
  }
  function currentSketch() {return sketch({text:state.view==='text'?state.text:null,id:state.motif,border:state.border,size:state.size,type:state.type,offset:state.offset,accent:state.view==='text'?state.textMotif:null});}
  function plainMotif() {
    return `<svg class="hero-heart" viewBox="0 0 400 350" role="img" aria-label="Dit motiv alene"><rect x="38" y="25" width="324" height="300" rx="4" fill="var(--paper-left)"/><g transform="translate(200 178) scale(${state.size/70})" fill="var(--paper-right)" color="var(--paper-right)">${state.view==='text'&&state.textMotif?`<g transform="translate(-17 -43) scale(.34)">${motifs.find(m=>m.id===state.textMotif).art}</g>`:''}${state.view==='text'?`<text text-anchor="middle" y="${state.textMotif?38:15}" font-size="${Math.min(52,220/Math.max(1,state.text.length)*1.5)}" font-weight="700" font-family="${state.type==='round'?'Georgia,serif':'Helvetica,Arial,sans-serif'}">${esc(state.text||'…')}</text>`:`<g transform="translate(-60 -60) scale(1.2)">${motifs.find(m=>m.id===state.motif).art}</g>`}</g></svg>`;
  }
  function stage() {
    return `<section class="heart-stage" aria-label="Forhåndsvisning"><div class="preview-label">Dit motiv · din farvekombination</div><div id="heart-preview" style="width:100%;display:flex;justify-content:center">${state.preview==='heart'?currentSketch():plainMotif()}</div><div class="stage-caption">${icon('pencil')}<span id="stage-caption">Motivskitse · ${state.view==='text'?esc(state.text||'Din tekst'):motifs.find(m=>m.id===state.motif).name}</span></div><div class="preview-switch" aria-label="Visning"><button data-preview="heart" aria-pressed="${state.preview==='heart'}">På hjertet</button><button data-preview="motif" aria-pressed="${state.preview==='motif'}">Kun motivet</button></div><div class="placement-tools" aria-label="Flyt motiv"><button data-shift="-5" aria-label="Flyt motivet op">↑</button><button data-shift="0" aria-label="Centrér motivet">${icon('move')}</button><button data-shift="5" aria-label="Flyt motivet ned">↓</button></div></section>`;
  }
  function controls() {
    return `<section class="panel adjust-panel"><h2>Gør det til dit</h2><div class="field"><div class="field-heading">Papirets farver</div><div class="swatches" aria-label="Farvekombination">${palettes.map((p,i)=>`<button class="swatch" style="--a:${p.a};--b:${p.b}" data-palette="${i}" aria-label="${p.name}" aria-pressed="${state.palette===i}"></button>`).join('')}</div></div><div class="field"><label class="field-heading" for="motif-size">Motivets størrelse <output id="size-value">${state.size}%</output></label><input id="motif-size" type="range" min="45" max="100" value="${state.size}"><div class="range-endpoints"><span>Mindre</span><span>Større</span></div></div><div class="field"><div class="field-heading">Kant omkring motivet</div><div class="border-choices"><button class="border-choice" data-border="plain" aria-pressed="${state.border==='plain'}"><svg viewBox="0 0 50 30" aria-hidden="true"><path d="M3 8H47V24H3Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>Enkel</button><button class="border-choice" data-border="check" aria-pressed="${state.border==='check'}"><svg viewBox="0 0 50 30" aria-hidden="true"><path d="M3 8H11V16H3ZM19 8H27V16H19ZM35 8H43V16H35ZM11 16H19V24H11ZM27 16H35V24H27ZM43 16H47V24H43Z" fill="currentColor"/></svg>Ternet</button></div></div><div class="divider"></div><button class="btn primary" id="generate">Lav skabelon${icon('arrow')}</button><p class="generation-hint">I næste trin tilpasses mønstret, så dit hjerte kan klippes og flettes.</p><button class="editor-secondary" data-dialog="paint">${icon('pencil')}Mal videre på motivet</button></section>`;
  }
  function applyPalette() {
    const p=palettes[state.palette];
    $('#prototype').style.setProperty('--paper-left',p.a);
    $('#prototype').style.setProperty('--paper-right',p.b);
    dialog.style.setProperty('--paper-left',p.a);
    dialog.style.setProperty('--paper-right',p.b);
  }
  function updatePreview() {
    $('#heart-preview').innerHTML=state.preview==='heart'?currentSketch():plainMotif();
    $('#stage-caption').textContent=`Motivskitse · ${state.view==='text'?state.text||'Din tekst':motifs.find(m=>m.id===state.motif).name}`;
    if($('#size-value')) $('#size-value').textContent=state.size+'%';
    if($('#name-count')) $('#name-count').textContent=state.text.length+' / 10';
  }
  function render(scroll=false) {
    app.innerHTML=state.view==='start'?start():`${editorHeader()}<main class="workbench">${library()}${stage()}${controls()}</main>`;
    applyPalette();
    document.querySelectorAll('.review-tabs button').forEach(b=>{if(b.dataset.view===state.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(scroll) window.scrollTo({top:0,behavior:'instant'});
  }
  function modal(label, markup) {
    $('#dialog-label').textContent=label;
    content.innerHTML=markup;
    if(!dialog.open) dialog.showModal();
  }
  function openDialog(which) {
    if(which==='templates') modal('Begynd med et eksisterende hjerte', `<h2>Hvilket hjerte vil du bygge videre på?</h2><p>Vælg en skabelon, og giv den dine egne farver eller arbejd videre med mønstret.</p><div class="template-grid">${[['classic-3x3','Det klassiske','Et enkelt sted at begynde'],['simple-5star','En lille stjerne','En tydelig figur i midten'],['juletrae','Juletræ','Et lille træ til det store'],['nemt-hjerte','Hjerte i hjertet','En enkel, personlig gave'],['jul','JUL','Et hjerte med en julehilsen'],['snowflake','Snefnug','Et mønster med fine detaljer']].map(([id,name,desc])=>`<button class="template-option" data-template="${id}">${heart(id)}<b>${name}</b><small>${desc}</small><span class="mini-link">Brug som udgangspunkt →</span></button>`).join('')}</div>`);
    else if(which==='upload') modal('Begynd med et billede', `<h2>Har du allerede et motiv?</h2><p>En enkel tegning, en tydelig silhuet eller et foto af et flettet hjerte er gode udgangspunkter.</p><div class="upload-zone">${icon('upload')}<strong>Vælg dit billede</strong><small>En fil fra din computer eller telefon</small><label class="btn dark" for="mock-file">Vælg billede<input id="mock-file" type="file" accept="image/*"></label></div><div class="upload-example"><img src="assets/5star-photo.jpg" alt="Foto af et lilla og guldfarvet stjernehjerte">${icon('arrow')}${heart('5star')}<div class="explain">Fra et færdigt hjerte til et mønster, du kan arbejde videre med.<br><button class="btn" data-upload-example>Prøv med dette billede</button></div></div>`);
    else if(which==='paint'||which==='draw') {
      const paint=which==='paint';
      modal(paint?'Mal dit eget motiv':'Tegn og tilpas snittene', `<h2>${paint?'En pensel. To farver. Din idé.':'Du bestemmer hver kurve.'}</h2><p>${paint?'Mal direkte på hjertet, eller arbejd videre på en figur. Når motivet er klar, kan Juleflet finde et forslag til fletningen.':'Arbejd med punkter og kurver i den nuværende designer. Her kan du tilpasse snittene og styre symmetrien selv.'}</p><div class="tool-preview">${paint?brushArt():brushArt(true)}<div class="tool-list">${paint?'<span>Pensel og viskelæder</span><span>Spejl dit motiv</span><span>Find en fletning</span>':'<span>Form snittene</span><span>Tilpas symmetrien</span><span>Se hjertet, mens du tegner</span>'}</div></div><a class="btn dark" href="https://juleflet.dk/editor/${paint?'mal/':''}" target="_blank" rel="noopener">Åbn det nuværende værktøj${icon('external')}</a><p style="font-size:12px;margin-top:13px;margin-bottom:0">Åbner i en ny fane. Motivet fra denne skitse følger ikke med.</p>`);
    } else if(which==='help') modal('Et hjerte, du selv har lavet', `<h2>Begynd med en lille idé</h2><ul class="notes-list"><li><b>1. Vælg et motiv</b><span>Prøv en stjerne, et juletræ eller et kort navn. Du kan altid vælge om.</span></li><li><b>2. Gør det personligt</b><span>Vælg to papirfarver, tilpas motivets størrelse, og prøv en kant omkring det.</span></li><li><b>3. Klip og flet</b><span>Den færdige løsning skal hjælpe dig videre til et fletbart mønster og en skabelon til print.</span></li></ul>`);
  }
  document.addEventListener('click', e=>{
    const b=e.target.closest('button,a');
    if(!b)return;
    if(b.dataset.view){e.preventDefault();state.view=b.dataset.view;history.replaceState(null,'','#'+state.view);render(true);}
    else if(b.dataset.dialog)openDialog(b.dataset.dialog);
    else if(b.dataset.category){state.category=b.dataset.category;render();}
    else if(b.dataset.motif){state.motif=b.dataset.motif;document.querySelectorAll('[data-motif]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.motif===state.motif));updatePreview();}
    else if(b.dataset.name){state.text=b.dataset.name;$('#heart-name').value=state.text;updatePreview();}
    else if(b.dataset.accent){state.textMotif=b.dataset.accent==='none'?null:b.dataset.accent;document.querySelectorAll('[data-accent]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.accent===(state.textMotif||'none')));updatePreview();}
    else if(b.dataset.type){state.type=b.dataset.type;document.querySelectorAll('[data-type]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.type===state.type));updatePreview();}
    else if(b.dataset.palette!==undefined){state.palette=Number(b.dataset.palette);document.querySelectorAll('[data-palette]').forEach(el=>el.setAttribute('aria-pressed',Number(el.dataset.palette)===state.palette));applyPalette();}
    else if(b.dataset.border){state.border=b.dataset.border;document.querySelectorAll('[data-border]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.border===state.border));updatePreview();}
    else if(b.dataset.preview){state.preview=b.dataset.preview;document.querySelectorAll('[data-preview]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.preview===state.preview));updatePreview();}
    else if(b.dataset.shift!==undefined){state.offset=b.dataset.shift==='0'?0:Math.max(-25,Math.min(25,state.offset+Number(b.dataset.shift)));updatePreview();}
    else if(b.dataset.template){
      const id=b.dataset.template;
      modal('Fra en skabelon', `<h2>Gør mønstret til dit eget</h2><p>Behold det eksisterende mønster som udgangspunkt, og tilpas farver eller snit.</p><div class="tool-preview">${heart(id)}</div><a class="btn dark" href="https://juleflet.dk/editor/?from=${encodeURIComponent(id)}" target="_blank" rel="noopener">Åbn i den nuværende designer${icon('external')}</a>`);
    }
    else if(b.hasAttribute('data-upload-example')) modal('Eksempel på billedimport', `<h2>Dit billede bliver et udgangspunkt</h2><p>Først vælger du motivet fra billedet. Derefter arbejder du videre med to papirfarver.</p><div class="tool-preview"><img class="photo-mini" style="width:170px;height:176px" src="assets/5star-photo.jpg" alt="Originalfoto af stjernehjertet">${icon('arrow')}${heart('5star')}</div><a class="btn dark" href="https://juleflet.dk/editor/mal/" target="_blank" rel="noopener">Prøv billedimport i det nuværende værktøj${icon('external')}</a>`);
    else if(b.id==='generate'){
      modal('Designskitse · næste trin', `<h2>Fra dit motiv til et flettet hjerte</h2><p>Denne mockup stopper ved motivet. Næste trin skal beregne snittene og vise, hvordan et fletbart mønster kan se ud, før man henter en PDF.</p><div class="tool-preview">${currentSketch()}</div><p>Det er især vigtigt ved tekst: bogstaver og mellemrum kan kræve tilpasning. Vis derfor forskellen mellem idé og fletning, og lad brugeren vælge.</p><button class="btn dark" data-close-dialog>Tilbage til mit motiv</button>`);
    }
    else if(b.hasAttribute('data-close-dialog')||b.id==='close-dialog')dialog.close();
    else if(b.id==='notes-button')modal('Om designskitserne', `<h2>Flere veje ind. Én rolig start.</h2><p>Tre sammenhængende skitser til den nye indgang fra “Design dit eget hjerte”.</p><ul class="notes-list"><li><b>1. Et valg med eksempler</b><span>Figurer og tekst står først. Skabeloner, billeder, maling og den avancerede designer er stadig ét klik væk.</span></li><li><b>2. Vælg en figur</b><span>Et lille bibliotek af tydelige motiver. Hjertet vises hele tiden, og de første valg er størrelse, papirfarver og kant.</span></li><li><b>3. Skriv et navn</b><span>Samme ramme, nu med tekst og to enkle bogstavformer. Korte ord og initialer er lette at komme i gang med.</span></li><li><b>En idé er ikke en klippeskabelon</b><span>De nye motiv- og teksthjerter er illustrationsskitser. De er ikke valideret som fletbare. En færdig løsning skal beregne snit, vise eventuelle ændringer og først derefter tilbyde PDF.</span></li><li><b>Afprøv også på telefonen</b><span>Indgangen bliver én kolonne. I tilpasningen vises hjertet først, derefter motivvalg og farver. Eksempler fra samlingen bruger hjemmesidens eksisterende hjerter.</span></li></ul>`);
  });
  document.addEventListener('input', e=>{
    if(e.target.id==='heart-name'){state.text=e.target.value;updatePreview();}
    else if(e.target.id==='motif-size'){state.size=Number(e.target.value);updatePreview();}
  });
  document.addEventListener('change', e=>{
    if(e.target.id!=='mock-file'||!e.target.files?.[0])return;
    const file=e.target.files[0];
    if(!file.type.startsWith('image/'))return;
    const reader=new FileReader();
    reader.onload=()=>{
      modal('Designskitse · dit valgte billede', `<h2>Dit billede er valgt</h2><p>Billedet vises lokalt i mockuppen. I den færdige løsning går du herfra videre til at vælge motivet og de to farver.</p><img class="import-preview" alt="Dit valgte billede"><div class="import-confirm"><p>Ingen filer sendes til en server.</p><button class="btn dark" data-dialog="upload">Vælg et andet billede</button></div>`);
      $('.import-preview').src=reader.result;
    };
    reader.readAsDataURL(file);
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  if(['start','figure','text'].includes(location.hash.slice(1)))state.view=location.hash.slice(1);
  render();
})();

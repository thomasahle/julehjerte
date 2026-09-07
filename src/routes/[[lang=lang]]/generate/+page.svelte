<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { Button } from '$lib/components/ui/button';
  import { langFromPathname } from '$lib/i18n';
  import { getColors, setLeftColor, setRightColor, subscribeColors } from '$lib/stores/colors';
  import { InverseWorker, EngineError, searchTimedOut, type ArtworkInput, type PreparedArtwork, type DesignResult, type Point, type CropProposal, type DetectedCrops } from '$lib/inverse/client';
  import { inverseText, type MessageKey } from '$lib/inverse/messages';
  import { GENERAL_PRESET, MATCHING_GRID_PRESET, DIRECT_PRESET, SIMPLIFIED_PREPROCESSING } from '$lib/inverse/presets.js';
  import SvgPreview from '$lib/inverse/SvgPreview.svelte';
  import ArtworkComparison from '$lib/inverse/ArtworkComparison.svelte';

  let lang = $derived(langFromPathname(page.url.pathname, base));
  const text = (key: MessageKey) => inverseText(key, lang);
  const asset = (path: string) => `${base}/inverse/${path}`;
  let engine: InverseWorker;
  let ready = $state(false);
  let previewPanel: HTMLElement;
  let fileControl: HTMLInputElement;
  let disposed = false;
  let input = $state.raw<ArtworkInput | null>(null);
  let filename = $state('');
  let sourceSha256 = '';
  let decodedPixelsSha256 = '';
  let prepared = $state.raw<PreparedArtwork | null>(null);
  let result = $state.raw<DesignResult | null>(null);
  let error = $state('');
  let errorReport = $state.raw<Record<string, unknown> | undefined>();
  let busy = $state(false);
  let stage = $state<MessageKey>('loading');
  let elapsed = $state(0);
  let imageUrl = $state('');
  let quad = $state<Point[]>([]);
  let selectedCornerCount = $derived(quad.filter(p => p.every(Number.isFinite)).length);
  let completeCrop = $derived(quad.length === 4 && selectedCornerCount === 4);
  let cropMode = $state('quad');
  let cropCandidates = $state.raw<CropProposal[]>([]);
  let selectedCrop = $state(-1);
  let cropMessage = $state<MessageKey | null>(null);
  let cropTool = $state<'corners' | 'region'>('corners');
  let roughRegion = $state<number[] | null>(null);
  let regionStart: Point | null = null;
  let proposal = $state.raw<CropProposal | null>(null);
  let cropEdited = $state(false);
  let photoCanvas = $state<HTMLCanvasElement | null>(null);
  let photoError = $state(false);
  let draggingCorner = -1;
  let suppressCropClick = false;
  let maskView = $state(false);
  let maskCanvas = $state<HTMLCanvasElement | null>(null);
  type ResultView = 'heart' | 'leftTemplate' | 'rightTemplate' | 'paper' | 'sourcePaths' | 'sourceMask' | 'comparison';
  let view = $state<ResultView>('heart');
  let resultViews = $derived<ResultView[]>([
    'heart', 'leftTemplate', 'rightTemplate', 'paper',
    ...(prepared && !prepared.metadata.direct ? ['sourcePaths' as const] : []),
    ...(prepared ? ['sourceMask' as const] : []),
    ...(prepared && result?.comparison && result.comparison.resolution === prepared.resolution ? ['comparison' as const] : []),
  ]);
  let saved = $derived(input?.type === 'json');
  let leftColour = $state('#ffffff');
  let rightColour = $state('#b91313');
  let routingPreset = $state('general');
  let settings = $state({
    ...GENERAL_PRESET,
    width: 100, minWidth: 2, cutError: 0.25, timeLimit: 60,
    mode: 'auto', threshold: 128, swatches: ['#b91313', '#ffffff'], invert: false,
    removeSpecks: 0, fillHoles: 0,
    minRadius: 0.8, kerf: 0, printShrinkPercent: 0.2,
    materialResolution: 360, trials: 12,
  });
  const numericFields: { key: 'minRadius' | 'kerf' | 'printShrinkPercent' | 'neighbors' | 'materialResolution' | 'trials'; label: MessageKey; min: number; max: number; step: number }[] = [
    { key: 'minRadius', label: 'radius', min: 0, max: 10, step: 0.1 },
    { key: 'kerf', label: 'kerf', min: 0, max: 3, step: 0.05 },
    { key: 'printShrinkPercent', label: 'shrink', min: 0, max: 5, step: 0.1 },
    { key: 'neighbors', label: 'neighbours', min: 2, max: 40, step: 1 },
    { key: 'materialResolution', label: 'materialResolution', min: 80, max: 700, step: 1 },
    { key: 'trials', label: 'trials', min: 0, max: 100, step: 1 },
  ];

  function setRoutingPreset(value: string) {
    routingPreset = value;
    Object.assign(settings, value === 'direct' ? DIRECT_PRESET : value === 'matching-grid' ? MATCHING_GRID_PRESET : GENERAL_PRESET);
    invalidate();
  }

  function toHex(value: string, fallback: string): string {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    return rgb ? '#' + rgb.slice(1).map(v => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('') : fallback;
  }

  onMount(() => {
    engine = new InverseWorker(asset('worker-bootstrap.js'));
    ready = true;
    if (!('Worker' in window) || !('WebAssembly' in window)) error = text('browserRequired');
    const colours = getColors();
    leftColour = toHex(colours.left, '#ffffff');
    rightColour = toHex(colours.right, '#b91313');
    const unsubscribe = subscribeColors(c => {
      const left = toHex(c.left, '#ffffff'), right = toHex(c.right, '#b91313');
      if (left === leftColour && right === rightColour) return;
      leftColour = left;
      rightColour = right;
      // Footer colour controls remain available during computation.
      engine.stop();
      invalidate();
    });
    return () => {
      disposed = true;
      unsubscribe();
      engine.stop();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  });

  function invalidate() {
    prepared = null;
    result = null;
    error = '';
    errorReport = undefined;
    maskView = false;
  }

  function reportError(value: unknown) {
    if (disposed) return;
    if (value instanceof DOMException && value.name === 'AbortError') error = text('cancelled');
    else error = value instanceof Error ? value.message : String(value);
    errorReport = value instanceof EngineError ? value.report : undefined;
    if (value instanceof EngineError && !value.report) prepared = null;
  }

  async function chooseFile(file: File, autoDetect = true) {
    input = null;
    filename = ''; sourceSha256 = ''; decodedPixelsSha256 = '';
    invalidate();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = '';
    quad = [];
    cropCandidates = [];
    selectedCrop = -1;
    cropMessage = null;
    cropTool = 'corners'; roughRegion = null; proposal = null; cropEdited = false;
    if (file.size > 12 * 1024 * 1024) throw new Error(text('tooLarge'));
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'svg' || ext === 'json') {
      const content = await file.text();
      if (disposed) return;
      input = { type: ext, text: content };
    } else {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(text('unsupported'));
      const bitmap = await createImageBitmap(file);
      try {
        if (disposed) return;
        if (bitmap.width * bitmap.height > 24e6) throw new Error(text('pixelsTooLarge'));
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error(text('unsupported'));
        context.drawImage(bitmap, 0, 0);
        input = {
          type: 'pixels', rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
          imageWidth: bitmap.width, imageHeight: bitmap.height,
        };
        imageUrl = URL.createObjectURL(file);
        cropMode = bitmap.width === bitmap.height ? 'square' : 'quad';
      } finally { bitmap.close(); }
    }
    const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
    sourceSha256 = await digest(await file.arrayBuffer());
    if (input?.type === 'pixels') decodedPixelsSha256 = await digest(input.rgba.slice().buffer);
    if (disposed) return;
    filename = file.name;
    if (input?.type === 'pixels' && autoDetect) await detectCrops(false, true);
  }

  function useCrop(index: number) {
    const candidate = cropCandidates[index];
    if (!candidate) return;
    selectedCrop = index;
    proposal = candidate; cropEdited = false; cropTool = 'corners';
    quad = candidate.quad.map(p => [...p] as Point);
    cropMode = 'quad';
    cropMessage = candidate.needsReview ? 'cropUncertain' : 'cropSuggestion';
    invalidate();
  }

  async function detectCrops(refine = false, autoUpload = false) {
    if (input?.type !== 'pixels') return;
    invalidate();
    busy = true;
    stage = 'detecting';
    const started = performance.now();
    elapsed = 0;
    const timer = setInterval(() => { elapsed = Math.floor((performance.now() - started) / 1000); }, 1000);
    try {
      const crops = await engine.request<DetectedCrops>(refine ? 'refine-crop' : 'detect-crops', { ...input, roi: refine ? undefined : $state.snapshot(roughRegion) ?? undefined, quad: quad.map(p => [...p] as Point) }, {});
      if (disposed) return;
      cropCandidates = crops.candidates;
      selectedCrop = -1;
      if (cropCandidates.length) useCrop(0);
      else {
        proposal = null;
        if (autoUpload && cropMode === 'square') {
          cropMessage = null; cropTool = 'corners';
        } else if (completeCrop) {
          cropMessage = 'cropFitKept'; cropTool = 'corners'; cropEdited = true;
        } else if (crops.status === 'needs_selection' && !roughRegion) {
          cropMode = 'quad'; cropMessage = 'regionHelp'; cropTool = 'region';
        } else {
          cropMode = 'quad'; cropMessage = 'noHearts'; cropTool = 'corners'; roughRegion = null;
        }
      }
    } catch (value) { reportError(value); }
    finally { clearInterval(timer); busy = false; }
  }

  function pointerPoint(event: MouseEvent | PointerEvent): Point | null {
    if (input?.type !== 'pixels' || !(event.currentTarget instanceof HTMLElement)) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(input.imageWidth, (event.clientX - rect.left) / rect.width * input.imageWidth)),
      Math.max(0, Math.min(input.imageHeight, (event.clientY - rect.top) / rect.height * input.imageHeight)),
    ];
  }

  function startCornerDrag(event: PointerEvent) {
    if (busy || cropMode !== 'quad' || input?.type !== 'pixels' || !(event.currentTarget instanceof HTMLElement)) return;
    suppressCropClick = false;
    const p = pointerPoint(event);
    if (!p) return;
    if (cropTool === 'region') {
      regionStart = p; roughRegion = [...p, ...p];
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressCropClick = true;
      return;
    }
    const radius = 20 * input.imageWidth / event.currentTarget.getBoundingClientRect().width;
    draggingCorner = quad.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= radius);
    if (draggingCorner >= 0) {
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressCropClick = true;
    }
  }

  function moveCorner(event: PointerEvent) {
    if (busy || (draggingCorner < 0 && !regionStart)) return;
    const p = pointerPoint(event);
    if (!p) return;
    if (regionStart) {
      roughRegion = [Math.min(regionStart[0], p[0]), Math.min(regionStart[1], p[1]), Math.max(regionStart[0], p[0]), Math.max(regionStart[1], p[1])];
      return;
    }
    quad[draggingCorner] = p.map(v => Math.round(v * 10) / 10) as Point;
    selectedCrop = -1; cropEdited = true;
    cropMessage = 'cropSuggestion';
    invalidate();
  }

  function endCornerDrag(event: PointerEvent) {
    draggingCorner = -1;
    if (!regionStart) return;
    regionStart = null;
    if (event.type === 'pointercancel') { roughRegion = null; return; }
    if (roughRegion && roughRegion[2] - roughRegion[0] >= 24 && roughRegion[3] - roughRegion[1] >= 24) {
      quad = []; proposal = null; cropCandidates = [];
      void detectCrops();
    } else cropMessage = 'regionHelp';
  }

  function selectRegion() {
    invalidate();
    cropMode = 'quad'; cropTool = 'region'; cropMessage = 'regionHelp';
    roughRegion = null;
  }

  function resetCrop() {
    cropMode = 'quad';
    quad = []; selectedCrop = -1; cropMessage = null; proposal = null;
    cropCandidates = []; cropTool = 'corners'; roughRegion = null; cropEdited = true;
    invalidate();
  }

  async function loadFile(file?: File) {
    if (!file || busy) return;
    busy = true;
    stage = 'loading';
    try { await chooseFile(file); } catch (value) { reportError(value); }
    finally { busy = false; }
  }

  async function example(name: 'waves' | 'star' | 'jul') {
    if (busy || !ready) return;
    invalidate();
    input = null;
    filename = '';
    if (fileControl) fileControl.value = '';
    busy = true;
    stage = 'loading';
    elapsed = 0;
    let loaded = false;
    try {
      const path = name === 'waves' ? 'waves.svg' : name === 'star' ? 'star.png' : 'jul.saved.json';
      const response = await fetch(asset(`examples/${path}`));
      if (!response.ok) throw new Error(text('loadFailed'));
      const blob = await response.blob();
      await chooseFile(new File([blob], path, { type: blob.type }), false);
      setRoutingPreset(name === 'star' ? 'matching-grid' : 'general');
      if (name === 'star') cropMode = 'square';
      loaded = !disposed;
    } catch (value) { reportError(value); }
    finally { busy = false; }
    if (!loaded) return;
    await tick();
    if (window.matchMedia('(max-width: 850px)').matches) previewPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await run(name === 'jul' ? 'saved' : 'prepare');
  }

  function selectCorner(event: MouseEvent) {
    if (busy || input?.type !== 'pixels' || cropMode !== 'quad' || cropTool !== 'corners') return;
    if (suppressCropClick) { suppressCropClick = false; return; }
    const p = pointerPoint(event);
    if (!p) return;
    if (quad.length === 4) return;
    quad.push(p.map(v => Math.round(v)) as Point);
    selectedCrop = -1; cropEdited = true;
    invalidate();
  }

  function coordinate(index: number, axis: number, value: number) {
    while (quad.length <= index) quad.push([NaN, NaN]);
    quad[index][axis] = value;
    selectedCrop = -1; cropEdited = true;
    invalidate();
  }

  async function run(action: 'prepare' | 'solve' | 'saved') {
    if (busy || !input) return;
    let payload = input;
    error = '';
    errorReport = undefined;
    result = null;
    if (action !== 'solve') prepared = null;
    if (action === 'prepare' && input.type === 'pixels' && cropMode === 'quad') {
      if (!completeCrop) { error = text('cropRequired'); return; }
      payload = { ...input, quad: quad.map(p => [...p] as Point), cropProvenance: {
        ...proposal?.provenance, filename, sourceSha256, decodedPixelsSha256, roughRegion: $state.snapshot(roughRegion) ?? proposal?.provenance.roughRegion ?? null,
        locatorStatus: proposal?.status ?? 'manual', locatorWarnings: proposal?.warnings ?? [],
        locatorEvidence: proposal?.locator.evidence ?? null,
        manuallyEdited: cropEdited, acceptedPixelEdgeCorners: $state.snapshot(quad),
        acceptedAt: new Date().toISOString(), acceptance: 'User prepared the displayed crop',
      } };
    }
    busy = true;
    stage = action === 'prepare' ? 'preprocessing' : 'graph';
    elapsed = 0;
    const start = performance.now();
    const timer = setInterval(() => { elapsed = Math.floor((performance.now() - start) / 1000); }, 1000);
    try {
      const cfg = { ...$state.snapshot(settings), paperColors: [rightColour, leftColour], requireMaterialCore: true };
      const value = await engine.request<PreparedArtwork | DesignResult>(action, payload, cfg, next => {
        stage = next === 'paper' ? 'paperStage' : next as MessageKey;
      });
      if (disposed) return;
      if (action === 'prepare') { prepared = value as PreparedArtwork; maskView = settings.algorithm === 'direct'; }
      else { result = value as DesignResult; view = 'heart'; }
    } catch (value) { reportError(value); }
    finally { clearInterval(timer); busy = false; }
  }

  function cancel() {
    engine.stop();
    prepared = null;
    result = null;
  }

  async function simplify() {
    Object.assign(settings, SIMPLIFIED_PREPROCESSING);
    invalidate();
    await run('prepare');
  }

  function download(name: string, value?: string | Uint8Array<ArrayBuffer>) {
    const content = value ?? result?.files[name];
    if (content === undefined) return;
    const type = name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.zip') ? 'application/zip' : name.endsWith('.json') ? 'application/json' : 'text/html';
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  async function downloadZip() {
    if (busy || !result) return;
    busy = true;
    stage = 'exporting';
    try { download('juleflet-design.zip', await engine.request<Uint8Array<ArrayBuffer>>('archive', undefined, {})); }
    catch (value) { reportError(value); }
    finally { busy = false; }
  }

  $effect(() => {
    if (!(result ? view === 'sourceMask' : maskView) || !prepared || !maskCanvas) return;
    const n = prepared.resolution;
    maskCanvas.width = n;
    maskCanvas.height = n;
    const context = maskCanvas.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(n, n);
    const colours = [leftColour, rightColour].map(c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)));
    prepared.mask.forEach((v, i) => { pixels.data.set(colours[v], i * 4); pixels.data[i * 4 + 3] = 255; });
    context.putImageData(pixels, 0, 0);
  });

  // Render source pixels with the same half-pixel convention as preprocessing.
  $effect(() => {
    const canvas = photoCanvas, source = input, corners = $state.snapshot(quad);
    if (!canvas || source?.type !== 'pixels' || corners.length !== 4 || cropMode !== 'quad') return;
    let cancelled = false;
    const frame = requestAnimationFrame(async () => {
      try {
        const { rectifyMotif } = await import(/* @vite-ignore */ asset('locator/locator.js'));
        if (cancelled) return;
        const crop = rectifyMotif({ width: source.imageWidth, height: source.imageHeight, data: source.rgba }, corners.map(p => p.map(v => v - 0.5)), { size: 240 });
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = canvas.height = 240;
        const pixels = context.createImageData(240, 240); pixels.data.set(crop.data);
        context.putImageData(pixels, 0, 0); photoError = false;
      } catch {
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        photoError = true;
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  });

  let resultTitle = $derived(result?.report.templateExportAllowed ? 'checked' : result?.report.manufacturing.status === 'uncertain' ? 'uncertain' : 'review');
  let resultFile = $derived(({ heart: 'weave_preview.svg', leftTemplate: 'template_left.svg', rightTemplate: 'template_right.svg', paper: 'manufacturability_left.svg', sourcePaths: '', sourceMask: '', comparison: '' })[view]);
</script>

<svelte:head><title>{text('title')} · Juleflet</title></svelte:head>

<PageHeader {lang} />
<div class="studio">
  <div class="intro">
    <span class="badge">{text('experimental')}</span>
    <h1>{text('title')}</h1>
    <p>{text('intro')}</p>
    <p class="muted">{text('limits')}</p>
  </div>

  <div class="workspace">
    <form class="controls" onsubmit={event => { event.preventDefault(); run(saved ? 'saved' : 'prepare'); }} oninput={invalidate} onchange={invalidate}>
      <fieldset disabled={busy || !ready}>
        <section class="panel">
          <h2>{text('upload')}</h2>
          <label class="upload">
            <span>{text('file')}</span>
            <input type="file" bind:this={fileControl} accept=".png,.jpg,.jpeg,.webp,.svg,.json" onchange={event => loadFile(event.currentTarget.files?.[0])} />
            <small>{text('formats')}</small>
          </label>
          {#if filename}<p class="filename">{filename}</p>{/if}
          <p class="muted small">{text('svgHelp')}</p>
          <p class="eyebrow">{text('examples')}</p>
          <div class="examples">
            {#each ['waves', 'star', 'jul'] as name}
              <button type="button" onclick={() => example(name as 'waves' | 'star' | 'jul')}>{text(name as MessageKey)}</button>
            {/each}
          </div>
          {#if saved}<p class="notice">{text('savedNote')}</p>{/if}
          {#if input?.type === 'pixels' && imageUrl}
            <div class="crop-section">
              <h3>{text('crop')}</h3>
              <label>{text('cropMode')}
                <select bind:value={cropMode}>
                  <option value="quad">{text('corners')}</option>
                  {#if input.imageWidth === input.imageHeight}<option value="square">{text('square')}</option>{/if}
                </select>
              </label>
              <div class="crop-actions">
                <button type="button" onclick={() => { roughRegion = null; void detectCrops(); }}>{text('findHearts')}</button>
                <button type="button" class:active={cropTool === 'region'} onclick={selectRegion}>{text('selectRegion')}</button>
                <button type="button" class:active={cropMode === 'quad' && cropTool === 'corners'} onclick={resetCrop}>{text('placeCorners')}</button>
                {#if completeCrop && cropMode === 'quad'}<button type="button" onclick={() => detectCrops(true)}>{text('refineCrop')}</button>{/if}
              </div>
              <p class="muted small">{text('locatorHelp')}</p>
              {#if cropMessage}<p class="muted small" role="status">{text(cropMessage)}</p>{/if}
              {#if cropMode === 'quad' && cropTool === 'corners'}<p class="muted small">{text('cropHelp')}</p>{/if}
              <button type="button" class="crop-image" onclick={selectCorner} onpointerdown={startCornerDrag} onpointermove={moveCorner} onpointerup={endCornerDrag} onpointercancel={endCornerDrag} aria-label={text('crop')} disabled={cropMode !== 'quad'}>
                <img src={imageUrl} alt={filename} draggable="false" />
                <svg viewBox="0 0 {input.imageWidth} {input.imageHeight}" aria-hidden="true">
                  {#if cropMode === 'quad' && selectedCrop >= 0 && proposal}
                    {#each proposal.outline as arc}<polyline class="detected-outline" points={arc.map(p => p.join(',')).join(' ')} />{/each}
                  {/if}
                  {#if cropTool === 'region' && roughRegion}<rect class="region" x={roughRegion[0]} y={roughRegion[1]} width={roughRegion[2] - roughRegion[0]} height={roughRegion[3] - roughRegion[1]} />{/if}
                  {#if cropMode === 'quad' && quad.length > 1 && quad.every(p => p.every(Number.isFinite))}<polyline points={quad.map(p => p.join(',')).join(' ') + (completeCrop ? ` ${quad[0].join(',')}` : '')} />{/if}
                </svg>
                {#each quad as p, i}{#if cropMode === 'quad' && p.every(Number.isFinite)}<span class="corner" style:left="{100 * p[0] / input.imageWidth}%" style:top="{100 * p[1] / input.imageHeight}%">{i + 1}</span>{/if}{/each}
              </button>
              {#if cropMode === 'quad'}
                <div class="crop-status"><span>{selectedCornerCount}/4 {text('selectedCorners')}</span><button type="button" onclick={resetCrop}>{text('resetCrop')}</button></div>
                {#if completeCrop}
                  <figure class="photo-preview"><figcaption>{text('photoCrop')}</figcaption><canvas bind:this={photoCanvas} aria-label={text('photoCrop')}></canvas></figure>
                  {#if photoError}<p class="notice">{text('invalidCrop')}</p>{/if}
                {/if}
                <div class="field-grid coordinates">
                  {#each [0, 1, 2, 3] as i}
                    {#each [0, 1] as axis}
                      <label>{text('corner')} {i + 1} · {axis === 0 ? 'x' : 'y'}
                        <input type="number" min="0" max={axis === 0 ? input.imageWidth : input.imageHeight} step="any" value={Number.isFinite(quad[i]?.[axis]) ? quad[i][axis] : ''} oninput={e => coordinate(i, axis, e.currentTarget.valueAsNumber)} />
                      </label>
                    {/each}
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </section>

        <section class="panel">
          <h2>{text('settings')}</h2>
          {#if !saved}
            <label>{text('routingPreset')}<select value={routingPreset} onchange={e => setRoutingPreset(e.currentTarget.value)}><option value="direct">{text('directPreset')}</option><option value="general">{text('generalPreset')}</option><option value="matching-grid">{text('matchingGridPreset')}</option></select></label>
            {#if routingPreset === 'direct'}<p class="muted small">{text('directHelp')}</p>{/if}
            {#if routingPreset === 'matching-grid'}<p class="notice">{text('matchingGridHelp')}</p>{/if}
          {/if}
          <div class="field-grid">
            <label>{text('width')}<input type="number" min="20" max="300" step="1" bind:value={settings.width} required /></label>
            <label>{text('minWidth')}<input type="number" min="0.1" max="30" step="0.1" bind:value={settings.minWidth} required /></label>
            <label>{text('cutError')}<input type="number" min="0" max="3" step="0.05" bind:value={settings.cutError} required /></label>
            <label>{text('timeLimit')}<input type="number" min="1" max="180" step="1" bind:value={settings.timeLimit} required /></label>
          </div>
          <h3>{text('colours')}</h3>
          <div class="field-grid">
            <label class="colour">{text('left')}<input type="color" value={leftColour} oninput={e => setLeftColor(e.currentTarget.value)} /></label>
            <label class="colour">{text('right')}<input type="color" value={rightColour} oninput={e => setRightColor(e.currentTarget.value)} /></label>
          </div>
          <p class="muted small">{text('coloursHelp')}</p>
          {#if input?.type === 'pixels'}
            <details>
              <summary>{text('conversion')}</summary>
              <label>{text('mode')}<select bind:value={settings.mode}>
                {#each [['auto', 'auto'], ['lab', 'lab'], ['red-white-mixture', 'redWhitePhoto'], ['threshold', 'thresholdMode'], ['swatches', 'swatchesMode']] as [value, label]}<option {value}>{text(label as MessageKey)}</option>{/each}
              </select></label>
              {#if settings.mode === 'red-white-mixture'}<p class="muted small">{text('mixtureHint')}</p>{/if}
              {#if settings.mode === 'threshold'}<label>{text('threshold')}<input type="number" min="0" max="255" step="1" bind:value={settings.threshold} required /></label>{/if}
              {#if settings.mode === 'swatches'}<div class="field-grid"><label>{text('swatchA')}<input type="color" bind:value={settings.swatches[0]} /></label><label>{text('swatchB')}<input type="color" bind:value={settings.swatches[1]} /></label></div>{/if}
              <div class="field-grid">
                <label>{text(routingPreset === 'direct' ? 'imageResolution' : 'resolution')}<input type="number" min="32" max="600" step="1" bind:value={settings.resolution} required /></label>
                {#if routingPreset !== 'direct'}
                <label>{text('fit')}<input type="number" min="0.01" max="3" step="0.01" bind:value={settings.fitTolerance} required /></label>
                <label>{text('span')}<input type="number" min="2" max="40" step="1" bind:value={settings.maxSpan} required /></label>
                <label>{text('specks')}<input type="number" min="0" max="100" step="0.1" bind:value={settings.removeSpecks} required /></label>
                <label>{text('holes')}<input type="number" min="0" max="100" step="0.1" bind:value={settings.fillHoles} required /></label>
                <label>{text('smooth')}<input type="number" min="0" max="3" step="0.1" bind:value={settings.smoothRadius} required /></label>
                <label>{text('snap')}<input type="number" min="0" max="3" step="0.1" bind:value={settings.snapRadius} required /></label>
                <label>{text('border')}<input type="number" min="0" max="3" step="0.25" bind:value={settings.borderRadius} required /></label>
                {/if}
              </div>
              {#if routingPreset !== 'direct'}
              <p class="muted small">{text('snapHelp')}</p>
              <p class="muted small">{text('borderHelp')}</p>
              {/if}
            </details>
          {/if}
          {#if !saved}<label class="checkbox"><input type="checkbox" bind:checked={settings.invert} />{text('invert')}</label>{/if}
          <details>
            <summary>{text('manufacturing')}</summary>
            <div class="field-grid">{#each numericFields.filter(f => routingPreset !== 'direct' || f.key !== 'neighbors') as field}<label>{text(field.label)}<input type="number" min={field.min} max={field.max} step={field.step} bind:value={settings[field.key]} required /></label>{/each}</div>
            {#if routingPreset !== 'direct'}<label class="checkbox"><input type="checkbox" bind:checked={settings.roundHidden} />{text('round')}</label>{/if}
          </details>
          <div class="actions">
            <Button type="submit" variant="secondary" disabled={!input || busy}>{text(saved ? 'audit' : 'prepare')}</Button>
            {#if !saved}<Button type="button" variant="destructive" disabled={!prepared || busy} onclick={() => run('solve')}>{text('generate')}</Button>{/if}
          </div>
        </section>
      </fieldset>
    </form>

    <section class="panel preview-panel" bind:this={previewPanel} aria-label={text('heart')} aria-busy={busy}>
      {#if busy}
        <div class="progress" role="status">
          <div><strong>{text(stage)}</strong><p>{elapsed} {text('seconds')}</p></div>
          {#if stage !== 'loading' && stage !== 'exporting'}<Button variant="secondary" onclick={cancel}>{text('cancel')}</Button>{/if}
        </div>
      {/if}
      {#if error}
        <div class="notice error" role="alert">
          <h2>{text(searchTimedOut(errorReport) ? 'timedOut' : errorReport?.status === 'no_validated_solution' ? 'noSolution' : 'failed')}</h2>
          <p>{error}</p>
          {#if errorReport}<p>{text('retryHelp')}</p>{/if}
        </div>
      {/if}
      {#if result}
        <p class="eyebrow">{text(result.report.solver.imported ? 'saved' : 'fresh')}</p>
        <h2>{text(resultTitle as MessageKey)}</h2>
        <div class="view-buttons" role="group" aria-label={text('heart')}>
          {#each resultViews as tab}
            <button class:active={view === tab} type="button" aria-pressed={view === tab} disabled={!result.report.templateExportAllowed && (tab === 'leftTemplate' || tab === 'rightTemplate')} onclick={() => view = tab as typeof view}>{text(tab as MessageKey)}</button>
          {/each}
        </div>
        {#if view === 'sourcePaths' && prepared}
          <SvgPreview svg={prepared.boundaries} alt={text('sourcePaths')} />
          <p class="muted small">{text('sourcePathsHelp')}</p>
        {:else if view === 'sourceMask' && prepared}
          <canvas class="mask" bind:this={maskCanvas} aria-label={text('sourceMask')}></canvas>
          <p class="muted small">{text('sourceMaskHelp')}</p>
        {:else if view === 'comparison' && prepared && result.comparison}
          <ArtworkComparison {prepared} comparison={result.comparison} colours={[leftColour, rightColour]} {lang} />
        {:else}<div class:paper-preview={view === 'paper'}>
          {#if result.files[resultFile]}<SvgPreview svg={result.files[resultFile]} alt={text(view)} />{/if}
          {#if view === 'paper'}<SvgPreview svg={result.files['manufacturability_right.svg']} alt={text('right')} />{/if}
        </div>{/if}
        {#if view === 'paper'}<p class="muted small">{text('paperKey')}</p>{/if}
        <div class="metrics">
          <div><strong>{result.report.slits.left} + {result.report.slits.right}</strong><span>{text('slits')}</span></div>
          <div><strong>{Number.isFinite(result.report.validation.minimumInterSlitDistanceLower) ? result.report.validation.minimumInterSlitDistanceLower.toFixed(2) : '—'}</strong><span>{text('clearance')}</span></div>
          {#if result.report.imageError}<div><strong>{(100 * result.report.imageError.mismatchFraction).toFixed(2)}%</strong><span>{text('imageError')}</span></div>{/if}
        </div>
        {#if !result.report.templateExportAllowed}<p class="notice">{text('withheld')}</p>{/if}
        <p class="muted small">{text('assembly')}</p>
        <div class="actions downloads">
          <Button variant="destructive" disabled={busy} onclick={downloadZip}>{text(result.report.templateExportAllowed ? 'downloadZip' : 'downloadDiagnostics')}</Button>
          {#if result.report.templateExportAllowed}
            <Button variant="secondary" onclick={() => download('template_left.svg')}>{text('downloadLeft')}</Button>
            <Button variant="secondary" onclick={() => download('template_right.svg')}>{text('downloadRight')}</Button>
            <Button variant="secondary" onclick={() => download('print_templates.html')}>{text('downloadPrint')}</Button>
          {/if}
        </div>
        {#if result.report.templateExportAllowed}<p class="muted small">{text('printHelp')}</p>{/if}
      {:else if prepared}
        <h2>{text('prepared')}</h2>
        <p class="muted">{text('inspectHelp')}</p>
        {#if !prepared.metadata.direct}<div class="view-buttons" role="group" aria-label={text('prepared')}>
          <button type="button" class:active={!maskView} aria-pressed={!maskView} onclick={() => maskView = false}>{text('vector')}</button>
          <button type="button" class:active={maskView} aria-pressed={maskView} onclick={() => maskView = true}>{text('mask')}</button>
        </div>{/if}
        {#if maskView}<canvas class="mask" bind:this={maskCanvas} aria-label={text('mask')}></canvas>{:else}<SvgPreview svg={prepared.vector} alt={text('prepared')} />{/if}
        {#if !prepared.metadata.direct}<p class="muted small">{prepared.metadata.curves} {text('segments')} · {prepared.metadata.width} mm
          {#if prepared.metadata.preprocessing} · {(100 * (prepared.metadata.preprocessing.totalChangeFraction ?? prepared.metadata.preprocessing.traceChangeFraction)).toFixed(2)}% {text('traceChange')}{/if}
          {#if prepared.metadata.junctionRepairs?.length} · {prepared.metadata.junctionRepairs.length} {text('merged')}{/if}
        </p>{/if}
        {#if prepared.metadata.preprocessing && prepared.metadata.preprocessing.sourceMaskComponents !== prepared.metadata.preprocessing.vectorSampleComponents}<p class="notice">{text('topologyChange')}</p>{/if}
        <div class="actions">
          <Button variant="destructive" disabled={busy} onclick={() => run('solve')}>{text('generate')}</Button>
          {#if !prepared.metadata.direct}<Button variant="secondary" disabled={busy} onclick={() => download('vector_target.svg', prepared?.boundaries)}>{text('downloadTarget')}</Button>{/if}
          {#if input?.type === 'pixels' && !prepared.metadata.direct}<Button variant="secondary" disabled={busy} onclick={simplify}>{text('simplify')}</Button>{/if}
        </div>
        {#if input?.type === 'pixels' && !prepared.metadata.direct}<p class="muted small">{text('simplifyHelp')}</p>{/if}
      {:else if !busy && !error}
        <div class="empty">
          <img src="{base}/favicon.svg" alt="" width="96" height="96" />
          <h2>{text('idle')}</h2>
          <p>{text('idleHelp')}</p>
          <Button variant="secondary" disabled={!ready} onclick={() => example('waves')}>{text('waves')}</Button>
        </div>
      {/if}
      {#if result || errorReport}
        <details class="report"><summary>{text('details')}</summary>
          {#if result?.report.warnings.length}<ul>{#each result.report.warnings as warning}<li>{warning}</li>{/each}</ul>{/if}
          <pre>{JSON.stringify(result?.report ?? errorReport, null, 2)}</pre>
          <Button variant="secondary" onclick={() => download('report.json', JSON.stringify(result?.report ?? errorReport, null, 2))}>report.json ↓</Button>
        </details>
      {/if}
    </section>
  </div>
  <p class="attribution"><a href={asset('THIRD_PARTY_NOTICES.txt')}>{text('notices')}</a></p>
</div>

<style>
  .studio { max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem 0; }
  .intro { max-width: 760px; margin-bottom: 2rem; }
  h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 650; line-height: 1.15; margin: .7rem 0 1rem; letter-spacing: -.035em; }
  h2 { font-size: 1.2rem; font-weight: 600; margin: 0 0 1rem; }
  h3 { font-size: .95rem; font-weight: 600; margin: 1.2rem 0 .6rem; }
  p { line-height: 1.55; margin: .7rem 0; }
  .badge { display: inline-block; border: 1px solid #688b97; border-radius: 999px; padding: .2rem .7rem; font-size: .75rem; font-weight: 600; }
  .muted { color: #4a5e65; }
  .small, small { font-size: .8rem; line-height: 1.5; }
  .workspace { display: grid; grid-template-columns: minmax(320px, 400px) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  .controls, fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
  fieldset:disabled { opacity: .65; }
  .panel { background: #ffffffd9; border: 1px solid #ffffff; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 16px #4167780a; }
  .controls .panel + .panel { margin-top: 1rem; }
  .upload { border: 1.5px dashed #8daeb9; border-radius: 10px; padding: 1rem; background: #edf5f7; }
  .upload > span { font-weight: 600; }
  .upload input { padding: .25rem 0; background: transparent; border: 0; font-size: .75rem; }
  .filename { font-size: .85rem; font-weight: 600; overflow-wrap: anywhere; }
  .eyebrow { font-size: .75rem; font-weight: 650; color: #4a5e65; letter-spacing: .025em; }
  .examples, .actions, .view-buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
  .examples button, .view-buttons button, .crop-status button { font-size: .75rem; padding: .45rem .65rem; border: 1px solid #c6d6dc; border-radius: 7px; cursor: pointer; background: white; }
  .examples button:hover, .view-buttons button:hover { background: #e5eff2; }
  button:disabled { cursor: default; opacity: .5; }
  label { display: flex; flex-direction: column; gap: .4rem; font-size: .78rem; color: #344c55; }
  input, select { min-width: 0; width: 100%; border: 1px solid #b7cbd3; border-radius: 6px; background: white; padding: .55rem; color: #172b33; font: inherit; font-size: .85rem; }
  input:focus-visible, select:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid #9f2222; outline-offset: 3px; }
  input[type='color'] { height: 38px; padding: .2rem; cursor: pointer; }
  .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem .8rem; }
  .checkbox { flex-direction: row; align-items: center; margin-top: 1rem; }
  .checkbox input { width: 16px; height: 16px; accent-color: #b91313; }
  details { margin-top: 1.1rem; border-top: 1px solid #d7e3e7; padding-top: 1rem; }
  summary { font-size: .85rem; font-weight: 600; cursor: pointer; margin-bottom: .8rem; }
  details > label, details > .field-grid { margin-top: .8rem; }
  .actions { margin-top: 1.2rem; }
  .preview-panel { scroll-margin-top: 5rem; position: sticky; top: 5rem; min-height: 500px; }
  .empty { min-height: 445px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: .5rem; max-width: 360px; margin: auto; color: #4a5e65; }
  .empty img { margin-bottom: 1rem; }
  .empty h2, .empty p { margin: .3rem 0; }
  .empty :global(a), .empty :global(button) { margin-top: 1rem; }
  .notice { background: #fff4da; border: 1px solid #e9d5a7; border-radius: 8px; padding: .85rem; font-size: .85rem; color: #70541e; }
  .notice h2 { font-size: 1rem; }
  .notice.error { background: #fcebe8; border-color: #e9b9b0; color: #823126; overflow-wrap: anywhere; }
  .progress { display: flex; align-items: center; justify-content: space-between; gap: 1rem; background: #e1eff4; border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem; font-size: .85rem; }
  .progress p { margin: .3rem 0 0; color: #4a5e65; font-size: .75rem; }
  .view-buttons { margin: 1rem 0; }
  .view-buttons button.active { background: #294f5e; color: white; border-color: #294f5e; }
  .metrics { display: flex; flex-wrap: wrap; gap: 2rem; padding: 1.1rem 0; border-bottom: 1px solid #d7e3e7; }
  .metrics strong { display: block; font-size: 1.5rem; font-weight: 600; }
  .metrics span { display: block; font-size: .75rem; color: #4a5e65; }
  .paper-preview { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .report pre { max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .7rem; line-height: 1.5; background: #edf3f5; padding: 1rem; border-radius: 8px; }
  .report ul { list-style: disc; padding-left: 1rem; font-size: .8rem; }
  .report li { margin: .5rem 0; }
  .crop-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: .7rem 0; }
  .crop-actions button { font-size: .8rem; padding: .5rem; border: 1px solid #c6d6dc; border-radius: 7px; background: white; cursor: pointer; }
  .crop-actions button.active { background: #294f5e; color: white; }
  .crop-image .detected-outline { fill: none; stroke: #ffe481; stroke-width: 1px; stroke-dasharray: 4 3; }
  .crop-image .region { fill: #ffe48133; stroke: #ffe481; stroke-width: 2px; vector-effect: non-scaling-stroke; }
  .photo-preview { margin: 1rem 0; }
  .photo-preview figcaption { font-size: .8rem; margin-bottom: .4rem; }
  .photo-preview canvas { width: 100%; max-width: 300px; display: block; background: repeating-conic-gradient(#d8dfe1 0% 25%, white 0% 50%) 0 / 16px 16px; }
  .crop-image { touch-action: none; user-select: none; display: block; position: relative; width: 100%; padding: 0; border: 0; margin-top: .8rem; cursor: crosshair; }
  .crop-image:disabled { opacity: 1; }
  .crop-image img { width: 100%; height: auto; display: block; }
  .crop-image svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .crop-image polyline { fill: #ffffff22; stroke: white; stroke-width: 2px; vector-effect: non-scaling-stroke; }
  .corner { position: absolute; transform: translate(-50%, -50%); width: 24px; height: 24px; border-radius: 50%; background: #294f5e; border: 2px solid white; color: white; display: grid; place-items: center; font-size: 12px; pointer-events: none; }
  .crop-status { display: flex; justify-content: space-between; align-items: center; font-size: .75rem; margin: .75rem 0; }
  .coordinates { gap: .5rem; }
  .mask { display: block; width: 100%; max-height: 600px; object-fit: contain; image-rendering: pixelated; }
  .attribution { text-align: center; margin-top: 1.5rem; font-size: .75rem; color: #4a5e65; }
  .attribution a { text-decoration: underline; text-underline-offset: 3px; }
  @media (max-width: 850px) { .workspace { grid-template-columns: 1fr; } .preview-panel { position: static; } .studio { max-width: 650px; } }
  @media (max-width: 420px) { .studio { padding: 1.25rem .75rem 0; } .panel { padding: 1rem; } .metrics { gap: 1rem; } }
</style>

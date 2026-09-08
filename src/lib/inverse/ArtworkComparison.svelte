<script lang="ts">
  import type { Language } from '$lib/i18n';
  import type { DesignResult, PreparedArtwork } from './client';
  import { comparisonPixels } from './comparison';
  import { inverseText, type MessageKey } from './messages';
  import SvgPreview from './SvgPreview.svelte';

  let { prepared, comparison, colours, lang }: {
    prepared: PreparedArtwork;
    comparison: NonNullable<DesignResult['comparison']>;
    colours: [string, string];
    lang: Language;
  } = $props();
  const text = (key: MessageKey) => inverseText(key, lang);
  const blendId = $props.id();
  let mode = $state<'difference' | 'overlay'>('difference');
  let blend = $state(50);
  let showPaths = $state(false);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let raster = $derived(comparisonPixels(prepared.mask, comparison.wovenMask, comparison.resolution, colours, mode, blend / 100, comparison.validMask));

  $effect(() => {
    if (!canvas) return;
    canvas.width = canvas.height = comparison.resolution;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.createImageData(comparison.resolution, comparison.resolution);
    data.data.set(raster.pixels);
    ctx.putImageData(data, 0, 0);
  });
</script>

<div class="comparison-view">
  <p class="help">{text('comparisonHelp')}</p>
  <div class="controls" role="group" aria-label={text('comparison')}>
    <button type="button" class:active={mode === 'difference'} aria-pressed={mode === 'difference'} onclick={() => mode = 'difference'}>{text('differences')}</button>
    <button type="button" class:active={mode === 'overlay'} aria-pressed={mode === 'overlay'} onclick={() => mode = 'overlay'}>{text('overlay')}</button>
  </div>
  {#if mode === 'overlay'}
    <label class="blend-control" for={blendId}>
      <span>{text('weaveOpacity')} <output>{blend}%</output></span>
      <input id={blendId} type="range" min="0" max="100" step="1" bind:value={blend} />
      <span class="range-ends"><span>{text('sourceMask')}</span><span>{text('wovenOverlap')}</span></span>
    </label>
  {:else}
    <div class="legend">
      <span><i class="original-only"></i>{text('originalOnly')}</span>
      <span><i class="weave-only"></i>{text('weaveOnly')}</span>
    </div>
  {/if}
  {#if !prepared.metadata.direct}
    <label class="path-toggle"><input type="checkbox" bind:checked={showPaths} />{text('showSourcePaths')}</label>
  {/if}
  <div class="comparison-image">
    <canvas bind:this={canvas} aria-label={text(mode === 'difference' ? 'differenceImage' : 'overlayImage')}></canvas>
    {#if showPaths && !prepared.metadata.direct}<div class="path-layer" aria-hidden="true"><SvgPreview svg={prepared.boundaries} alt="" /></div>{/if}
  </div>
  <p class="comparison-count" role="status">
    <strong>{raster.fraction === null ? '—' : `${(100 * raster.fraction).toFixed(2)}%`}</strong> {text('imageError')}
    <span>{raster.mismatches.toLocaleString()} / {raster.observed.toLocaleString()} {text('comparedPixels')}</span>
  </p>
</div>

<style>
  .help, .comparison-count { font-size: .8rem; color: #4a5e65; line-height: 1.5; }
  .help { margin: .7rem 0; }
  .controls { display: flex; gap: .4rem; flex-wrap: wrap; }
  button { padding: .45rem .7rem; border: 1px solid #b7cbd3; border-radius: 6px; color: #294f5e; background: white; font: inherit; font-size: .8rem; cursor: pointer; }
  button.active { background: #294f5e; color: white; border-color: #294f5e; }
  button:focus-visible, input:focus-visible { outline: 2px solid #9f2222; outline-offset: 3px; }
  .legend { display: flex; gap: .6rem 1rem; flex-wrap: wrap; margin: .8rem 0; font-size: .75rem; }
  .legend span { display: inline-flex; align-items: center; gap: .35rem; }
  .legend i { display: inline-block; width: .85rem; height: .85rem; border-radius: 2px; }
  .original-only { background: #c02691; }
  .weave-only { background: #007a8f; }
  .blend-control { display: grid; gap: .35rem; margin: .8rem 0; font-size: .8rem; }
  .blend-control output { float: right; }
  .blend-control input { width: 100%; accent-color: #294f5e; }
  .range-ends { display: flex; justify-content: space-between; font-size: .7rem; color: #4a5e65; }
  .path-toggle { display: flex; align-items: center; gap: .4rem; margin: .8rem 0; font-size: .8rem; }
  .path-toggle input { accent-color: #294f5e; }
  .comparison-image { position: relative; max-width: 620px; margin: .8rem auto; background: white; }
  canvas { display: block; width: 100%; height: auto; image-rendering: pixelated; }
  .path-layer { position: absolute; inset: 0; pointer-events: none; }
  .path-layer :global(img) { width: 100%; height: 100%; border-radius: 0; }
  .comparison-count { margin: .8rem 0; }
  .comparison-count strong { color: #172b33; }
  .comparison-count span { display: block; font-size: .7rem; }
</style>

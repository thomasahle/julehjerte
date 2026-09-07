<!--
  One lobe's cutting template: the outline, the fold line and the strip cuts,
  as the detail page's big view and its thumbnails show them.

  Public class hook: `.template-preview` on the wrapper, so a caller can size
  the flex column it makes (HeartStage's thumbnails do). The <svg> paints no
  background of its own — the surface belongs to whoever places it.
-->
<script lang="ts">
  import type { HeartDesign } from '$lib/types/heart';
  import { getTemplateData } from '$lib/utils/templateSvg';

  interface Props {
    design: HeartDesign;
    lobe: 'left' | 'right';
    size?: number;
    label?: string;
  }

  let { design, lobe, size = 300, label }: Props = $props();

  const templateData = $derived(getTemplateData(design, lobe));
  const earRadius = $derived(templateData.earRadius);
  const templateWidth = $derived(templateData.templateWidth);
  const templateHeight = $derived(templateData.templateHeight);

  // Scale to fit in size
  const scale = $derived(Math.min((size * 0.9) / templateWidth, (size * 0.9) / templateHeight));
  const scaledWidth = $derived(templateWidth * scale);
  const scaledHeight = $derived(templateHeight * scale);
  const offsetX = $derived((size - scaledWidth) / 2);
  const offsetY = $derived((size - scaledHeight) / 2);
  const earPath = $derived(templateData.earPath);
  const transformedPaths = $derived(templateData.cutPaths);
</script>

<div class="template-preview">
  {#if label}
    <div class="template-label">{label}</div>
  {/if}
  <svg
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
  >
    <g transform="translate({offsetX}, {offsetY}) scale({scale})">
      <!-- Semicircle ear at top -->
      <path
        d={earPath}
        fill="none"
        stroke="#333"
        stroke-width={1.5 / scale}
      />

      <!-- Left edge -->
      <line
        x1={0}
        y1={earRadius}
        x2={0}
        y2={templateHeight}
        stroke="#333"
        stroke-width={1.5 / scale}
      />

      <!-- Right edge -->
      <line
        x1={templateWidth}
        y1={earRadius}
        x2={templateWidth}
        y2={templateHeight}
        stroke="#333"
        stroke-width={1.5 / scale}
      />

      <!-- Bottom edge (fold line - dashed) -->
      <line
        x1={0}
        y1={templateHeight}
        x2={templateWidth}
        y2={templateHeight}
        stroke="#333"
        stroke-width={1.5 / scale}
        stroke-dasharray="{8 / scale} {4 / scale}"
      />

      <!-- Cut lines (finger boundaries) -->
      {#each transformedPaths as pathD, i (i)}
        <path
          d={pathD}
          fill="none"
          stroke="#333"
          stroke-width={1.5 / scale}
        />
      {/each}
    </g>
  </svg>
</div>

<style>
  .template-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .template-label {
    font-size: 14px;
    color: var(--muted);
    font-weight: 500;
  }

  /* No background of its own: the preview is drawn on whatever surface it is
     placed on (the detail page's stage and its thumbnails both supply one). */
  svg {
    background: transparent;
    border-radius: 8px;
    max-width: 100%;
    height: auto;
  }
</style>

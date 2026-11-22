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
  import { markPathData, shownTemplateMarks } from '$lib/utils/orientationMarks';
  import { heartScale } from '$lib/laser/unfold';

  interface Props {
    design: HeartDesign;
    lobe: 'left' | 'right';
    size?: number;
    label?: string;
    /**
     * Draw the orientation marks ($lib/utils/orientationMarks), sized as on
     * a template printed at the download's default width. The stage's 104 px
     * thumbnails leave them out: a cross of a pixel or two reads as dirt.
     */
    marks?: boolean;
    /**
     * Draw the piece as paper with a shadow, in the colour its lobe has in the
     * heart (the site's paper pair, --paper-left / --paper-right), on the heart
     * page's stage. The colour says which sheet the piece is cut from, and that
     * the picture is a picture: the lines to trace are in "Tegn af" and the PDF.
     * The piece also lies as it does in the woven heart: the left lobe's leaning
     * left and turned over, the right lobe's leaning right (see `placement`).
     */
    paper?: boolean;
    /**
     * With `paper`: the one template both lobes are cut from. It is drawn in
     * the right lobe's colour and place, with a piece in the left lobe's colour behind it.
     */
    shared?: boolean;
  }

  let { design, lobe, size = 300, label, marks = true, paper = false, shared = false }: Props = $props();

  /** Which lobe's paper the piece is drawn in. */
  const side = $derived(shared ? 'right' : lobe);

  /** The download dialog's default width (DEFAULT_WIDTH_MM in $lib/laser/export, not imported to keep the laser writers off this page). */
  const PRINT_WIDTH_MM = 80;

  const templateData = $derived(getTemplateData(design, paper ? side : lobe));
  const earRadius = $derived(templateData.earRadius);
  const templateWidth = $derived(templateData.templateWidth);
  const templateHeight = $derived(templateData.templateHeight);

  /**
   * Where the piece lies, as an SVG transform. Flat, it stands upright and is
   * scaled to fit. As paper it lies as in the heart: the editor's frame has
   * the left lobe's ear to the left of the overlap square and the right
   * lobe's above it, with the left lobe's template taking the square's y as
   * its x ($lib/utils/orientationMarks), and the heart is that frame turned
   * 45° clockwise. So the right lobe's piece is turned 45°, and the left
   * lobe's has x and y swapped first.
   */
  const placement = $derived.by(() => {
    const W = templateWidth;
    const H = templateHeight;
    const R = earRadius;
    if (!paper) {
      const k = Math.min((size * 0.9) / W, (size * 0.9) / H);
      return { scale: k, transform: `translate(${(size - W * k) / 2}, ${(size - H * k) / 2}) scale(${k})` };
    }
    const c = Math.SQRT1_2;
    const swap = side === 'left';
    const place = (x: number, y: number) => {
      const [a, b] = swap ? [y, x] : [x, y];
      return { x: (a - b) * c, y: (a + b) * c };
    };
    const corners = [place(0, R), place(W, R), place(0, H), place(W, H)];
    const ear = place(W / 2, R);
    const xs = [...corners.map((p) => p.x), ear.x - W / 2, ear.x + W / 2];
    const ys = [...corners.map((p) => p.y), ear.y - W / 2, ear.y + W / 2];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const k = Math.min((size * 0.9) / (maxX - minX), (size * 0.9) / (maxY - minY));
    const tx = size / 2 - ((minX + maxX) / 2) * k;
    const ty = size / 2 - ((minY + maxY) / 2) * k;
    return {
      scale: k,
      transform: `translate(${tx}, ${ty}) scale(${k}) rotate(45)${swap ? ' matrix(0 1 1 0 0 0)' : ''}`
    };
  });
  const scale = $derived(placement.scale);
  const earPath = $derived(templateData.earPath);
  const transformedPaths = $derived(templateData.cutPaths);
  const orientationMarks = $derived(
    marks ? shownTemplateMarks(design, lobe, heartScale(design, PRINT_WIDTH_MM)) : []
  );
</script>

<div class="template-preview">
  {#if label}
    <div class="template-label">{label}</div>
  {/if}
  <svg
    class:paper
    class:ink-left={paper && side === 'left'}
    class:ink-right={paper && side === 'right'}
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
  >
    <g transform={placement.transform}>
      {#if paper}
        {#if shared}
          <!-- The other colour's piece, cut from the same template, behind and a little aside. -->
          <g class="fill-left" transform="translate({templateWidth * 0.06}, {-templateWidth * 0.06})">
            <path d={earPath} stroke="none" />
            <rect x={0} y={earRadius} width={templateWidth} height={templateHeight - earRadius} />
          </g>
        {/if}
        <!-- The piece itself: the ear and the rectangle under it. -->
        <g class={side === 'left' ? 'fill-left' : 'fill-right'}>
          <path d={earPath} stroke="none" />
          <rect x={0} y={earRadius} width={templateWidth} height={templateHeight - earRadius} />
        </g>
      {/if}
      <!-- Semicircle ear at top -->
      <path
        d={earPath}
        class="line"
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
        class="line"
        stroke="#333"
        stroke-width={1.5 / scale}
      />

      <!-- Right edge -->
      <line
        x1={templateWidth}
        y1={earRadius}
        x2={templateWidth}
        y2={templateHeight}
        class="line"
        stroke="#333"
        stroke-width={1.5 / scale}
      />

      <!-- Bottom edge (fold line - dashed) -->
      <line
        x1={0}
        y1={templateHeight}
        x2={templateWidth}
        y2={templateHeight}
        class="line"
        stroke="#333"
        stroke-width={1.5 / scale}
        stroke-dasharray="{8 / scale} {4 / scale}"
      />

      <!-- Cut lines (finger boundaries) -->
      {#each transformedPaths as pathD, i (i)}
        <path
          d={pathD}
          class="line"
          fill="none"
          stroke="#333"
          stroke-width={1.5 / scale}
        />
      {/each}

      <!-- Orientation marks: where this piece meets the other at the top of the heart -->
      {#each orientationMarks as mark, i (i)}
        <path
          class="mark line"
          data-mark={mark.kind}
          d={markPathData(mark)}
          fill="none"
          stroke="#333"
          stroke-width={1 / scale}
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

  /* The piece in its lobe's paper; the fallbacks are the classic pair. */
  .fill-left {
    fill: var(--paper-left, #ffffff);
  }

  .fill-right {
    fill: var(--paper-right, rgb(185, 19, 19));
  }

  /* The lines must show on any paper: dark on a light one, white on a dark one
     (the lightness is stepped at 0.62, between orange and red). */
  svg.paper .line {
    stroke: var(--ink, #333);
  }

  @supports (color: oklch(from red l c h)) {
    svg.ink-left {
      --ink: oklch(from var(--paper-left, #ffffff) calc(0.32 + 0.68 * clamp(0, (0.62 - l) * 1000, 1)) 0 0);
    }

    svg.ink-right {
      --ink: oklch(from var(--paper-right, rgb(185, 19, 19)) calc(0.32 + 0.68 * clamp(0, (0.62 - l) * 1000, 1)) 0 0);
    }
  }

  /* The same soft shadow the hanging heart casts. */
  svg.paper {
    overflow: visible;
    filter: drop-shadow(0 8px 14px var(--shadow-color));
  }
</style>

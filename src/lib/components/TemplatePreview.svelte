<!--
  A heart's cutting templates: the outline, the fold line and the strip cuts.
  One lobe's, flat, for the generator; or both as paper, pulled apart, as the
  detail page's big view and its thumbnail show them.

  Public class hook: `.template-preview` on the wrapper, so a caller can size
  the flex column it makes (HeartStage's thumbnails do). The <svg> paints no
  background of its own — the surface belongs to whoever places it.
-->
<script lang="ts">
  import type { HeartDesign } from '$lib/types/heart';
  import { getTemplateData } from '$lib/utils/templateSvg';
  import { markPathData, shownTemplateMarks } from '$lib/utils/orientationMarks';
  import { heartScale } from '$lib/laser/unfold';

  type Lobe = 'left' | 'right';

  interface Props {
    design: HeartDesign;
    /** Which lobe's template to draw. With `paper` both are drawn and this is not read. */
    lobe?: Lobe;
    size?: number;
    label?: string;
    /**
     * Draw the orientation marks ($lib/utils/orientationMarks), sized as on
     * a template printed at the download's default width. The stage's 104 px
     * thumbnails leave them out: a cross of a pixel or two reads as dirt.
     */
    marks?: boolean;
    /**
     * Draw both pieces as paper with a shadow, each in the colour its lobe has
     * in the heart (the site's paper pair, --paper-left / --paper-right), on
     * the heart page's stage: the heart pulled apart. Each piece lies as it
     * does in the woven heart, the left lobe's leaning left and turned over,
     * the right lobe's leaning right, slid back along its own strips until only
     * the strip ends still overlap (see `placement`). The colours say which
     * sheet a piece is cut from, the picture shows which way up each goes
     * also when both are cut from one template, and it does not look like
     * something to trace: those lines are in "Tegn af" and the PDF.
     */
    paper?: boolean;
    /**
     * With `paper`: fill a small square tile. The picture is twice as wide as
     * it is high, so it is drawn with its paper as large as the heart tile's
     * (HEART_SPAN), which is larger than fits, and runs out over the
     * <svg>'s sides: the tile, which clips, cuts the ears' outer ends off at
     * its border.
     */
    crop?: boolean;
  }

  let { design, lobe = 'left', size = 300, label, marks = true, paper = false, crop = false }: Props = $props();

  /** The download dialog's default width (DEFAULT_WIDTH_MM in $lib/laser/export, not imported to keep the laser writers off this page). */
  const PRINT_WIDTH_MM = 80;

  /** How far each piece is slid out of the heart, in overlap squares: the strip ends still lie over each other. */
  const PULL = 0.8;
  /**
   * A cropped picture's paper is the size of the woven heart's in a picture of
   * the same size (PaperHeartSVG, the tile beside it): there the heart, one
   * overlap square times 1 + √½ wide, fills the picture but for a margin of
   * 0.021 of its width on each side (computeHeartViewBoxFromOverlap's default).
   */
  const HEART_SPAN = (1 + Math.SQRT1_2) * (1 + 2 * 0.021);

  /**
   * The pieces and where they lie, as SVG transforms. Flat, the one piece
   * stands upright and is scaled to fit. As paper they lie as in the heart:
   * the editor's frame has the left lobe's ear to the left of the overlap
   * square and the right lobe's above it, with the left lobe's template
   * taking the square's y as its x ($lib/utils/orientationMarks), and the
   * heart is that frame turned 45° clockwise. So the right lobe's piece is
   * turned 45°, and the left lobe's has x and y swapped first; each is then
   * moved PULL squares towards its own ear, which is along its strips.
   */
  const placement = $derived.by(() => {
    if (!paper) {
      const data = getTemplateData(design, lobe);
      const W = data.templateWidth;
      const H = data.templateHeight;
      const k = Math.min((size * 0.9) / W, (size * 0.9) / H);
      return {
        scale: k,
        transform: `translate(${(size - W * k) / 2}, ${(size - H * k) / 2}) scale(${k})`,
        pieces: [{ side: lobe, data, transform: '' }]
      };
    }
    const c = Math.SQRT1_2;
    const xs: number[] = [];
    const ys: number[] = [];
    const pieces = (['left', 'right'] as const).map((side) => {
      const data = getTemplateData(design, side);
      const W = data.templateWidth;
      const H = data.templateHeight;
      const R = data.earRadius;
      const swap = side === 'left';
      // In the frame, the piece's rectangle starts where its ear ends.
      const dx = swap ? -R - W * PULL : 0;
      const dy = swap ? 0 : -R - W * PULL;
      const place = (x: number, y: number) => {
        const a = (swap ? y : x) + dx;
        const b = (swap ? x : y) + dy;
        return { x: (a - b) * c, y: (a + b) * c };
      };
      const ear = place(W / 2, R);
      for (const p of [place(0, R), place(W, R), place(0, H), place(W, H)]) {
        xs.push(p.x);
        ys.push(p.y);
      }
      xs.push(ear.x - W / 2, ear.x + W / 2);
      ys.push(ear.y - W / 2, ear.y + W / 2);
      return { side, data, transform: `rotate(45) translate(${dx}, ${dy})${swap ? ' matrix(0 1 1 0 0 0)' : ''}` };
    });
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const fit = Math.min((size * 0.9) / (maxX - minX), (size * 0.9) / (maxY - minY));
    const k = crop ? size / (pieces[0].data.templateWidth * HEART_SPAN) : fit;
    const tx = size / 2 - ((minX + maxX) / 2) * k;
    const ty = size / 2 - ((minY + maxY) / 2) * k;
    return { scale: k, transform: `translate(${tx}, ${ty}) scale(${k})`, pieces };
  });
  const scale = $derived(placement.scale);
  const printScale = $derived(marks ? heartScale(design, PRINT_WIDTH_MM) : 1);
</script>

<div class="template-preview">
  {#if label}
    <div class="template-label">{label}</div>
  {/if}
  <svg class:paper width={size} height={size} viewBox="0 0 {size} {size}">
    {#each placement.pieces as piece (piece.side)}
        {@const data = piece.data}
        {@const W = data.templateWidth}
        {@const H = data.templateHeight}
        {@const R = data.earRadius}
        <!-- The shadow is cast by the outer group, so it falls down the page, not along the turned piece. -->
        <g class={paper ? `piece ink-${piece.side}` : undefined}>
        <g transform="{placement.transform} {piece.transform}">
          {#if paper}
            <!-- The paper itself: the ear and the rectangle under it. -->
            <g class="fill-{piece.side}">
              <path d={data.earPath} stroke="none" />
              <rect x={0} y={R} width={W} height={H - R} />
            </g>
          {/if}
          <!-- Semicircle ear at top -->
          <path d={data.earPath} class="line" fill="none" stroke="#333" stroke-width={1.5 / scale} />

          <!-- Left edge -->
          <line x1={0} y1={R} x2={0} y2={H} class="line" stroke="#333" stroke-width={1.5 / scale} />

          <!-- Right edge -->
          <line x1={W} y1={R} x2={W} y2={H} class="line" stroke="#333" stroke-width={1.5 / scale} />

          <!-- Bottom edge (fold line - dashed) -->
          <line
            x1={0}
            y1={H}
            x2={W}
            y2={H}
            class="line"
            stroke="#333"
            stroke-width={1.5 / scale}
            stroke-dasharray="{8 / scale} {4 / scale}"
          />

          <!-- Cut lines (finger boundaries) -->
          {#each data.cutPaths as pathD, i (i)}
            <path d={pathD} class="line" fill="none" stroke="#333" stroke-width={1.5 / scale} />
          {/each}

          <!-- Orientation marks: where this piece meets the other at the top of the heart -->
          {#if marks}
            {#each shownTemplateMarks(design, piece.side, printScale) as mark, i (i)}
              <path
                class="mark line"
                data-mark={mark.kind}
                d={markPathData(mark)}
                fill="none"
                stroke="#333"
                stroke-width={1 / scale}
              />
            {/each}
          {/if}
        </g>
        </g>
    {/each}
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
    .ink-left {
      --ink: oklch(from var(--paper-left, #ffffff) calc(0.32 + 0.68 * clamp(0, (0.62 - l) * 1000, 1)) 0 0);
    }

    .ink-right {
      --ink: oklch(from var(--paper-right, rgb(185, 19, 19)) calc(0.32 + 0.68 * clamp(0, (0.62 - l) * 1000, 1)) 0 0);
    }
  }

  /* The same soft shadow the hanging heart casts, from each piece: the upper one's falls on the lower. */
  svg.paper {
    overflow: visible;
  }

  .piece {
    filter: drop-shadow(0 8px 14px var(--shadow-color));
  }
</style>

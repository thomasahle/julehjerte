<script lang="ts">
  import type { HeartDesign, Finger } from '$lib/types/heart';
  import { segmentsToPathData } from '$lib/geometry/bezierSegments';
  import { inferOverlapRect } from '$lib/utils/overlapRect';

  interface Props {
    design: HeartDesign;
    lobe: 'left' | 'right';
    size?: number;
    label?: string;
  }

  let { design, lobe, size = 300, label }: Props = $props();

  // Transform path data for template orientation
  function transformPathData(
    pathData: string,
    overlapTop: number,
    overlapLeft: number,
    overlapWidth: number,
    overlapHeight: number,
    earRadius: number,
    targetLobe: 'left' | 'right'
  ): string {
    const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
    let result = '';

    for (const cmd of commands) {
      const type = cmd[0].toUpperCase();
      const args = cmd
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .map(Number);

      if (type === 'M') {
        const [x, y] = args;
        if (targetLobe === 'left') {
          const newX = y - overlapTop;
          const newY = overlapWidth - (x - overlapLeft) + earRadius;
          result += `M ${newX} ${newY} `;
        } else {
          const newX = x - overlapLeft;
          const newY = y - overlapTop + earRadius;
          result += `M ${newX} ${newY} `;
        }
      } else if (type === 'C') {
        if (targetLobe === 'left') {
          const newArgs = [];
          for (let i = 0; i < args.length; i += 2) {
            const x = args[i];
            const y = args[i + 1];
            const newX = y - overlapTop;
            const newY = overlapWidth - (x - overlapLeft) + earRadius;
            newArgs.push(newX, newY);
          }
          result += `C ${newArgs.join(' ')} `;
        } else {
          const newArgs = [];
          for (let i = 0; i < args.length; i += 2) {
            const x = args[i];
            const y = args[i + 1];
            const newX = x - overlapLeft;
            const newY = y - overlapTop + earRadius;
            newArgs.push(newX, newY);
          }
          result += `C ${newArgs.join(' ')} `;
        }
      } else if (type === 'L') {
        const [x, y] = args;
        if (targetLobe === 'left') {
          const newX = y - overlapTop;
          const newY = overlapWidth - (x - overlapLeft) + earRadius;
          result += `L ${newX} ${newY} `;
        } else {
          const newX = x - overlapLeft;
          const newY = y - overlapTop + earRadius;
          result += `L ${newX} ${newY} `;
        }
      }
    }

    return result.trim();
  }

  // Generate arc path for semicircle
  function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const startX = cx + r * Math.cos(startAngle);
    const startY = cy + r * Math.sin(startAngle);
    const endX = cx + r * Math.cos(endAngle);
    const endY = cy + r * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
  }

  // Compute template geometry
  const rect = $derived(inferOverlapRect(design.fingers, design.gridSize));
  const overlapWidth = $derived(rect.width);
  const overlapHeight = $derived(rect.height);
  const earRadius = $derived(lobe === 'left' ? overlapHeight / 2 : overlapWidth / 2);
  const bodyWidth = $derived(lobe === 'left' ? overlapHeight : overlapWidth);
  const bodyHeight = $derived(lobe === 'left' ? overlapWidth : overlapHeight);
  const templateWidth = $derived(bodyWidth);
  const templateHeight = $derived(bodyHeight + earRadius);

  // Scale to fit in size
  const scale = $derived(Math.min((size * 0.9) / templateWidth, (size * 0.9) / templateHeight));
  const scaledWidth = $derived(templateWidth * scale);
  const scaledHeight = $derived(templateHeight * scale);
  const offsetX = $derived((size - scaledWidth) / 2);
  const offsetY = $derived((size - scaledHeight) / 2);

  // Get fingers for this lobe
  const lobeFingers = $derived(design.fingers.filter((f: Finger) => f.lobe === lobe));

  // Generate paths
  const earPath = $derived(arcPath(
    templateWidth / 2,
    earRadius,
    earRadius,
    Math.PI,
    2 * Math.PI
  ));

  const transformedPaths = $derived(
    lobeFingers.map((finger: Finger) =>
      transformPathData(
        segmentsToPathData(finger.segments),
        rect.top,
        rect.left,
        overlapWidth,
        overlapHeight,
        earRadius,
        lobe
      )
    )
  );
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
      {#each transformedPaths as pathD}
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
    font-size: 0.9rem;
    color: #666;
    font-weight: 500;
  }

  svg {
    background: #fafafa;
    border-radius: 8px;
    max-width: 100%;
    height: auto;
  }
</style>

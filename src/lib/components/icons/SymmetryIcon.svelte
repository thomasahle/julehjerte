<!--
  One glyph of the editor's symmetry rows: `row` says which subject is drawn
  (a curve, a lobe, both lobes), `mode` which of Fra / Sym / Anti it is in.
  The drawing itself is a lookup in ./symmetryIcons, so the nine glyphs are one
  component and one table (docs/redesign/symmetri-ikoner.html, "Familie A").

  Stroke 1.8 on the 24-unit grid, as the source page drew them — thinner than
  the tool rail's 2, because these are read at 28px inside a segment button and
  carry more line. `currentColor` throughout, so a selected segment inverts the
  whole glyph to white on green along with its word.
-->
<script lang="ts">
	import type { IconProps } from './types';
	import {
		SOFT_OPACITY,
		SYMMETRY_ICON_PATHS,
		type SymmetryIconMode,
		type SymmetryIconRow
	} from './symmetryIcons';

	let {
		row,
		mode,
		size = 28,
		class: className = undefined,
		...rest
	}: IconProps & { row: SymmetryIconRow; mode: SymmetryIconMode } = $props();

	const paths = $derived(SYMMETRY_ICON_PATHS[row][mode]);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	class={className}
	{...rest}
>
	{#each paths as path (path.d + (path.transform ?? ''))}
		<!-- The accent is the second colour a two-coloured glyph uses for the
		     following cut. It reads --icon-accent so the segment can hand it a
		     pale tint when it is selected: full --red on the green ground would
		     be unreadable. -->
		<path
			d={path.d}
			transform={path.transform}
			opacity={path.soft ? SOFT_OPACITY : undefined}
			stroke={path.accent ? 'var(--icon-accent, var(--red))' : undefined}
		/>
	{/each}
</svg>

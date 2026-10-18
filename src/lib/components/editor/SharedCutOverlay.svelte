<script lang="ts">
	import type { Finger } from '$lib/types/heart';
	import { segmentsToPathData } from '$lib/geometry/bezierSegments';
	import { LOBE_OUTLINE_COLORS } from '$lib/editor/outlineColors';

	let { fingers, excluded, idPrefix, unitsPerPixel, bounds }: {
		fingers: Finger[];
		excluded: Set<string>;
		idPrefix: string;
		unitsPerPixel: number;
		bounds: { left: number; top: number; width: number; height: number };
	} = $props();

	const paths = $derived(fingers.filter(f => !excluded.has(f.id)).map(f => ({
		id: f.id, lobe: f.lobe, d: segmentsToPathData(f.segments)
	})));
	const left = $derived(paths.filter(p => p.lobe === 'left'));
	const right = $derived(paths.filter(p => p.lobe === 'right'));
	const dash = $derived(4 * unitsPerPixel);
	const margin = $derived(4 * unitsPerPixel);
</script>

<!-- This is the intersection of the *displayed strokes*, not a geometry or
     validity test. Masking handles reversed curves and differently subdivided
     paths without an expensive curve-matching pass during editing. -->
{#if left.length && right.length}
	<g class="shared-cut-overlay" pointer-events="none" aria-hidden="true">
		<defs>
			<mask id="{idPrefix}-shared-cut-mask" maskUnits="userSpaceOnUse"
				x={bounds.left - margin} y={bounds.top - margin}
				width={bounds.width + 2 * margin} height={bounds.height + 2 * margin}
				style="mask-type: alpha">
				{#each left as path (path.id)}
					<path d={path.d} fill="none" stroke="white" stroke-width={2 * unitsPerPixel}
						stroke-linecap="round" stroke-linejoin="round" />
				{/each}
			</mask>
		</defs>
		<g mask="url(#{idPrefix}-shared-cut-mask)">
			{#each right as path (path.id)}
				<path d={path.d} fill="none" stroke={LOBE_OUTLINE_COLORS.left}
					stroke-width={2 * unitsPerPixel} stroke-linecap="round" stroke-linejoin="round" />
				<!-- Dash along the path: a fixed hatch could hide one colour when
				     a cut runs parallel to its stripes. Keep the dashes screen-sized. -->
				<path d={path.d} fill="none" stroke={LOBE_OUTLINE_COLORS.right}
					stroke-width={2 * unitsPerPixel} stroke-dasharray="{dash} {dash}"
					stroke-linecap="butt" stroke-linejoin="round" />
			{/each}
		</g>
	</g>
{/if}

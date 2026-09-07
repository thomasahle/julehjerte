<!--
  The winter landscape drawing, inlined so its <defs> can be reused.

  IMPORTANT: render this at most **once per page**. The drawing's ids (pine-a,
  pine-b, pine-c, snow-cap, star and the gradients) are global to the document,
  and a second copy would make `url(#…)`/`<use href="#…">` resolve to whichever
  copy came first. Conversely, a page that uses <Fir> or `<use href="#star">`
  must render <Landscape> too, or those shapes come out empty.

  The drawing is 2172x724 and always ends in #f9f9f3 snow (= --page), so it
  joins the page background without a seam. Placement (absolute wrapper at
  bottom: -1px, section overflow hidden, the in-flow band under 900px) is up to
  the page — see docs/redesign/DESIGN.md §2.
-->
<script lang="ts">
	import { LANDSCAPE_INNER, LANDSCAPE_VIEWBOX } from '$lib/landscape';

	interface Props {
		/** Class for the <svg> itself, e.g. "hero-land" or "land". */
		class?: string;
	}

	let { class: className = undefined }: Props = $props();
</script>

<svg
	class={className}
	viewBox={LANDSCAPE_VIEWBOX}
	preserveAspectRatio="xMidYMax meet"
	aria-hidden="true"
	focusable="false">{@html LANDSCAPE_INNER}</svg
>

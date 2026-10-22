<!--
  The last card of a gallery category whose kind of heart a visitor can make
  themselves — docs/redesign/DESIGN.md §3 "Gallery". It hangs like the hearts
  before it, on the next ribbon and strand, but its heart is a blank one, a
  dashed outline with a plus in the paper's colours, which it takes as the hearts
  do (the site's pair, or in the colourful mode a pair of its own), and its name
  is the way there: "Lav dit eget
  mønster" opens Tegn, "Lav dit eget flisemønster" its Escher tab, "Lav din
  egen figur" the design page's figures. The whole card is one link.
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import { slotStyle } from '$lib/utils/palette';
	import { CARD_HEART_SIZE, cardRibbon, cardSway } from '$lib/components/HeartCard.svelte';

	interface Props {
		href: string;
		label: string;
		/** Its place in the category grid, after the hearts: the ribbon and sway carry on from theirs. */
		index: number;
		/** The grid column it hangs in, as the cards do (see HeartCard); unset: none. */
		strand?: number;
		/** Unique within the page, for the heart's ids. */
		id: string;
		/** The colourful mode's pair for it: the one after the last heart in its row (`pairSlotAfter`). */
		slot: number;
	}

	let { href, label, index, strand = undefined, id, slot }: Props = $props();

	// The gallery hearts' outline: a square on its point, a half circle on each upper side. The left
	// paper fills it; the right paper, which the ribbon is too, draws its dashes and the plus.
	const BLANK = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
		<path d="M50 95 L13 58 A26.16 26.16 0 0 1 50 21 A26.16 26.16 0 0 1 87 58 Z" style="fill: var(--paper-left); stroke: var(--paper-right); stroke-width: 1.4; stroke-dasharray: 4 3" />
		<path d="M50 46 V70 M38 58 H62" style="fill: none; stroke: var(--paper-right); stroke-width: 4; stroke-linecap: round" />
	</svg>`;
</script>

<a
	class="make"
	{href}
	style:--card-height="{CARD_HEART_SIZE + 120}px"
	style:--strand={strand === undefined ? undefined : `var(--strand-${strand})`}
>
	<div class="make-heart" data-pair={slot} style={slotStyle(slot)}>
		<HangingHeart markup={BLANK} size={CARD_HEART_SIZE} ribbon={cardRibbon(index)} delay={cardSway(index)} idPrefix="make-{id}" />
	</div>
	<span class="name">{label}</span>
</a>

<style>
	/* The card's box and strand (HeartCard), as one link. */
	.make {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: 14px;
		color: var(--ink);
		text-decoration: none;
		transition: transform 0.2s;
		translate: 0 var(--strand, 0px);
	}

	@media (min-width: 900px) {
		.make {
			height: var(--card-height);
		}
	}

	.make:hover {
		transform: scale(1.02);
	}

	.make:focus-visible {
		outline: 3px solid var(--blue);
		outline-offset: 4px;
	}

	.make-heart {
		display: flex;
		justify-content: center;
		width: 100%;
		padding: 0 4px;
		box-sizing: border-box;
		pointer-events: none;
	}

	/* Where a card has its name and difficulty: under the heart. */
	.name {
		padding-bottom: 22px;
		font-size: 16px;
		font-weight: 600;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.make:hover .name {
		text-decoration: underline;
	}

	@media (max-width: 599px) {
		.make-heart :global(.hang) {
			max-width: 88%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.make {
			transition: none;
		}
	}
</style>

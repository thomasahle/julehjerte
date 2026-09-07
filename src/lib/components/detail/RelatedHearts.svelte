<!--
  "Flere stjerner" — the row of other hearts from the same category under the
  detail scene, with a link to that category's section on the front page
  (docs/redesign/DESIGN.md §4).

  The hearts are resolved in the route's load(), so the row and its links are in
  the prerendered HTML.
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import { ArrowRightIcon } from '$lib/components/icons';
	import { categoryTitleLower } from '$lib/data/categories';
	import { t, type Language } from '$lib/i18n';
	import { categoryHref, heartHref } from '$lib/i18n/routes';
	import type { HeartDesign } from '$lib/types/heart';

	interface Props {
		hearts: { id: string; name: string; design: HeartDesign }[];
		/** The category these hearts belong to — also the front page anchor. */
		categoryId: string;
		/** Hearts in the whole category, for "Se alle N …". */
		categoryCount: number;
		lang: Language;
	}

	let { hearts, categoryId, categoryCount, lang }: Props = $props();

	// The gallery cards' ribbon lengths, at 60% for these smaller hearts.
	const RIBBONS = [26, 54, 38, 66, 44];

	let categoryName = $derived(categoryTitleLower(categoryId, lang));
	let heading = $derived(t('moreInCategory', lang).replace('{category}', categoryName));
	let seeAll = $derived(
		t('seeAllInCategory', lang)
			.replace('{n}', String(categoryCount))
			.replace('{category}', categoryName)
	);
</script>

<section class="related">
	<div class="related-head">
		<h2>{heading}</h2>
		<a class="see-all" href={categoryHref(categoryId, lang)}>
			{seeAll}
			<ArrowRightIcon size={16} />
		</a>
	</div>
	<div class="related-grid">
		{#each hearts as heart, i (heart.id)}
			<a class="related-item" href={heartHref(heart.id, lang)}>
				<span class="related-hang">
					<HangingHeart
						design={heart.design}
						size={120}
						ribbon={RIBBONS[i % RIBBONS.length] * 0.6}
						delay={i * 0.6}
						idPrefix="rel-{heart.id}"
					/>
				</span>
				<span class="related-name">{heart.name}</span>
			</a>
		{/each}
	</div>
</section>

<style>
	.related {
		max-width: 1280px;
		width: 100%;
		margin: 0 auto;
		padding: 8px 40px 56px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.related-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		border-bottom: 1px solid var(--line);
		padding-bottom: 8px;
	}

	.related-head h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	.see-all {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
		color: var(--green);
		text-decoration: none;
	}

	.see-all:hover {
		color: var(--red);
	}

	.related-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 20px;
		margin-top: 8px;
	}

	.related-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		height: 190px;
		text-decoration: none;
	}

	.related-hang {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.related-name {
		margin-top: auto;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		text-align: center;
	}

	.related-item:hover .related-name {
		color: var(--red);
	}

	@media (max-width: 899px) {
		.related {
			padding: 8px 24px 40px;
		}
	}

	@media (max-width: 599px) {
		.related {
			padding: 8px 16px 32px;
		}

		.related-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 14px;
		}
	}
</style>

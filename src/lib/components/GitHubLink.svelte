<!--
  The GitHub link with its star count, in the two shapes the redesign uses:
  a bordered pill (nav) and a plain green link (footer).

  The count is fetched once per hour and cached in localStorage; until it
  resolves — and in the prerendered HTML — nothing is shown in its place, so the
  markup does not shift on hydration.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { StarIcon } from '$lib/components/icons';
	import { formatStars, loadStarCount } from '$lib/githubStars';

	interface Props {
		repo?: string;
		href?: string;
		/** 'pill' for the nav, 'plain' for the footer. */
		variant?: 'pill' | 'plain';
		showCount?: boolean;
		class?: string;
	}

	let {
		repo = 'thomasahle/julehjerte',
		href = undefined,
		variant = 'pill',
		showCount = true,
		class: className = ''
	}: Props = $props();

	let stars = $state<number | null>(null);
	let url = $derived(href ?? `https://github.com/${repo}`);

	onMount(() => {
		let cancelled = false;
		void loadStarCount(repo).then((value) => {
			if (!cancelled) stars = value;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<a
	href={url}
	target="_blank"
	rel="noopener"
	class="gh {variant === 'pill' ? 'pill' : 'plain'} {className}"
>
	<StarIcon size={14} />
	<span>GitHub</span>
	{#if showCount && stars !== null}
		<span class="count">{formatStars(stars)}</span>
	{/if}
</a>

<style>
	.gh {
		text-decoration: none;
	}

	.plain {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--green);
		font-size: 14px;
		font-weight: 600;
	}

	.plain:hover {
		color: var(--red);
	}

	.count {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
</style>

<!--
  “Mit hjerte” er gemt i Mine hjerter: for a few seconds on the page "Gem" in Tegn goes to (the front
  page at the heart's card, or the heart's own page), so that saving does not pass in silence
  ($lib/editor/savedNotice). In the root layout, so either page shows it. The region is always there,
  empty, so that a screen reader announces the line when it comes.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { t, type Language } from '$lib/i18n';
	import { CheckIcon } from '$lib/components/icons';
	import { takeSaved } from '$lib/editor/savedNotice';

	let { lang }: { lang: Language } = $props();

	const SHOW_MS = 4500;
	let name = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	afterNavigate(() => {
		const saved = takeSaved();
		if (!saved) return;
		name = saved.name;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			name = null;
			timer = null;
		}, SHOW_MS);
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<div class="saved-toast" role="status" aria-live="polite">
	{#if name !== null}
		<p><CheckIcon size={16} aria-hidden="true" />{t('heartSavedToMyHearts', lang, { name })}</p>
	{/if}
</div>

<style>
	.saved-toast {
		position: fixed;
		left: 50%;
		bottom: calc(24px + env(safe-area-inset-bottom, 0px));
		z-index: 100;
		max-width: calc(100vw - 32px);
		transform: translateX(-50%);
		pointer-events: none;
	}

	p {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 10px 18px;
		border-radius: 999px;
		background: var(--deep);
		color: var(--white);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.3;
		box-shadow: var(--shadow-panel);
	}
</style>

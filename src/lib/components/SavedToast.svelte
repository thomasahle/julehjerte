<!--
  “Mit hjerte” er gemt i Mine hjerter · Se dem: for a few seconds after "Gem" in Tegn, which stays in
  the editor, so that saving does not pass in silence ($lib/editor/savedNotice). "Se dem" goes to the
  heart's card in Mine hjerter. In the root layout. The region is always there, empty, so that a
  screen reader announces the line when it comes.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import { CheckIcon } from '$lib/components/icons';
	import { savedNotice } from '$lib/editor/savedNotice.svelte';

	let { lang }: { lang: Language } = $props();

	const SHOW_MS = 6000;

	$effect(() => {
		const heart = savedNotice.heart;
		if (!heart) return;
		const timer = setTimeout(() => {
			if (savedNotice.heart === heart) savedNotice.heart = null;
		}, SHOW_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="saved-toast" role="status" aria-live="polite">
	{#if savedNotice.heart}
		<p>
			<CheckIcon size={16} aria-hidden="true" />{t('heartSavedToMyHearts', lang, { name: savedNotice.heart.name })}
			<a href={savedNotice.heart.href} onclick={() => (savedNotice.heart = null)}>{t('savedSeeThem', lang)}</a>
		</p>
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

	a {
		margin-left: 4px;
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		pointer-events: auto;
	}

	a:focus-visible {
		outline: 2px solid var(--white);
		outline-offset: 2px;
		border-radius: 4px;
	}
</style>

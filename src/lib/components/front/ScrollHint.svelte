<!--
  "Scroll for at udforske skabeloner" — the stacked hero's scroll hint
  (docs/redesign/DESIGN.md §3 "Hero (< 900px)").

  Only shown below 900px, where it is the last item of the stacked hero's text
  column, centred 18px under the buttons (the column's 12px gap plus the 6px
  margin here): in the sky, above the landscape band, which <Scene> lays out in
  flow after the hero's content. It used to sit absolutely at the scene's foot,
  which put it on the snow under the hills.

  The mouse outline is 22x34 rather than the icon set's 24x24 square, so it is
  drawn here instead of reusing MouseIcon.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';

	interface Props {
		lang: Language;
		/** Where the hint scrolls to — the gallery anchor. */
		href?: string;
	}

	let { lang, href = '#skabeloner' }: Props = $props();
</script>

<a class="scroll-hint" {href}>
	<svg
		width="22"
		height="34"
		viewBox="0 0 22 34"
		fill="none"
		stroke="var(--green)"
		stroke-width="1.8"
		stroke-linecap="round"
		aria-hidden="true"
		focusable="false"
	>
		<rect x="1" y="1" width="20" height="32" rx="10" />
		<path d="M11 8v6" />
	</svg>
	<span>{t('heroScrollHint', lang)}</span>
</a>

<style>
	.scroll-hint {
		display: none;
		margin-top: 6px;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-decoration: none;
		color: var(--muted);
		font-size: 13px;
		text-align: center;
	}

	.scroll-hint:hover {
		color: var(--green);
	}

	@media (max-width: 899px) {
		.scroll-hint {
			display: flex;
		}
	}
</style>

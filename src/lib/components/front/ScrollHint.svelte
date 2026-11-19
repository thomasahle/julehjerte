<!--
  "Skabelonerne er herunder" — the stacked hero's hint that the gallery is
  further down (docs/redesign/DESIGN.md §3 "Hero (< 900px)").

  Only shown below 900px, where it is the last item of the stacked hero's text
  column, centred 18px under the buttons (the column's 12px gap plus the 6px
  margin here): in the sky, above the landscape band, which <Scene> lays out in
  flow after the hero's content.

  Two arrowheads pointing down, and no word of scrolling: these widths are
  mostly phones, which have no mouse (it was a mouse outline and "Scroll for at
  udforske skabeloner" until 2026-11-19).
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
		width="26"
		height="22"
		viewBox="0 0 26 22"
		fill="none"
		stroke="var(--green)"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		<path d="M4 3l9 7 9-7" />
		<path d="M4 12l9 7 9-7" />
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

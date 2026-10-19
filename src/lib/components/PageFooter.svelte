<!--
  The site footer — docs/redesign/DESIGN.md §3 "Footer": one quiet centred
  line with the copyright. The paper colours, the language toggle and GitHub
  are in the header (PageHeader, ColorControls).

  Rendered once by the root layout, on every page except the editor.
-->
<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { t, langFromPathname } from '$lib/i18n';

	// Baked in at prerender time, like the rest of the page. The site's first
	// season was Christmas 2025, so the line reads "julen 2025, 2026" and gains
	// the current year from then on.
	const FIRST_SEASON = 2025;
	const year = new Date().getFullYear();
	const seasons = year > FIRST_SEASON ? `${FIRST_SEASON}, ${year}` : `${FIRST_SEASON}`;

	let lang = $derived(langFromPathname($page.url.pathname, base));
</script>

<footer class="site-footer">
	<p class="made-by">
		{t('madeBy', lang)}
		<a href="https://thomasahle.com" target="_blank" rel="noopener">Thomas Ahle</a>,
		{lang === 'da' ? 'julen' : 'Christmas'}
		{seasons}
	</p>
</footer>

<style>
	.site-footer {
		background: var(--cream2);
		color: var(--muted);
		font-size: 13px;
	}

	.made-by {
		margin: 0;
		padding: 20px 16px;
		text-align: center;
	}

	.made-by a {
		color: inherit;
		text-decoration: none;
	}

	.made-by a:hover {
		color: var(--red);
	}
</style>

<script lang="ts">
	import "../app.css";
	import { browser, dev } from "$app/environment";
	import { page } from "$app/stores";
	import { SITE_NAME, SITE_TITLE, SITE_TITLE_EN, SITE_DESCRIPTION, SITE_DESCRIPTION_EN, SITE_KEYWORDS, SITE_URL, GA_MEASUREMENT_ID } from "$lib/config";
	import { langFromPathname } from "$lib/i18n";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import PageFooter from "$lib/components/PageFooter.svelte";

	let { children } = $props();
	let lang = $derived(langFromPathname($page.url.pathname));
	let metaTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
	let metaDescription = $derived(lang === "en" ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION);
	let ogLocale = $derived(lang === "en" ? "en_GB" : "da_DK");

	// Absolute URLs are built from SITE_URL + the request path, never from `base`: in prerendered
	// output `base` is a *relative* path ('.', '..'), which produced "https://juleflet.dk../".
	// Paths always carry a trailing slash, matching `trailingSlash = 'always'`.
	let pathname = $derived($page.url.pathname.endsWith("/") ? $page.url.pathname : `${$page.url.pathname}/`);
	let pageUrl = $derived(`${SITE_URL}${pathname}`);
	// The same path without the language prefix, e.g. /en/editor/ -> /editor/
	let langNeutralPath = $derived(lang === "en" ? pathname.slice("/en".length) : pathname);
	let alternateDaUrl = $derived(`${SITE_URL}${langNeutralPath}`);
	let alternateEnUrl = $derived(`${SITE_URL}/en${langNeutralPath}`);

	// Heart detail pages (/hjerte/[id]) emit their own description, canonical, hreflang, og and twitter tags.
	let isDetailRoute = $derived($page.route.id?.includes("/hjerte/") ?? false);

	$effect(() => {
		if (!browser) return;
		document.documentElement.lang = lang;
	});
</script>

<svelte:head>
	<!-- Google tag (gtag.js) -->
	{#if GA_MEASUREMENT_ID && !dev}
		<script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>
		{@html `<script>
			window.dataLayer = window.dataLayer || [];
			function gtag(){dataLayer.push(arguments);}
			gtag('js', new Date());
			gtag('config', '${GA_MEASUREMENT_ID}', { client_storage: 'none' });
		</script>`}
	{/if}

	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="alternate icon" href="/favicon.ico" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
	<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />
	<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
	<link rel="manifest" href="/manifest.json" />
	<meta name="theme-color" content="#c41e2a" />
	<link rel="apple-touch-icon" href="/icon-192.png" />

	<!-- Basic SEO -->
	{#if !isDetailRoute}
		<meta name="description" content={metaDescription} />
		<link rel="canonical" href={pageUrl} />
		<link rel="alternate" hreflang="da" href={alternateDaUrl} />
		<link rel="alternate" hreflang="en" href={alternateEnUrl} />
		<link rel="alternate" hreflang="x-default" href={alternateDaUrl} />
	{/if}
	<meta name="keywords" content={SITE_KEYWORDS} />
	<meta name="author" content={SITE_NAME} />
	<meta name="robots" content="index, follow" />

	<!-- Open Graph / Facebook -->
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content={ogLocale} />
	{#if !isDetailRoute}
		<meta property="og:type" content="website" />
		<meta property="og:url" content={pageUrl} />
		<meta property="og:title" content={metaTitle} />
		<meta property="og:description" content={metaDescription} />
		<meta property="og:image" content="{SITE_URL}/og-image.png" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />

		<!-- Twitter Card -->
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={metaTitle} />
		<meta name="twitter:description" content={metaDescription} />
		<meta name="twitter:image" content="{SITE_URL}/og-image.png" />
	{/if}
</svelte:head>

<Tooltip.Provider>
	<div class="page-container">
		<main class="page-content">
			{@render children()}
		</main>
		<PageFooter />
	</div>
</Tooltip.Provider>

<style>
	/* The body font, colour and background come from src/app.css. */
	:global(body) {
		background: var(--page);
		color: var(--ink);
	}

	.page-container {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.page-content {
		flex: 1;
	}
</style>

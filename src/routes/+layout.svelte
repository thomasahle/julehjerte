<script lang="ts">
	import "../app.css";
	import { browser, dev } from "$app/environment";
	import { page } from "$app/stores";
	import { base } from "$app/paths";
	import { SITE_NAME, SITE_TITLE, SITE_TITLE_EN, SITE_DESCRIPTION, SITE_DESCRIPTION_EN, SITE_KEYWORDS, SITE_URL, GA_MEASUREMENT_ID } from "$lib/config";
	import { langFromPathname } from "$lib/i18n";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import PageFooter from "$lib/components/PageFooter.svelte";

	let { children } = $props();
	let lang = $derived(langFromPathname($page.url.pathname, base));
	let metaTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
	let metaDescription = $derived(lang === "en" ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION);
	let ogLocale = $derived(lang === "en" ? "en_GB" : "da_DK");
	let ogUrl = $derived(`${SITE_URL}${base}${lang === "en" ? "/en" : ""}/`);

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
	<meta name="theme-color" content="#cc0000" />
	<link rel="apple-touch-icon" href="/icon-192.png" />

	<!-- Basic SEO -->
	<meta name="description" content={metaDescription} />
	<meta name="keywords" content={SITE_KEYWORDS} />
	<meta name="author" content={SITE_NAME} />
	<meta name="robots" content="index, follow" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={ogUrl} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={metaTitle} />
	<meta property="og:description" content={metaDescription} />
	<meta property="og:locale" content={ogLocale} />
	<meta property="og:image" content="{SITE_URL}/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={metaTitle} />
	<meta name="twitter:description" content={metaDescription} />
	<meta name="twitter:image" content="{SITE_URL}/og-image.png" />
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
	:global(body) {
		margin: 0;
		font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
		background: #aacdd8;
		color: #111;
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

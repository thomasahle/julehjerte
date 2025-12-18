<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";
	import { SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_URL, GA_MEASUREMENT_ID } from "$lib/config";
	import { browser } from "$app/environment";
	import { onMount } from "svelte";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import PageFooter from "$lib/components/PageFooter.svelte";

	let { children } = $props();

	// Initialize Google Analytics
	onMount(() => {
		if (!browser || !GA_MEASUREMENT_ID) return;

		// Load gtag.js script
		const script = document.createElement('script');
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
		document.head.appendChild(script);

		// Initialize gtag globally
		window.dataLayer = window.dataLayer || [];
		window.gtag = function(...args: unknown[]) {
			window.dataLayer.push(args);
		};
		window.gtag('js', new Date());
		window.gtag('config', GA_MEASUREMENT_ID);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.json" />
	<meta name="theme-color" content="#cc0000" />
	<link rel="apple-touch-icon" href="/icon-192.png" />

	<!-- Basic SEO -->
	<meta name="description" content={SITE_DESCRIPTION} />
	<meta name="keywords" content={SITE_KEYWORDS} />
	<meta name="author" content={SITE_NAME} />
	<meta name="robots" content="index, follow" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={SITE_URL} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={SITE_TITLE} />
	<meta property="og:description" content={SITE_DESCRIPTION} />
	<meta property="og:locale" content="da_DK" />
	<meta property="og:image" content="{SITE_URL}/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SITE_TITLE} />
	<meta name="twitter:description" content={SITE_DESCRIPTION} />
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

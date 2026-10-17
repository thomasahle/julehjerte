<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import { browser, dev } from "$app/environment";
	import { page } from "$app/stores";
	import { SITE_NAME, SITE_DESCRIPTION, SITE_DESCRIPTION_EN, SITE_KEYWORDS, SITE_URL, GA_MEASUREMENT_ID } from "$lib/config";
	import { pageTitle, socialImage } from "$lib/seo";
	import { langFromPathname, t } from "$lib/i18n";
	import { alternatePaths, routeKeyFromPathname } from "$lib/i18n/routes";
	import PageFooter from "$lib/components/PageFooter.svelte";
	import { markAppStarted } from "$lib/hydration";
	import { getColors, subscribeColors, type HeartColors } from "$lib/stores/colors";

	let { children } = $props();
	let lang = $derived(langFromPathname($page.url.pathname));
	let ogLocale = $derived(lang === "en" ? "en_GB" : "da_DK");

	// Absolute URLs are built from SITE_URL + the request path, never from `base`: in prerendered
	// output `base` is a *relative* path ('.', '..'), which produced "https://juleflet.dk../".
	// Paths always carry a trailing slash, matching `trailingSlash = 'always'`.
	let pathname = $derived($page.url.pathname.endsWith("/") ? $page.url.pathname : `${$page.url.pathname}/`);
	let pageUrl = $derived(`${SITE_URL}${pathname}`);
	// The same page in the other language. Goes through the shared route table
	// because /saadan-goer-du/ and /om/ do not mirror by prefixing /en.
	let alternates = $derived(alternatePaths(pathname));
	let alternateDaUrl = $derived(`${SITE_URL}${alternates.da}`);
	let alternateEnUrl = $derived(`${SITE_URL}${alternates.en}`);

	// The description is emitted here for every route except the heart detail
	// pages (which write their own, per heart). The guide and about pages have
	// their own description keys, so page components never need a second
	// <meta name="description"> — two of them would be an SEO smell.
	let routeKey = $derived(routeKeyFromPathname(pathname));
	let metaDescription = $derived(
		routeKey === "noPrinter"
			? t("noPrinterMetaDescription", lang)
			: routeKey === "howTo"
			? t("howToMetaDescription", lang)
			: routeKey === "about"
				? t("aboutMetaDescription", lang)
				: routeKey === "editor"
					? t("editorMetaDescription", lang)
					: lang === "en"
						? SITE_DESCRIPTION_EN
						: SITE_DESCRIPTION,
	);

	let ogTitle = $derived(pageTitle(routeKey, lang));
	let ogImage = $derived(socialImage(lang));

	// Heart detail pages (/hjerte/[id]) emit their own description, canonical, hreflang, og and twitter tags.
	let isDetailRoute = $derived($page.route.id?.includes("/hjerte/") ?? false);
	// The editor is a full-screen tool: it carries its own colour controls in the
	// right-hand panel and has no footer (docs/redesign/DESIGN.md §7).
	let isEditorRoute = $derived($page.route.id?.includes("/editor") ?? false);

	$effect(() => {
		if (!browser) return;
		document.documentElement.lang = lang;
	});

	// The front page's load function has to know whether it is hydrating the
	// prerendered HTML or building the page after a navigation; loads run before
	// the first render, so this is still false the first time round.
	onMount(() => markAppStarted());

	// Mirror the paper pair into --paper-left / --paper-right (src/app.css). The
	// hearts in the front page's HTML are prerendered and never re-render, so CSS
	// is how the footer's swatches still reach their paper — see HangingHeart.
	onMount(() => {
		const apply = (colors: HeartColors) => {
			document.documentElement.style.setProperty("--paper-left", colors.left);
			document.documentElement.style.setProperty("--paper-right", colors.right);
		};
		apply(getColors());
		return subscribeColors(apply);
	});

	// Google Analytics is 170 KB over the wire and nothing on the page waits for
	// it, so it loads once the browser is idle after the load event instead of
	// competing with the page's own scripts. Events fired before then queue in
	// dataLayer (set up in <svelte:head>) and are sent when it arrives.
	onMount(() => {
		if (!GA_MEASUREMENT_ID || dev) return;
		const inject = () => {
			if (document.querySelector('script[data-gtag]')) return;
			const script = document.createElement('script');
			script.async = true;
			script.dataset.gtag = '';
			script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
			document.head.appendChild(script);
		};
		const whenIdle = () =>
			typeof window.requestIdleCallback === "function"
				? window.requestIdleCallback(inject, { timeout: 4000 })
				: window.setTimeout(inject, 1500);
		if (document.readyState === 'complete') whenIdle();
		else window.addEventListener('load', whenIdle, { once: true });
	});
</script>

<svelte:head>
	<!-- Google tag (gtag.js). Only the queue is set up here; the script itself is
	     the page's largest download and is fetched after first paint (see the
	     effect above). Calls made before it arrives queue in dataLayer.
	     The site shows no cookie banner, so Consent Mode denies all storage up
	     front: GA4 then sets no cookies and sends cookieless pings with a
	     per-page-load client id (the former client_storage option was ignored
	     by GA4 and the tag set _ga cookies regardless). Besides the page view,
	     the config records the full referrer, its host, the landing page with
	     query string and any ?ref= tag; they are registered on the property as
	     event-scoped custom dimensions (full_referrer, referrer_host,
	     landing_page, ref_tag). -->
	{#if GA_MEASUREMENT_ID && !dev}
		{@html `<script>
			window.dataLayer = window.dataLayer || [];
			function gtag(){dataLayer.push(arguments);}
			gtag('consent', 'default', {
				analytics_storage: 'denied',
				ad_storage: 'denied',
				ad_user_data: 'denied',
				ad_personalization: 'denied'
			});
			gtag('js', new Date());
			gtag('config', '${GA_MEASUREMENT_ID}', (function () {
				var ref = document.referrer || '';
				var host = '';
				if (ref) {
					// android-app:// and other odd schemes may not parse; keep the raw string.
					try { host = new URL(ref).hostname || ref; } catch (_e) { host = ref; }
				}
				var params = {
					full_referrer: ref || '(direct)',
					referrer_host: host || '(direct)',
					landing_page: location.pathname + location.search
				};
				var tag = new URLSearchParams(location.search).get('ref');
				if (tag) { params.ref_tag = tag; }
				return params;
			})());
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
	{#if !isDetailRoute}
		<meta name="robots" content="index, follow" />
	{/if}

	<!-- Open Graph / Facebook -->
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content={ogLocale} />
	{#if !isDetailRoute}
		<meta property="og:type" content="website" />
		<meta property="og:url" content={pageUrl} />
		<meta property="og:title" content={ogTitle} />
		<meta property="og:description" content={metaDescription} />
		<meta property="og:image" content={ogImage} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:type" content="image/png" />
		<meta property="og:image:alt" content={t("socialImageAlt", lang)} />

		<!-- Twitter Card -->
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={ogTitle} />
		<meta name="twitter:description" content={metaDescription} />
		<meta name="twitter:image" content={ogImage} />
		<meta name="twitter:image:alt" content={t("socialImageAlt", lang)} />
	{/if}
</svelte:head>

<!-- No tooltip provider here: the only tooltips are the editor's and the paint
     page's, and each wraps itself in its own (PaperHeart, PaintPage), so one at
     the root only put bits-ui's tooltip code (~24 KB gzipped) on every page. -->
<div class="page-container">
	<!-- Not <main>: every route renders its own <header class="nav"> plus its own
	     <main id="main-content">, and a <header> nested inside <main> does not map
	     to the banner landmark. -->
	<div class="page-content">
		{@render children()}
	</div>
	{#if !isEditorRoute}
		<PageFooter />
	{/if}
</div>

<style>
	/* The body font, colour and background come from src/app.css. */
	.page-container {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.page-content {
		flex: 1;
	}
</style>

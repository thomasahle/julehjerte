<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import { SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, SITE_KEYWORDS } from "$lib/config";

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />

	<!-- Basic SEO -->
	<meta name="description" content={SITE_DESCRIPTION} />
	<meta name="keywords" content={SITE_KEYWORDS} />
	<meta name="author" content={SITE_NAME} />
	<meta name="robots" content="index, follow" />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content={SITE_TITLE} />
	<meta property="og:description" content={SITE_DESCRIPTION} />
	<meta property="og:locale" content="da_DK" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={SITE_TITLE} />
	<meta name="twitter:description" content={SITE_DESCRIPTION} />
</svelte:head>

{@render children()}

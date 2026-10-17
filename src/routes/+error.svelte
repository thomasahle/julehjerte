<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { t, langFromPathname } from '$lib/i18n';
  import { href as routeHref } from '$lib/i18n/routes';
  import { SITE_NAME } from '$lib/config';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatusPage from '$lib/components/StatusPage.svelte';

  let lang = $derived(langFromPathname($page.url.pathname, base));

  let status = $derived($page.status);
  let notFound = $derived(status === 404);
  let message = $derived(t(notFound ? 'errorNotFound' : 'errorGeneric', lang));
  // Nothing went wrong on a 404 — a URL was mistyped or a link went stale — and
  // this is also the page GitHub Pages serves for every user-heart and share
  // link, so "Ups! Noget gik galt" invited a bug report on a routine screen.
  let description = $derived(t(notFound ? 'errorNotFoundHint' : 'errorTitle', lang));
</script>

<svelte:head>
  <title>{message} | {SITE_NAME}</title>
  <!-- The layout leaves out canonical and hreflang here (see isErrorPage). -->
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHeader {lang} />

<StatusPage
  {status}
  title={message}
  text={description}
  links={[{ href: routeHref('home', lang), label: t('errorBackHome', lang) }]}
/>

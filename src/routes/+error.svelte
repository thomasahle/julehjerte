<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { t, langFromPathname } from '$lib/i18n';
  import { href as routeHref } from '$lib/i18n/routes';
  import { SITE_TITLE } from '$lib/config';
  import PageHeader from '$lib/components/PageHeader.svelte';

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
  <title>{message} - {SITE_TITLE}</title>
</svelte:head>

<PageHeader {lang} />

<main class="error-page" id="main-content" tabindex="-1">
  <div class="error-content">
    <h1 class="error-code">{status}</h1>
    <h2 class="error-message">{message}</h2>
    <p class="error-description">{description}</p>
    <a href={routeHref('home', lang)} class="btn btn-primary">
      {t('errorBackHome', lang)}
    </a>
  </div>
</main>

<style>
  .error-page {
    /* The nav and the footer take the rest of the viewport. */
    min-height: 60vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .error-content {
    text-align: center;
    max-width: 400px;
  }

  .error-code {
    font-size: 8rem;
    font-weight: 700;
    margin: 0;
    color: var(--red);
    line-height: 1;
  }

  .error-message {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0.5rem 0 1rem;
    color: var(--deep);
  }

  .error-description {
    color: var(--muted);
    margin-bottom: 2rem;
  }
</style>

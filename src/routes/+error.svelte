<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { t, langFromPathname, langPrefix, type Language } from '$lib/i18n';
  import { SITE_TITLE } from '$lib/config';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let lang = $derived(langFromPathname($page.url.pathname, base));
  let langBase = $derived(`${base}${langPrefix(lang)}`);

  let status = $derived($page.status);
  let message = $derived(
    status === 404 ? t('errorNotFound', lang) : t('errorGeneric', lang)
  );
</script>

<svelte:head>
  <title>{message} - {SITE_TITLE}</title>
</svelte:head>

<PageHeader {lang} />

<main class="error-page" id="main-content" tabindex="-1">
  <div class="error-content">
    <h1 class="error-code">{status}</h1>
    <h2 class="error-message">{message}</h2>
    <p class="error-description">{t('errorTitle', lang)}</p>
    <a href="{langBase}/" class="back-button">
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

  .back-button {
    display: inline-block;
    background: var(--red);
    color: var(--white);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    transition: background 0.2s;
  }

  .back-button:hover {
    background: var(--red-hover);
    color: var(--white);
  }
</style>

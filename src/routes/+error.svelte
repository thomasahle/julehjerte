<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { t, getLanguage, type Language } from '$lib/i18n';
  import { SITE_TITLE } from '$lib/config';

  let lang = $state<Language>('da');

  onMount(() => {
    lang = getLanguage();
  });

  let status = $derived($page.status);
  let message = $derived(
    status === 404 ? t('errorNotFound', lang) : t('errorGeneric', lang)
  );
</script>

<svelte:head>
  <title>{message} - {SITE_TITLE}</title>
</svelte:head>

<div class="error-page">
  <div class="error-content">
    <h1 class="error-code">{status}</h1>
    <h2 class="error-message">{message}</h2>
    <p class="error-description">{t('errorTitle', lang)}</p>
    <a href="{base}/" class="back-button">
      {t('errorBackHome', lang)}
    </a>
  </div>
</div>

<style>
  .error-page {
    min-height: 100vh;
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
    color: #cc0000;
    line-height: 1;
  }

  .error-message {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0.5rem 0 1rem;
    color: #333;
  }

  .error-description {
    color: #666;
    margin-bottom: 2rem;
  }

  .back-button {
    display: inline-block;
    background: #cc0000;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    transition: background 0.2s;
  }

  .back-button:hover {
    background: #aa0000;
  }
</style>

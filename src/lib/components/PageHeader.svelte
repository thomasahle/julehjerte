<script lang="ts">
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { t, type Language } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    lang: Language;
    children?: import('svelte').Snippet;
  }

  let { lang, children }: Props = $props();

  function handleBack(e: MouseEvent) {
    if (browser && window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
      e.preventDefault();
      window.history.back();
    }
  }
</script>

<header class="page-header">
  <div class="header-row">
    <div class="header-left">
      <Button 
        variant="ghost" 
        href="{base}/" 
        class="h-auto p-0 hover:bg-transparent hover:text-red-700"
        onclick={handleBack}
      >
        {t('backToGallery', lang)}
      </Button>
    </div>
    <a href="{base}/" class="site-title">{t('siteTitle', lang)}</a>
    <div class="header-right">
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</header>

<style>
  .page-header {
    position: sticky;
    top: 0;
    z-index: 100;
    padding: 0.5rem 0;
    background: #aacdd8;
  }

  .header-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: baseline;
    padding: 0 1rem;
    gap: 1rem;
  }

  .header-left {
    display: flex;
    align-items: baseline;
  }

  .site-title {
    text-align: center;
    font-size: 1.75rem;
    font-weight: 600;
    color: #333;
    text-decoration: none;
    line-height: 1;
    transition: color 0.2s;
  }

  .site-title:hover {
    color: #cc0000;
  }

  :global(.page-header .header-left button),
  :global(.page-header .header-left a) {
    font-size: 0.9rem;
    height: auto;
    line-height: 1;
    vertical-align: baseline;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
  }
</style>
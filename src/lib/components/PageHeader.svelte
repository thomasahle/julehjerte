<script lang="ts">
  import { base } from '$app/paths';
  import { t, type Language } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    lang: Language;
    children?: import('svelte').Snippet;
  }

  let { lang, children }: Props = $props();
</script>

<header class="page-header">
  <div class="header-row">
    <Button variant="ghost" href="{base}/" class="w-fit">{t('backToGallery', lang)}</Button>
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
    margin-bottom: 1rem;
  }

  .header-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
  }

  .site-title {
    text-align: center;
    font-size: 2.5rem;
    font-weight: 600;
    color: #333;
    text-decoration: none;
    transition: color 0.2s;
  }

  .site-title:hover {
    color: #cc0000;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
  }
</style>

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { getUserCollection } from '$lib/stores/collection';
  import { downloadPDF } from '$lib/pdf/template';
  import { SITE_TITLE, SITE_URL } from '$lib/config';
  import { t, translations, getLanguage, setLanguage, subscribeLanguage, type Language } from '$lib/i18n';
  import { getColors, setLeftColor, setRightColor, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { detectSymmetry, getSymmetryDescription } from '$lib/utils/symmetry';
  import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';
  import type { HeartDesign } from '$lib/types/heart';
  import { trackHeartDownload, trackHeartShare, trackHeartEdit } from '$lib/analytics';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Separator } from '$lib/components/ui/separator';
  import GitHubStarsButton from '$lib/components/GitHubStarsButton.svelte';

  let design = $state<HeartDesign | null>(null);
  let isUserCreated = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let shareStatus = $state<'idle' | 'copied' | 'error'>('idle');
  let lang = $state<Language>('da');
  let colors = $state<HeartColors>({ left: '#ffffff', right: '#cc0000' });

  onMount(async () => {
    // Initialize language
    lang = getLanguage();
    subscribeLanguage((l) => { lang = l; });

    // Initialize colors
    colors = getColors();
    subscribeColors((c) => { colors = c; });

    const id = $page.params.id;

    // First check user collection
    const userHearts = getUserCollection();
    const userDesign = userHearts.find((h) => h.id === id);

    if (userDesign) {
      design = userDesign;
      isUserCreated = true;
      loading = false;
      return;
    }

    // Then check static hearts
    try {
      const response = await fetch(`/hearts/${id}.json`);
      if (response.ok) {
        const raw = (await response.json()) as unknown;
        design = normalizeHeartDesign(raw);
        if (!design) {
          error = t('heartNotFound', lang);
        }
      } else {
        error = t('heartNotFound', lang);
      }
    } catch {
      error = t('failedToLoad', lang);
    }

    loading = false;
  });

  function handleDownload() {
    if (design) {
      trackHeartDownload(design.id, design.name);
      downloadPDF(design);
    }
  }

  function openInEditor() {
    if (design) {
      trackHeartEdit(design.id, design.name);
      const designData = encodeURIComponent(JSON.stringify(serializeHeartDesign(design)));
      // For user-created hearts, pass edit=true to allow saving over the original
      const editParam = isUserCreated ? '&edit=true' : '';
      goto(`${base}/editor?design=${designData}${editParam}`);
    }
  }

  function toggleLanguage() {
    const newLang = lang === 'da' ? 'en' : 'da';
    setLanguage(newLang);
    lang = newLang;
  }

  async function handleShare() {
    if (!browser || !design) return;

    const shareUrl = window.location.href;
    const shareTitle = `${design.name} - ${SITE_TITLE}`;
    const shareText = `Check out this Danish woven heart design: ${design.name}`;

    // Try Web Share API first (works on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        trackHeartShare(design.id, design.name, 'native');
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackHeartShare(design.id, design.name, 'clipboard');
      shareStatus = 'copied';
      setTimeout(() => {
        shareStatus = 'idle';
      }, 2000);
    } catch {
      shareStatus = 'error';
      setTimeout(() => {
        shareStatus = 'idle';
      }, 2000);
    }
  }
</script>

<svelte:head>
  <title>{design?.name ?? 'Template'} - {SITE_TITLE}</title>
  {#if design}
    <meta name="description" content={design.description ?? `${design.name} - et flettet julehjerte design med ${design.gridSize.x}x${design.gridSize.y} grid. Download PDF skabelon gratis.`} />
    <link rel="canonical" href="{SITE_URL}/hjerte/{design.id}" />
    <meta property="og:url" content="{SITE_URL}/hjerte/{design.id}" />
    <meta property="og:title" content="{design.name} - {SITE_TITLE}" />
    <meta property="og:description" content={design.description ?? `Flettet julehjerte design med ${design.gridSize.x}x${design.gridSize.y} striber.`} />
    <meta property="og:type" content="article" />
    <meta name="twitter:title" content="{design.name} - {SITE_TITLE}" />
  {/if}
</svelte:head>

<div class="template-page">
  <header>
    <div class="header-row">
      <Button variant="ghost" href="{base}/" class="w-fit">{t('backToGallery', lang)}</Button>
      <a href="{base}/" class="site-title">{t('siteTitle', lang)}</a>
    </div>
  </header>

  {#if loading}
    <div class="loading">{t('loadingTemplate', lang)}</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if design}
    <div class="content">
      <div class="preview-section">
        <PaperHeart
          readonly={true}
          initialFingers={design.fingers}
          initialGridSize={design.gridSize}
          initialWeaveParity={design.weaveParity ?? 0}
          size={400}
        />
      </div>

      <div class="info-section">
        <h1>{design.name}</h1>
        {#if design.author}
          <p class="author">{t('by', lang)} {design.author}</p>
        {/if}
        {#if design.description}
          <p class="description">{design.description}</p>
        {/if}

        <div class="details">
          <div class="detail">
            <span class="label">{t('gridSize', lang)}</span>
            <span class="value">{design.gridSize.x} x {design.gridSize.y}</span>
          </div>
          <div class="detail">
            <span class="label">{t('symmetry', lang)}</span>
            <span class="value">{getSymmetryDescription(detectSymmetry(design.fingers), (key) => t(key as any, lang))}</span>
          </div>
        </div>

        <div class="button-group">
          <button class="btn primary large" onclick={handleDownload}>
            {t('downloadPdfTemplate', lang)}
          </button>
          <button class="btn secondary large" onclick={openInEditor}>
            {t('openInEditor', lang)}
          </button>
          <button class="btn share" onclick={handleShare}>
            {#if shareStatus === 'copied'}
              {t('copied', lang)}
            {:else if shareStatus === 'error'}
              {t('failed', lang)}
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              {t('share', lang)}
            {/if}
          </button>
        </div>

        <div class="instructions">
          <h3>{t('howToMake', lang)}</h3>
          <ol>
            {#each [0, 1, 2, 3, 4] as i}
              <li>{translations[lang].instructions[i]}</li>
            {/each}
          </ol>
        </div>
      </div>
    </div>
  {/if}

  <footer class="page-footer">
    <Separator class="mb-4" />
    <div class="footer-controls">
      <div class="flex items-center gap-2">
        <Tooltip.Root>
          <Tooltip.Trigger>
            <label class="inline-flex size-8 rounded-full border shadow-xs cursor-pointer overflow-hidden">
              <input
                type="color"
                value={colors.left}
                onchange={(e) => setLeftColor((e.target as HTMLInputElement).value)}
                class="w-full h-full border-0 cursor-pointer scale-150"
              />
            </label>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{t('leftColor', lang)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            <label class="inline-flex size-8 rounded-full border shadow-xs cursor-pointer overflow-hidden">
              <input
                type="color"
                value={colors.right}
                onchange={(e) => setRightColor((e.target as HTMLInputElement).value)}
                class="w-full h-full border-0 cursor-pointer scale-150"
              />
            </label>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{t('rightColor', lang)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onclick={toggleLanguage}
        title={lang === 'da' ? 'Switch to English' : 'Skift til dansk'}
        class="rounded-full"
      >
        {lang === 'da' ? '🇬🇧 EN' : '🇩🇰 DA'}
      </Button>
      <GitHubStarsButton repo="thomasahle/julehjerte" />
    </div>
  </footer>
</div>

<style>
  .template-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    margin-bottom: 1.5rem;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .back-link {
    color: #666;
    text-decoration: none;
    font-size: 0.95rem;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: #cc0000;
  }

  .site-title {
    flex: 1;
    text-align: center;
    font-size: 1.25rem;
    font-weight: 600;
    color: #333;
    text-decoration: none;
    transition: color 0.2s;
  }

  .site-title:hover {
    color: #cc0000;
  }

  .loading,
  .error {
    text-align: center;
    padding: 4rem 2rem;
    color: #888;
  }

  .error {
    color: #cc0000;
  }

  .content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    align-items: start;
  }

  .preview-section {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
  }

  .preview-section :global(canvas) {
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25));
  }

  .info-section {
    padding: 1rem 0;
  }

  h1 {
    margin: 0;
    color: #111;
    font-size: 2.5rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .author {
    margin: 0.5rem 0 0 0;
    color: #888;
    font-size: 1.1rem;
  }

  .description {
    margin: 1.5rem 0 0 0;
    color: #555;
    font-size: 1.05rem;
    line-height: 1.6;
  }

  .details {
    margin-top: 2rem;
    display: flex;
    gap: 2rem;
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .detail .label {
    font-size: 0.85rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail .value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #333;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    transition: background 0.2s;
  }

  .btn.primary {
    background: #cc0000;
    color: white;
  }

  .btn.primary:hover {
    background: #aa0000;
  }

  .btn.secondary {
    background: #555;
    color: white;
  }

  .btn.secondary:hover {
    background: #444;
  }

  .btn.share {
    background: #f0f0f0;
    color: #333;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.75rem 1.25rem;
  }

  .btn.share:hover {
    background: #e0e0e0;
  }

  .btn.share svg {
    flex-shrink: 0;
  }

  .btn.large {
    padding: 1rem 2rem;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .button-group {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    flex-wrap: wrap;
  }

  .instructions {
    margin-top: 2.5rem;
    padding-top: 2rem;
    border-top: 1px solid #eee;
  }

  .instructions h3 {
    margin: 0 0 1rem 0;
    color: #333;
    font-size: 1.1rem;
  }

  .instructions ol {
    margin: 0;
    padding-left: 1.25rem;
    color: #666;
  }

  .instructions li {
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  .page-footer {
    margin-top: 1.5rem;
  }

  .footer-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  @media (max-width: 800px) {
    .template-page {
      padding: 1rem;
    }

    .content {
      grid-template-columns: 1fr;
      gap: 2rem;
    }

    .preview-section {
      order: -1;
    }

    h1 {
      font-size: 1.75rem;
    }

    .details {
      flex-direction: column;
      gap: 1rem;
    }
  }
</style>

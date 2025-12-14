<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { getUserCollection } from '$lib/stores/collection';
  import { downloadPDF } from '$lib/pdf/template';
  import { SITE_TITLE } from '$lib/config';
  import type { HeartDesign } from '$lib/types/heart';

  let design = $state<HeartDesign | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let shareStatus = $state<'idle' | 'copied' | 'error'>('idle');

  onMount(async () => {
    const id = $page.params.id;

    // First check user collection
    const userHearts = getUserCollection();
    const userDesign = userHearts.find((h) => h.id === id);

    if (userDesign) {
      design = userDesign;
      loading = false;
      return;
    }

    // Then check static hearts
    try {
      const response = await fetch(`/hearts/${id}.json`);
      if (response.ok) {
        design = await response.json();
      } else {
        error = 'Heart design not found';
      }
    } catch {
      error = 'Failed to load heart design';
    }

    loading = false;
  });

  function handleDownload() {
    if (design) {
      downloadPDF(design);
    }
  }

  function openInEditor() {
    if (design) {
      const designData = encodeURIComponent(JSON.stringify(design));
      goto(`${base}/editor?design=${designData}`);
    }
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
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
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
    <meta name="description" content={design.description ?? `${design.name} - et flettet julehjerte design med ${design.gridSize}x${design.gridSize} grid. Download PDF skabelon gratis.`} />
    <meta property="og:title" content="{design.name} - {SITE_TITLE}" />
    <meta property="og:description" content={design.description ?? `Flettet julehjerte design med ${design.gridSize} striber per side.`} />
    <meta name="twitter:title" content="{design.name} - {SITE_TITLE}" />
  {/if}
</svelte:head>

<div class="template-page">
  <header>
    <a href="{base}/" class="back-link">&larr; Back to Gallery</a>
  </header>

  {#if loading}
    <div class="loading">Loading template...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if design}
    <div class="content">
      <div class="preview-section">
        <PaperHeart
          readonly={true}
          initialFingers={design.fingers}
          initialGridSize={design.gridSize}
          size={400}
        />
      </div>

      <div class="info-section">
        <h1>{design.name}</h1>
        {#if design.author}
          <p class="author">by {design.author}</p>
        {/if}
        {#if design.description}
          <p class="description">{design.description}</p>
        {/if}

        <div class="details">
          <div class="detail">
            <span class="label">Grid Size</span>
            <span class="value">{design.gridSize} x {design.gridSize}</span>
          </div>
          <div class="detail">
            <span class="label">Strips per side</span>
            <span class="value">{design.gridSize}</span>
          </div>
        </div>

        <div class="button-group">
          <button class="btn primary large" onclick={handleDownload}>
            Download PDF Template
          </button>
          <button class="btn secondary large" onclick={openInEditor}>
            Open in Editor
          </button>
          <button class="btn share" onclick={handleShare}>
            {#if shareStatus === 'copied'}
              Copied!
            {:else if shareStatus === 'error'}
              Failed
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Share
            {/if}
          </button>
        </div>

        <div class="instructions">
          <h3>How to Make</h3>
          <ol>
            <li>Print the template at 100% scale on A4 paper</li>
            <li>Cut out each half along the solid outer lines</li>
            <li>Fold each piece in half along the dashed line</li>
            <li>Cut along the curved lines to create the strips</li>
            <li>Weave the two halves together, alternating over and under</li>
          </ol>
        </div>
      </div>
    </div>
  {/if}
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

  .back-link {
    color: #666;
    text-decoration: none;
    font-size: 0.95rem;
    transition: color 0.2s;
  }

  .back-link:hover {
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
    background: #bad4dc;
    padding: 2rem;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: center;
    align-items: center;
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

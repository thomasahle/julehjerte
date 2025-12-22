<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import PaperHeartSVG from "$lib/components/PaperHeartSVG.svelte";
  import TemplatePreview from "$lib/components/TemplatePreview.svelte";
  import { getUserCollection } from "$lib/stores/collection";
  import { downloadPDF } from "$lib/pdf/template";
  import { SITE_DOMAIN, SITE_TITLE, SITE_URL } from "$lib/config";
  import {
    t,
    translations,
    getLanguage,
    subscribeLanguage,
    type Language,
  } from "$lib/i18n";
  import {
    getColors,
    subscribeColors,
    type HeartColors,
  } from "$lib/stores/colors";
  import { detectSymmetry, getSymmetryDescription } from "$lib/utils/symmetry";
  import { calculateDifficulty, type DifficultyLevel } from "$lib/utils/difficulty";
  import {
    serializeHeartDesign,
    parseHeartFromSVG,
  } from "$lib/utils/heartDesign";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartDownload,
    trackHeartShare,
    trackHeartEdit,
    trackHeartLoadError,
    trackSvgParseError,
  } from "$lib/analytics";
  import { Button } from "$lib/components/ui/button";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import * as Carousel from "$lib/components/ui/carousel";

  // Design geometry is large (segments); keep it out of deeply reactive proxies.
  let design = $state.raw<HeartDesign | null>(null);
  let isUserCreated = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let shareStatus = $state<"idle" | "copied" | "error">("idle");
  let lang = $state<Language>("da");
  let colors = $state<HeartColors>({ left: "#ffffff", right: "#cc0000" });
  let photoUrl = $state<string | null>(null);

  onMount(async () => {
    // Initialize language
    lang = getLanguage();
    subscribeLanguage((l) => {
      lang = l;
    });

    // Initialize colors
    colors = getColors();
    subscribeColors((c) => {
      colors = c;
    });

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
      const response = await fetch(`/hearts/${id}.svg`);
      if (response.ok) {
        const svgText = await response.text();
        design = parseHeartFromSVG(svgText, `${id}.svg`);
        if (!design) {
          trackSvgParseError(`${id}.svg`, 'No valid paths found');
          error = t("heartNotFound", lang);
        }
      } else {
        trackHeartLoadError(id ?? '', `HTTP ${response.status}`);
        error = t("heartNotFound", lang);
      }
    } catch (err) {
      trackHeartLoadError(id ?? '', err instanceof Error ? err.message : 'Unknown error');
      error = t("failedToLoad", lang);
    }

    loading = false;

    // Check if a photo exists for this heart
    if (!isUserCreated) {
      const photoExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      for (const ext of photoExtensions) {
        try {
          const photoResponse = await fetch(`/hearts/photos/${id}.${ext}`, { method: 'HEAD' });
          if (photoResponse.ok) {
            photoUrl = `/hearts/photos/${id}.${ext}`;
            break;
          }
        } catch {
          // Photo doesn't exist, continue
        }
      }
    }
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
      const designData = encodeURIComponent(
        JSON.stringify(serializeHeartDesign(design)),
      );
      // For user-created hearts, pass edit=true to allow saving over the original
      const editParam = isUserCreated ? "&edit=true" : "";
      goto(`${base}/editor?design=${designData}${editParam}`);
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
          url: shareUrl,
        });
        trackHeartShare(design.id, design.name, "native");
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackHeartShare(design.id, design.name, "clipboard");
      shareStatus = "copied";
      setTimeout(() => {
        shareStatus = "idle";
      }, 2000);
    } catch {
      shareStatus = "error";
      setTimeout(() => {
        shareStatus = "idle";
      }, 2000);
    }
  }

  function getDifficultyLabel(level: DifficultyLevel): string {
    const labels: Record<DifficultyLevel, 'difficultyEasy' | 'difficultyMedium' | 'difficultyHard' | 'difficultyExpert'> = {
      easy: 'difficultyEasy',
      medium: 'difficultyMedium',
      hard: 'difficultyHard',
      expert: 'difficultyExpert'
    };
    return t(labels[level], lang);
  }

  // Check if templates are symmetric (only need one template for both lobes)
  let isSymmetric = $derived(
    design ? design.gridSize.x === design.gridSize.y && detectSymmetry(design.fingers).mirrorSymmetry : true
  );

  function normalizeSource(source: string): string {
    return source
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
</script>

<svelte:head>
  <title>{design?.name ?? "Template"} - {SITE_TITLE}</title>
  {#if design}
    <meta
      name="description"
      content={design.description ??
        `${design.name} - et flettet julehjerte design med ${design.gridSize.x}x${design.gridSize.y} grid. Download PDF skabelon gratis.`}
    />
    <link rel="canonical" href="{SITE_URL}/hjerte/{design.id}" />
    <meta property="og:url" content="{SITE_URL}/hjerte/{design.id}" />
    <meta property="og:title" content="{design.name} - {SITE_TITLE}" />
    <meta
      property="og:description"
      content={design.description ??
        `Flettet julehjerte design med ${design.gridSize.x}x${design.gridSize.y} striber.`}
    />
    <meta property="og:image" content="{SITE_URL}/og/{design.id}.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="1200" />
    <meta property="og:type" content="article" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{design.name} - {SITE_TITLE}" />
    <meta
      name="twitter:description"
      content={design.description ??
        `Flettet julehjerte design med ${design.gridSize.x}x${design.gridSize.y} striber.`}
    />
    <meta name="twitter:image" content="{SITE_URL}/og/{design.id}.png" />
  {/if}
</svelte:head>

<div class="template-page">
  <PageHeader {lang} />

  {#if loading}
    <div class="loading">{t("loadingTemplate", lang)}</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if design}
    <div class="content">
      <div class="preview-section">
        <Carousel.Root class="carousel-root">
          <Carousel.Content class="carousel-content">
            <!-- Slide 1: Colored preview -->
            <Carousel.Item class="carousel-item">
              <div class="slide-content">
                <PaperHeartSVG
                  readonly
                  idPrefix={"detail-" + design.id}
                  initialFingers={design.fingers}
                  initialGridSize={design.gridSize}
                  initialWeaveParity={design.weaveParity ?? 0}
                  size={350}
                />
              </div>
            </Carousel.Item>

            <!-- Photo slide (only if photo exists) -->
            {#if photoUrl}
              <Carousel.Item class="carousel-item">
                <div class="slide-content photo-slide">
                  <img src={photoUrl} alt="{design.name} - {t('photo', lang)}" class="heart-photo" />
                </div>
              </Carousel.Item>
            {/if}

            <!-- Slide 2: Template (left or "both" if symmetric) -->
            <Carousel.Item class="carousel-item">
              <div class="slide-content template-slide">
                <TemplatePreview
                  {design}
                  lobe="left"
                  size={350}
                  label={isSymmetric ? t("template", lang) : t("templateLeft", lang)}
                />
              </div>
            </Carousel.Item>

            <!-- Slide 3: Right template (only if asymmetric) -->
            {#if !isSymmetric}
              <Carousel.Item class="carousel-item">
                <div class="slide-content template-slide">
                  <TemplatePreview
                    {design}
                    lobe="right"
                    size={350}
                    label={t("templateRight", lang)}
                  />
                </div>
              </Carousel.Item>
            {/if}
          </Carousel.Content>
          <Carousel.Previous class="carousel-prev" />
          <Carousel.Next class="carousel-next" />
        </Carousel.Root>

        <div class="button-group">
          <button class="btn secondary" onclick={openInEditor}>
            {t("openInEditor", lang)}
          </button>
          <button class="btn share" onclick={handleShare} aria-label={t("share", lang)}>
            {#if shareStatus === "copied"}
              {t("copied", lang)}
            {:else if shareStatus === "error"}
              {t("failed", lang)}
            {:else}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              {t("share", lang)}
            {/if}
          </button>
        </div>
      </div>

      <div class="info-section">
        <h1>{design.name}</h1>
        {#if design.author}
          <p class="author">
            {t("by", lang)}
            {#if design.authorUrl}
              <a href={design.authorUrl} target="_blank" rel="noopener noreferrer">{design.author}</a>
            {:else}
              {design.author}
            {/if}
          </p>
        {/if}
        {#if design.publisher}
          <p class="publisher">
            {t("publisher", lang)}:
            {#if design.publisherUrl}
              <a href={design.publisherUrl} target="_blank" rel="noopener noreferrer">{design.publisher}</a>
            {:else}
              {design.publisher}
            {/if}
          </p>
        {/if}
        {#if design.date}
          <p class="meta-line">
            {t("date", lang)}: {design.date}
          </p>
        {/if}
        {#if design.source && normalizeSource(design.source) !== normalizeSource(SITE_DOMAIN)}
          <p class="meta-line">
            {t("source", lang)}: {design.source}
          </p>
        {/if}
        {#if design.description}
          <p class="description">{design.description}</p>
        {/if}

        <div class="details">
          <div class="detail">
            <span class="label">{t("difficulty", lang)}</span>
            <span class="value">{getDifficultyLabel(calculateDifficulty(design).level)}</span>
          </div>
          <div class="detail">
            <span class="label">{t("symmetry", lang)}</span>
            <span class="value"
              >{getSymmetryDescription(detectSymmetry(design.fingers), (key) =>
                t(key as any, lang),
              )}</span
            >
          </div>
        </div>

        <div class="instructions">
          <h3>{t("howToMake", lang)}</h3>
          <ol>
            {#each [0, 1, 2, 3, 4] as i}
              <li>{translations[lang].instructions[i]}</li>
            {/each}
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
    padding: 0 2rem 2rem 2rem;
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
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 1rem;
    max-width: 450px;
    margin: 0 auto;
  }

  .preview-section :global(.paper-heart-svg) {
    filter: drop-shadow(0 4px 8px var(--shadow-color));
  }

  .preview-section :global(.carousel-root) {
    width: 100%;
    max-width: 400px;
  }

  .preview-section :global(.carousel-content) {
    margin-left: 0;
  }

  .preview-section :global(.carousel-item) {
    padding-left: 0;
  }

  .slide-content {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 360px;
  }

  .template-slide {
    padding: 0.5rem;
  }

  .photo-slide {
    padding: 0.5rem;
  }

  .heart-photo {
    max-width: 350px;
    max-height: 350px;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .preview-section :global(.carousel-prev),
  .preview-section :global(.carousel-next) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #ddd;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    z-index: 10;
  }

  .preview-section :global(.carousel-prev:hover),
  .preview-section :global(.carousel-next:hover) {
    background: white;
    border-color: #aaa;
  }

  .preview-section :global(.carousel-prev) {
    left: -20px;
  }

  .preview-section :global(.carousel-next) {
    right: -20px;
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

  .author a,
  .publisher a {
    color: #4a7c8a;
    text-decoration: none;
  }

  .author a:hover,
  .publisher a:hover {
    text-decoration: underline;
  }

  .publisher,
  .meta-line {
    margin: 0.25rem 0 0 0;
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

  .button-group {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 1rem;
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
      padding: 0; /* Let carousel go edge-to-edge if needed, or control via carousel-root */
    }

    .preview-section :global(.carousel-prev) {
      left: 10px;
    }

    .preview-section :global(.carousel-next) {
      right: 10px;
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

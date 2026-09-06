<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import type { PageProps } from "./$types";
  import PaperHeartSVG from "$lib/components/PaperHeartSVG.svelte";
  import TemplatePreview from "$lib/components/TemplatePreview.svelte";
  import { getUserCollection, loadStaticHeartById } from "$lib/stores/collection";
  import { downloadPDF } from "$lib/pdf/template";
  import {
    SITE_DESCRIPTION,
    SITE_DESCRIPTION_EN,
    SITE_DOMAIN,
    SITE_TITLE,
    SITE_TITLE_EN,
    SITE_URL,
  } from "$lib/config";
  import {
    t,
    translations,
    type Language,
    type TranslationKey,
  } from "$lib/i18n";
  import {
    getColors,
    subscribeColors,
    type HeartColors,
  } from "$lib/stores/colors";
  import { detectSymmetry, getSymmetryDescription, lobesShareTemplate } from "$lib/utils/symmetry";
  import { calculateDifficulty, type DifficultyLevel } from "$lib/utils/difficulty";
  import { serializeHeartDesign } from "$lib/utils/heartDesign";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartDownload,
    trackHeartShare,
    trackHeartEdit,
  } from "$lib/analytics";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import * as Carousel from "$lib/components/ui/carousel";

  let { data }: PageProps = $props();

  // Build-time metadata and precomputed design (gallery hearts only) - both available
  // at prerender time, so gallery pages render without a loading state.
  let meta = $derived(data.meta);

  // Hearts that only exist in the browser: the user's own (localStorage) and, so old
  // links keep working, SVGs under /hearts/ that are not in the gallery index.
  // Design geometry is large (segments); keep it out of deeply reactive proxies.
  let clientDesign = $state.raw<HeartDesign | null>(null);
  let design = $derived(data.design ?? clientDesign);
  let isUserCreated = $state(false);
  let clientLoading = $state(true);
  let loading = $derived(!data.design && clientLoading);
  let error = $state<string | null>(null);
  let shareStatus = $state<"idle" | "copied" | "error">("idle");
  let lang = $derived(($page.params.lang === 'en' ? 'en' : 'da') as Language);
  let langBase = $derived(`${base}${$page.params.lang ? `/${$page.params.lang}` : ''}`);
  let heartId = $derived($page.params.id ?? '');
  let colors = $state<HeartColors>({ left: "#ffffff", right: "rgb(185, 19, 19)" });

  onMount(async () => {
    // Initialize colors
    colors = getColors();
    subscribeColors((c) => {
      colors = c;
    });

    // Gallery hearts arrived with the page data.
    if (data.design) return;

    const id = $page.params.id ?? '';

    // First check user collection
    const userDesign = getUserCollection().find((h) => h.id === id);
    if (userDesign) {
      clientDesign = userDesign;
      isUserCreated = true;
      clientLoading = false;
      return;
    }

    // Not in the gallery index or the user's collection: an old link to an unlisted SVG.
    clientDesign = await loadStaticHeartById(id);
    if (!clientDesign) error = t("heartNotFound", lang);
    clientLoading = false;
  });

  // Header/detail text. Comes from the build-time metadata for gallery hearts (so it
  // is in the prerendered HTML) and from the loaded design for user-created hearts.
  type HeartInfo = {
    name: string;
    author: string | null;
    authorUrl: string | null;
    publisher: string | null;
    publisherUrl: string | null;
    source: string | null;
    date: string | null;
    description: string | null;
    gridSize: { x: number; y: number };
    difficulty: DifficultyLevel;
    symmetry: string;
  };

  let info = $derived.by<HeartInfo | null>(() => {
    const describe = (symmetry: Parameters<typeof getSymmetryDescription>[0]) =>
      getSymmetryDescription(symmetry, (key) => t(key as TranslationKey, lang));
    if (meta) {
      return { ...meta, symmetry: describe(meta.symmetry) };
    }
    if (design) {
      return {
        name: design.name,
        author: design.author || null,
        authorUrl: design.authorUrl ?? null,
        publisher: design.publisher ?? null,
        publisherUrl: design.publisherUrl ?? null,
        source: design.source ?? null,
        date: design.date ?? null,
        description: design.description ?? null,
        gridSize: design.gridSize,
        difficulty: calculateDifficulty(design).level,
        symmetry: describe(detectSymmetry(design.fingers)),
      };
    }
    return null;
  });

  // Photo of the finished heart (gallery hearts only; resolved at build time).
  let photo = $derived(isUserCreated ? null : (meta?.photo ?? null));

  // Gallery heart descriptions are written in Danish, so they only appear on the Danish
  // page; a user's own heart shows whatever they wrote.
  let description = $derived(info?.description && (lang === "da" || isUserCreated) ? info.description : null);

  // SEO
  let siteTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
  let pageTitle = $derived(`${info?.name ?? t("template", lang)} - ${siteTitle}`);
  let metaDescription = $derived.by(() => {
    if (!info) return lang === "en" ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION;
    const intro = t("heartMetaDescription", lang)
      .replace("{name}", info.name)
      .replace("{x}", String(info.gridSize.x))
      .replace("{y}", String(info.gridSize.y));
    const details = description ? description.replace(/[.!?]?$/, ".") : null;
    return [intro, details, t("heartMetaDownload", lang)].filter(Boolean).join(" ");
  });
  let canonicalDa = $derived(`${SITE_URL}/hjerte/${heartId}/`);
  let canonicalEn = $derived(`${SITE_URL}/en/hjerte/${heartId}/`);
  let canonicalUrl = $derived(lang === "en" ? canonicalEn : canonicalDa);
  const ogImage = `${SITE_URL}/og-image.png`;

  // Gallery hearts open by id; user-created hearts carry their design in the URL
  // fragment (never sent to the server, so no request-URI limits).
  let editHref = $derived.by(() => {
    if (isUserCreated && design) {
      const payload = encodeURIComponent(JSON.stringify(serializeHeartDesign(design)));
      return `${langBase}/editor/?edit=true&returnTo=detail#design=${payload}`;
    }
    return `${langBase}/editor/?from=${encodeURIComponent(heartId)}&returnTo=detail`;
  });

  function handleDownload() {
    if (design) {
      trackHeartDownload(design.id, design.name);
      downloadPDF(design, { lang });
    }
  }

  function handleEdit() {
    if (info) trackHeartEdit(heartId, info.name);
  }

  async function handleShare() {
    if (!browser || !info) return;

    const shareUrl = window.location.href;
    const shareTitle = pageTitle;
    const shareText = t("shareText", lang).replace("{name}", info.name);

    // Try Web Share API first (works on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        trackHeartShare(heartId, info.name, "native");
        return;
      } catch (err) {
        // User cancelled or share failed, fall through to clipboard
        if ((err as Error).name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackHeartShare(heartId, info.name, "clipboard");
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

  // One template for both lobes? Shared with the PDF generator so preview and PDF agree.
  let isSymmetric = $derived(design ? lobesShareTemplate(design.fingers, design.gridSize) : true);

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
  <title>{pageTitle}</title>
  <meta name="description" content={metaDescription} />
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="da" href={canonicalDa} />
  <link rel="alternate" hreflang="en" href={canonicalEn} />
  <link rel="alternate" hreflang="x-default" href={canonicalDa} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={metaDescription} />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

<div class="template-page">
  <PageHeader {lang} />

  {#if error}
    <div class="error">{error}</div>
  {:else if info}
    <div class="content">
      <div class="preview-section">
        {#if design}
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
              {#if photo}
                <Carousel.Item class="carousel-item">
                  <div class="slide-content photo-slide">
                    <img
                      src={photo.src}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      decoding="async"
                      alt="{info.name} - {t('photo', lang)}"
                      class="heart-photo"
                    />
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
        {:else}
          <div class="loading preview-placeholder">{t("loadingTemplate", lang)}</div>
        {/if}

        <div class="button-group">
          <button class="btn primary" onclick={handleDownload} disabled={!design}>
            {t("downloadPdfTemplate", lang)}
          </button>
          <a class="btn secondary" href={editHref} onclick={handleEdit}>
            {t("openInEditor", lang)}
          </a>
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
        <h1>{info.name}</h1>
        {#if info.author}
          <p class="author">
            {t("by", lang)}
            {#if info.authorUrl}
              <a href={info.authorUrl} target="_blank" rel="noopener noreferrer">{info.author}</a>
            {:else}
              {info.author}
            {/if}
          </p>
        {/if}
        {#if info.publisher}
          <p class="publisher">
            {t("publisher", lang)}:
            {#if info.publisherUrl}
              <a href={info.publisherUrl} target="_blank" rel="noopener noreferrer">{info.publisher}</a>
            {:else}
              {info.publisher}
            {/if}
          </p>
        {/if}
        {#if info.date}
          <p class="meta-line">
            {t("date", lang)}: {info.date}
          </p>
        {/if}
        {#if info.source && normalizeSource(info.source) !== normalizeSource(SITE_DOMAIN)}
          <p class="meta-line">
            {t("source", lang)}: {info.source}
          </p>
        {/if}
        {#if description}
          <p class="description">{description}</p>
        {/if}

        <div class="details">
          <div class="detail">
            <span class="label">{t("difficulty", lang)}</span>
            <span class="value">{getDifficultyLabel(info.difficulty)}</span>
          </div>
          <div class="detail">
            <span class="label">{t("symmetry", lang)}</span>
            <span class="value">{info.symmetry}</span>
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
  {:else if loading}
    <div class="loading">{t("loadingTemplate", lang)}</div>
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

  /* Reserve the carousel's space while the design loads */
  .preview-placeholder {
    width: 100%;
    max-width: 400px;
    min-height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
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

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  a.btn {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  .btn.secondary {
    background: #555;
    color: white;
  }

  .btn.secondary:hover {
    background: #444;
  }

  .btn.primary {
    background: #cc0000;
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    background: #aa0000;
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

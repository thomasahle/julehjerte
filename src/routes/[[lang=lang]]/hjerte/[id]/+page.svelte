<!--
  The heart detail page — docs/redesign/DESIGN.md §4.

  A page-wide winter scene: the landscape drawing runs edge to edge along the
  bottom, three firs are drawn over it on the left, and the heart hangs from the
  big one on a stage whose four thumbnails swap the big view. The translucent
  panel on the right carries the name, the facts and the five steps; below the
  scene the rest of the category is offered as "Flere {kategori}".

  Behaviour that must survive any restyling: /hjerte/delt/ (a heart shared in the
  URL fragment, noindex, "Gem i Mine hjerter"), the editor hand-off in editHref,
  navigator.share with a clipboard fallback, downloadPDF() and the three
  analytics events.
-->
<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { PageProps } from "./$types";
  import HeartStage from "$lib/components/detail/HeartStage.svelte";
  import RelatedHearts from "$lib/components/detail/RelatedHearts.svelte";
  import StepList from "$lib/components/detail/StepList.svelte";
  import DifficultyDots from "$lib/components/DifficultyDots.svelte";
  import Fir from "$lib/components/Fir.svelte";
  import Scene from "$lib/components/Scene.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import {
    ArrowLeftIcon,
    ArrowRightIcon,
    DownloadIcon,
    PencilIcon,
    ShareIcon,
  } from "$lib/components/icons";
  import { FIR_FILLS } from "$lib/landscape";
  import { getUserCollection, loadStaticHeartById, saveUserDesign } from "$lib/stores/collection";
  import {
    SITE_DESCRIPTION,
    SITE_DESCRIPTION_EN,
    SITE_DOMAIN,
    SITE_TITLE,
    SITE_TITLE_EN,
    SITE_URL,
  } from "$lib/config";
  import { stripsLabel as formatStrips, t, type Language } from "$lib/i18n";
  import {
    editorHref,
    heartPath,
    homeAnchorHref,
    href as routeHref,
  } from "$lib/i18n/routes";
  import { lobesShareTemplate } from "$lib/utils/symmetry";
  import { calculateDifficulty, type DifficultyLevel } from "$lib/utils/difficulty";
  import { normalizeHeartDesign, serializeHeartDesign } from "$lib/utils/heartDesign";
  import { decodeSharedDesign, encodeSharedDesign, sharedDesignUrl } from "$lib/utils/shareDesign";
  import { makeHeartAnchorId } from "$lib/utils/heartAnchors";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartDownload,
    trackHeartShare,
    trackHeartEdit,
  } from "$lib/analytics";

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

  // The "Kopieret" / "Kunne ikke kopiere" note clears itself after two seconds.
  // The handle is kept so a second share does not race the first one's timer,
  // and so navigating away does not leave a timer writing to a dead component.
  const SHARE_STATUS_MS = 2000;
  let shareStatusTimer: ReturnType<typeof setTimeout> | null = null;

  function resetShareStatusSoon(status: "copied" | "error"): void {
    shareStatus = status;
    if (shareStatusTimer !== null) clearTimeout(shareStatusTimer);
    shareStatusTimer = setTimeout(() => {
      shareStatus = "idle";
      shareStatusTimer = null;
    }, SHARE_STATUS_MS);
  }

  $effect(() => () => {
    if (shareStatusTimer !== null) clearTimeout(shareStatusTimer);
  });

  // /hjerte/delt/#design=<payload>: a heart someone shared (see $lib/utils/shareDesign).
  // It is not in this browser's collection until the visitor saves it.
  let isShared = $derived(data.shared);
  let savedShared = $state(false);
  let saveError = $state<string | null>(null);
  // User hearts are shared as a self-contained link with the design in the fragment.
  let userShareUrl = $state<string | null>(null);
  let lang = $derived(($page.params.lang === 'en' ? 'en' : 'da') as Language);
  let heartId = $derived($page.params.id ?? '');

  onMount(async () => {
    // Gallery hearts arrived with the page data.
    if (data.design) return;

    const id = $page.params.id ?? '';

    if (data.shared) {
      const payload = new URLSearchParams(window.location.hash.slice(1)).get("design");
      const raw = payload ? await decodeSharedDesign(payload) : null;
      const shared = raw ? normalizeHeartDesign(raw) : null;
      if (shared) {
        clientDesign = shared;
        savedShared = getUserCollection().some((h) => h.id === shared.id);
      } else {
        error = t("sharedLinkInvalid", lang);
      }
      clientLoading = false;
      return;
    }

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
  };

  let info = $derived.by<HeartInfo | null>(() => {
    if (meta) {
      return {
        name: meta.name,
        author: meta.author,
        authorUrl: meta.authorUrl,
        publisher: meta.publisher,
        publisherUrl: meta.publisherUrl,
        source: meta.source,
        date: meta.date,
        description: meta.description,
        gridSize: meta.gridSize,
        difficulty: meta.difficulty,
      };
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
      };
    }
    return null;
  });

  // Photo of the finished heart (gallery hearts only; resolved at build time).
  let photo = $derived(isUserCreated ? null : (meta?.photo ?? null));

  // Gallery heart descriptions are written in Danish, so they only appear on the Danish
  // page; a user's own or a shared heart shows whatever its author wrote.
  let description = $derived(info?.description && (lang === "da" || isUserCreated || isShared) ? info.description : null);

  // SEO
  let siteTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
  let pageTitle = $derived(`${info?.name ?? t("template", lang)} - ${siteTitle}`);
  let metaDescription = $derived.by(() => {
    if (!info) return lang === "en" ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION;
    const intro = t("heartMetaDescription", lang, {
      name: info.name,
      x: info.gridSize.x,
      y: info.gridSize.y,
    });
    const details = description ? description.replace(/[.!?]?$/, ".") : null;
    return [intro, details, t("heartMetaDownload", lang)].filter(Boolean).join(" ");
  });
  let canonicalDa = $derived(`${SITE_URL}${heartPath(heartId, "da")}`);
  let canonicalEn = $derived(`${SITE_URL}${heartPath(heartId, "en")}`);
  let canonicalUrl = $derived(lang === "en" ? canonicalEn : canonicalDa);
  // Gallery hearts get their own 1200x630 card, built by scripts/generate-heart-data.mjs.
  let ogImage = $derived(meta ? `${SITE_URL}/og/${heartId}.png` : `${SITE_URL}/og-image.png`);

  // Gallery hearts open by id; user-created hearts carry their design in the URL
  // fragment (never sent to the server, so no request-URI limits). A shared heart that
  // is not saved here yet is edited as a copy.
  let editHref = $derived.by(() => {
    if ((isUserCreated || isShared) && design) {
      const payload = encodeURIComponent(JSON.stringify(serializeHeartDesign(design)));
      const query = isUserCreated || savedShared ? "?edit=true&returnTo=detail" : "";
      return editorHref(lang, `${query}#design=${payload}`);
    }
    return editorHref(lang, `?from=${encodeURIComponent(heartId)}&returnTo=detail`);
  });

  // Build the share link for a user heart as soon as it is loaded, so the share button
  // can hand it to the clipboard synchronously within the click.
  $effect(() => {
    const current = design;
    if (!current || !isUserCreated) {
      userShareUrl = null;
      return;
    }
    let cancelled = false;
    encodeSharedDesign(serializeHeartDesign(current)).then((payload) => {
      if (!cancelled) userShareUrl = sharedDesignUrl(payload, lang);
    });
    return () => {
      cancelled = true;
    };
  });

  function handleSaveShared() {
    if (!design) return;
    try {
      saveUserDesign(design);
      savedShared = true;
      saveError = null;
    } catch {
      saveError = t("saveFailed", lang);
    }
  }

  // jsPDF is 140 KB gzipped and only this click needs it, so it is loaded here
  // rather than in the page's initial bundle.
  async function handleDownload() {
    if (!design) return;
    trackHeartDownload(design.id, design.name);
    try {
      const { downloadPDF } = await import("$lib/pdf/template");
      await downloadPDF(design, { lang });
    } catch (err) {
      // Without this the download simply did nothing, with no sign of why.
      console.error("Generating the PDF failed", err);
      saveError = t("pdfFailed", lang);
    }
  }

  function handleEdit() {
    if (info) trackHeartEdit(heartId, info.name);
  }

  async function handleShare() {
    if (!browser || !info) return;

    // Gallery hearts and shared links share the page URL itself.
    const shareUrl = userShareUrl ?? window.location.href;
    const shareTitle = pageTitle;
    const shareText = t("shareText", lang, { name: info.name });

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
      resetShareStatusSoon("copied");
    } catch {
      resetShareStatusSoon("error");
    }
  }

  // One template for both lobes? Shared with the PDF generator so preview and PDF
  // agree. The build-time metadata carries the same answer for gallery hearts, so
  // the prerendered page already names the right number of templates.
  let sharedTemplate = $derived(
    design ? lobesShareTemplate(design.fingers, design.gridSize) : (meta?.symmetry.sharedTemplate ?? true),
  );

  // "af Thomas · 3 × 3 striber" — the panel's one-line credit (DESIGN.md §4).
  let stripsLabel = $derived(info ? formatStrips(info.gridSize, lang) : "");

  function normalizeSource(source: string): string {
    return source
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }

  // Publisher, date and source are only set on a few gallery hearts; they go on a
  // small second line rather than in the credit above.
  let extraMeta = $derived.by(() => {
    if (!info) return [] as { label: string; value: string; url: string | null }[];
    const rows: { label: string; value: string; url: string | null }[] = [];
    if (info.publisher) rows.push({ label: t("publisher", lang), value: info.publisher, url: info.publisherUrl });
    if (info.date) rows.push({ label: t("date", lang), value: info.date, url: null });
    if (info.source && normalizeSource(info.source) !== normalizeSource(SITE_DOMAIN)) {
      rows.push({ label: t("source", lang), value: info.source, url: null });
    }
    return rows;
  });
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
  {#if isShared}
    <meta name="robots" content="noindex" />
  {/if}
</svelte:head>

<div class="detail-page">
  <PageHeader {lang} active="templates" />

  <main id="main-content" tabindex="-1">
  <div class="crumb-row">
    <a class="crumb" href={routeHref('home', lang)}>
      <ArrowLeftIcon size={16} />
      {t('backToTemplates', lang)}
    </a>
  </div>

  <Scene>
    <!-- The firs the heart hangs on, drawn over the landscape and anchored to the
         bottom-left corner. Hidden below 1100, where the columns stack. -->
    <svg
      class="scene-trees"
      viewBox="0 0 1440 820"
      preserveAspectRatio="xMinYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <Fir x={560} tipY={330} height={330} fill={FIR_FILLS[1]} symbol="pine-b" mirrored widthFactor={0.9} />
      <Fir x={420} tipY={110} height={600} fill={FIR_FILLS[0]} symbol="pine-c" widthFactor={0.95} />
      <Fir x={262} tipY={380} height={300} fill={FIR_FILLS[2]} symbol="pine-a" widthFactor={0.9} />
    </svg>

    <div class="detail-main">
      {#if error}
        <div class="detail-message">
          <p class="message-card is-error" role="alert">{error}</p>
        </div>
      {:else if info}
        <div class="stage-col">
          <HeartStage {design} {photo} {sharedTemplate} {lang} idPrefix={heartId} />

          <div class="actions">
            {#if isShared && design}
              {#if savedShared}
                <a class="btn btn-dark" href={homeAnchorHref(makeHeartAnchorId(design.id), lang)}>
                  {t('showInGallery', lang)}
                </a>
              {:else}
                <button class="btn btn-dark" type="button" onclick={handleSaveShared}>
                  {t('saveToMyHearts', lang)}
                </button>
              {/if}
            {/if}
            <button class="btn btn-primary" type="button" onclick={handleDownload} disabled={!design}>
              <DownloadIcon size={18} />
              {t('downloadPdfTemplate', lang)}
            </button>
            <a class="btn btn-outline" href={editHref} onclick={handleEdit}>
              <PencilIcon size={18} />
              {t('openInEditor', lang)}
            </a>
            <button
              class="btn btn-ghost"
              type="button"
              onclick={handleShare}
              aria-label={t('share', lang)}
            >
              {#if shareStatus === 'copied'}
                {t('copied', lang)}
              {:else if shareStatus === 'error'}
                {t('failed', lang)}
              {:else}
                <ShareIcon size={18} />
                {t('share', lang)}
              {/if}
            </button>
          </div>

          {#if isShared && savedShared}
            <p class="save-note" role="status">{t('savedToMyHearts', lang)}</p>
          {:else if saveError}
            <p class="save-note save-error" role="alert">{saveError}</p>
          {/if}
        </div>

        <div class="panel">
          {#if isShared}
            <p class="shared-note">{t('sharedHeart', lang)}</p>
          {/if}

          <div class="panel-head">
            <h1>{info.name}</h1>
            <p class="credit">
              {#if info.author}
                {t('by', lang)}
                {#if info.authorUrl}
                  <a href={info.authorUrl} target="_blank" rel="noopener noreferrer">{info.author}</a>
                {:else}
                  {info.author}
                {/if}
                &middot;
              {/if}
              {stripsLabel}
            </p>
            {#if extraMeta.length}
              <p class="credit-extra">
                {#each extraMeta as row, i (row.label)}
                  {#if i > 0}&middot;{/if}
                  <span>
                    {row.label}:
                    {#if row.url}
                      <a href={row.url} target="_blank" rel="noopener noreferrer">{row.value}</a>
                    {:else}
                      {row.value}
                    {/if}
                  </span>
                {/each}
              </p>
            {/if}
          </div>

          {#if description}
            <p class="description">{description}</p>
          {/if}

          <div class="facts">
            <div class="fact">
              <span class="fact-label">{t('difficulty', lang)}</span>
              <DifficultyDots level={info.difficulty} {lang} size={10} />
            </div>
            <div class="fact">
              <span class="fact-label">{t('symmetry', lang)}</span>
              <span class="fact-value">
                {sharedTemplate ? t('symmetryOneTemplate', lang) : t('symmetryTwoTemplates', lang)}
              </span>
            </div>
          </div>

          <div class="how-to">
            <h2>{t('howToMake', lang)}</h2>
            <StepList {lang} />
            <a class="guide-link" href={routeHref('howTo', lang)}>
              {t('seeIllustratedGuide', lang)}
              <ArrowRightIcon size={16} />
            </a>
          </div>
        </div>
      {:else if loading}
        <div class="detail-message">
          <p class="message-card">{t('loadingTemplate', lang)}</p>
        </div>
      {/if}
    </div>
  </Scene>

  {#if data.categoryId && data.related.length > 0}
    <RelatedHearts
      hearts={data.related}
      categoryId={data.categoryId}
      categoryCount={data.categoryCount}
      {lang}
    />
  {/if}
  </main>
</div>

<style>
  .detail-page {
    display: flex;
    flex-direction: column;
  }

  /* breadcrumb */
  .crumb-row {
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 18px 40px 0;
    box-sizing: border-box;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    color: var(--green);
    font-size: 14px;
    font-weight: 500;
  }

  .crumb:hover {
    color: var(--red);
  }

  /* The sky panel and the landscape along its bottom come from <Scene>; the firs
     the heart hangs on are drawn over them here. */
  .scene-trees {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 820px;
    display: block;
    pointer-events: none;
  }

  .detail-main {
    position: relative;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 12px 40px 40px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 600px minmax(0, 1fr);
    gap: 56px;
    align-items: start;
  }

  /* Loading and error states still sit on the scene, so the text gets the panel's
     translucent backing to stay readable over the drawing. */
  .detail-message {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 420px;
  }

  .message-card {
    margin: 0;
    padding: 20px 28px;
    border-radius: 16px;
    background: rgb(255 255 255 / 0.7);
    color: var(--muted);
    font-size: 16px;
    text-align: center;
  }

  .message-card.is-error {
    color: var(--red);
  }

  .stage-col {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 6px;
  }

  .save-note {
    margin: 0;
    color: var(--green);
    font-size: 14px;
  }

  .save-error {
    color: var(--red);
  }

  /* the translucent text panel */
  .panel {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 24px 28px;
    border-radius: 16px;
    background: rgb(255 255 255 / 0.55);
  }

  .shared-note {
    margin: 0;
    color: var(--green);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .panel-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .panel h1 {
    margin: 0;
    font-size: 44px;
    font-weight: 600;
    line-height: 1.05;
    color: var(--deep);
  }

  .credit {
    margin: 0;
    font-size: 16px;
    color: var(--muted);
  }

  .credit-extra {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .credit a,
  .credit-extra a {
    color: var(--green);
    text-decoration: none;
  }

  .credit a:hover,
  .credit-extra a:hover {
    color: var(--red);
    text-decoration: underline;
  }

  .description {
    margin: 0;
    font-size: 17px;
    line-height: 1.5;
    color: var(--ink);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    padding: 16px 0;
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fact-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .fact-value {
    font-size: 15px;
    color: var(--ink);
  }

  .how-to {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .how-to h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--deep);
  }

  .guide-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--green);
    text-decoration: none;
  }

  .guide-link:hover {
    color: var(--red);
  }

  /* Stacked below 1100: the big fir has no room next to the text. */
  @media (max-width: 1099px) {
    .detail-main {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }

    .scene-trees {
      display: none;
    }
  }

  @media (max-width: 899px) {
    .crumb-row {
      padding: 14px 24px 0;
    }

    .detail-main {
      padding: 12px 24px 32px;
    }

    .panel h1 {
      font-size: 36px;
    }
  }

  @media (max-width: 599px) {
    .crumb-row {
      padding: 12px 16px 0;
    }

    .detail-main {
      padding: 12px 16px 28px;
    }

    .panel {
      padding: 20px 18px;
      gap: 18px;
    }

    .panel h1 {
      font-size: 30px;
    }

    .description {
      font-size: 16px;
    }

    .facts {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>

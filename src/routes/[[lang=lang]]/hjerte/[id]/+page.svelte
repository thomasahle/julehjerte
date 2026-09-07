<!--
  The heart detail page — docs/redesign/DESIGN.md §4.

  A page-wide winter scene: the landscape drawing runs edge to edge along the
  bottom, three firs are drawn over it on the left, and the heart hangs from the
  big one on a stage whose four thumbnails swap the big view. The translucent
  panel on the right carries the name, the paragraph about this heart and the
  facts, with the three action buttons directly under it; below the scene the
  rest of the category is offered as "Flere {kategori}".

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
  import HeartActions from "$lib/components/detail/HeartActions.svelte";
  import HeartPanel from "$lib/components/detail/HeartPanel.svelte";
  import HeartStage from "$lib/components/detail/HeartStage.svelte";
  import RelatedHearts from "$lib/components/detail/RelatedHearts.svelte";
  import Fir from "$lib/components/Fir.svelte";
  import Scene from "$lib/components/Scene.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
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
  import { editorHref, heartPath, homeAnchorHref } from "$lib/i18n/routes";
  import { lobesShareTemplate } from "$lib/utils/symmetry";
  import { calculateDifficulty } from "$lib/utils/difficulty";
  import { normalizeHeartDesign, serializeHeartDesign } from "$lib/utils/heartDesign";
  import { decodeSharedDesign, encodeSharedDesign, sharedDesignUrl } from "$lib/utils/shareDesign";
  import { makeHeartAnchorId } from "$lib/utils/heartAnchors";
  import { firstSentence } from "$lib/utils/text";
  import type { HeartDesign, HeartInfo } from "$lib/types/heart";
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
        gridSize: design.gridSize,
        difficulty: calculateDifficulty(design).level,
      };
    }
    return null;
  });

  // Photo of the finished heart (gallery hearts only; resolved at build time).
  let photo = $derived(isUserCreated ? null : (meta?.photo ?? null));

  // A gallery heart's paragraph is written in both languages and resolved in +page.ts.
  // Anything else — a heart the visitor drew, one shared by link, an unlisted SVG under
  // /hearts/ — shows whatever description its maker typed, in whatever language that is.
  let description = $derived(data.description ?? (meta ? null : (design?.description ?? null)));

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
    // Only the opening sentence: the panel's paragraph runs to four of them, and a
    // search result shows about 160 characters.
    const details = description ? firstSentence(description).replace(/[.!?]?$/, ".") : null;
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
        </div>

        <!-- The buttons belong to the panel, not to the picture: they sit
             directly under it and flush with its left edge, and when the
             columns stack below 1100 they follow it down. -->
        <div class="panel-col">
          <HeartPanel
            {lang}
            {info}
            {stripsLabel}
            {description}
            {extraMeta}
            {sharedTemplate}
            {isShared}
          />

          <HeartActions
            {lang}
            hasDesign={design !== null}
            {editHref}
            {isShared}
            {savedShared}
            errorNote={saveError}
            galleryHref={design ? homeAnchorHref(makeHeartAnchorId(design.id), lang) : ''}
            {shareStatus}
            onDownload={handleDownload}
            onEdit={handleEdit}
            onShare={handleShare}
            onSaveShared={handleSaveShared}
          />
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

  /* Panel and buttons share one column, so the row of buttons starts on the
     panel's left edge rather than on its padded text. */
  .panel-col {
    display: flex;
    flex-direction: column;
    gap: 18px;
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
    .detail-main {
      padding: 12px 24px 32px;
    }
  }

  @media (max-width: 599px) {
    .detail-main {
      padding: 12px 16px 28px;
    }
  }
</style>

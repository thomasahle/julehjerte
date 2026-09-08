<!--
  The front page — docs/redesign/DESIGN.md §3.

  Order: nav → hero (hanging hearts over the winter landscape) → gallery (sticky
  toolbar, categories, "Mine hjerter") → footer, as one fluid document with the
  redesign's 1400 / 1200 / 900 / 700 / 600 breakpoints.

  The route composes those sections and holds only what spans them: which hearts
  are ticked (mirrored into `?selected=`), the multi-heart PDF and its layout,
  the delete confirmation for the visitor's own hearts, and the `#heart-<id>`
  anchor the detail page links back to. Everything with markup of its own lives
  in $lib/components/front.
-->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import Modal from "$lib/components/Modal.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Hero from "$lib/components/front/Hero.svelte";
  import HeroBootstrap from "$lib/components/front/HeroBootstrap.svelte";
  import Gallery from "$lib/components/front/Gallery.svelte";
  import { deleteUserDesign, getUserCollection } from "$lib/stores/collection";
  import { toGalleryHeart, type GalleryHeart, type HeroHeart } from "$lib/front/galleryHearts";
  import type { LayoutMode } from "$lib/pdf/template";
  import { SITE_TITLE, SITE_TITLE_EN } from "$lib/config";
  import { t, type Language } from "$lib/i18n";
  import { keepKnown, parseSelected, selectionSearch, toggleSelected } from "$lib/front/selection";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartView,
    trackHeartSelect,
    trackMultiDownload,
  } from "$lib/analytics";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  // The gallery's hearts arrive from the load function as names, difficulties and
  // finished SVGs — never as geometry, which the browser does not download (see
  // $lib/front/galleryHearts). Hearts the visitor drew live in localStorage and
  // are read in the browser; their geometry is large and slows down tight loops
  // if proxied, so keep it out of deeply reactive state.
  let userHearts = $state.raw<HeartDesign[]>([]);

  let selectedIds = $state<Set<string>>(new Set());
  let generating = $state(false);
  let pdfLayout = $state<LayoutMode>("medium");
  let lang = $derived(($page.params.lang === "en" ? "en" : "da") as Language);
  let metaTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
  let pendingAnchorId = $state<string | null>(null);

  /** Mirror the ticked hearts into `?selected=`, without adding to history. */
  function updateUrlWithSelections(ids: Set<string>) {
    if (!browser) return;
    const url = new URL(window.location.href);
    // Rebuilt from the whole URL, not just its query: the hash carries the
    // `#heart-<id>` anchor a visitor arrived on, and ticking a card must not
    // throw it away.
    const search = selectionSearch(url.searchParams, ids);
    goto(`${url.pathname}${search}${url.hash}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  onMount(() => {
    userHearts = getUserCollection();
    // Read before the pruning below, which rewrites the URL.
    pendingAnchorId = window.location.hash.slice(1) || null;
    // `?selected=` is shareable, so it can name hearts this browser does not
    // have (the sender's own, or one since deleted). Drop them now that every
    // heart on the page is known, so the badge, the button and the PDF agree
    // and the URL stops carrying dead ids.
    const fromUrl = parseSelected(window.location.search);
    selectedIds = keepKnown(fromUrl, allHearts.map((h) => h.id));
    if (selectedIds.size !== fromUrl.size) updateUrlWithSelections(selectedIds);
  });

  function handleSelect(heart: GalleryHeart) {
    const wasSelected = selectedIds.has(heart.id);
    selectedIds = toggleSelected(selectedIds, heart.id);
    updateUrlWithSelections(selectedIds);
    trackHeartSelect(heart.id, heart.name, !wasSelected);
  }

  // The card's details link navigates; this only records the view.
  function handleClick(heart: GalleryHeart) {
    trackHeartView(heart.id, heart.name);
  }

  // Select all / none (GitHub issue #11): every heart shown, including the user's own.
  function handleSelectAll() {
    selectedIds = new Set(allHearts.map((h) => h.id));
    updateUrlWithSelections(selectedIds);
  }

  function handleSelectNone() {
    selectedIds = new Set();
    updateUrlWithSelections(selectedIds);
  }

  let deleteCandidate = $state.raw<GalleryHeart | null>(null);
  let cancelDeleteButtonEl = $state.raw<HTMLButtonElement | null>(null);

  function handleDelete(heart: GalleryHeart) {
    deleteUserDesign(heart.id);
    userHearts = userHearts.filter((h) => h.id !== heart.id);

    if (selectedIds.has(heart.id)) {
      selectedIds = toggleSelected(selectedIds, heart.id);
      updateUrlWithSelections(selectedIds);
    }
  }

  function requestDelete(heart: GalleryHeart) {
    deleteCandidate = heart;
  }

  function cancelDelete() {
    deleteCandidate = null;
  }

  function confirmDelete() {
    if (!deleteCandidate) return;
    handleDelete(deleteCandidate);
    deleteCandidate = null;
  }

  let galleryCategories = $derived(
    data.indexCategories.map((category) => ({
      id: category.id,
      hearts: category.hearts.map((id) => data.hearts[id]).filter(Boolean),
    })),
  );

  let myHearts = $derived(userHearts.map(toGalleryHeart));
  let myDesigns = $derived(Object.fromEntries(userHearts.map((h) => [h.id, h])));

  // The hero's slots, in slot order. Which heart ends up in each is decided by
  // the inline bootstrap script while the page parses; these are the prerendered
  // stand-ins it replaces (and what a visitor without JavaScript keeps).
  function heroHeart(id: string, markup: string | undefined): HeroHeart | undefined {
    const heart = data.hearts[id];
    return heart ? { id, name: heart.name, markup, design: data.designs?.[id] } : undefined;
  }

  let heroDesktop = $derived(
    data.heroIds.desktop.map((id, i) => heroHeart(id, data.heroMarkup?.desktop[i])),
  );
  let heroMobile = $derived(
    data.heroIds.mobile.map((id, i) => heroHeart(id, data.heroMarkup?.mobile[i])),
  );

  // Every heart on the page (gallery + the visitor's own), for select all and the PDF.
  let allHearts = $derived([
    ...galleryCategories.flatMap((category) => category.hearts),
    ...myHearts,
  ]);

  // The detail page links back to `#heart-<id>`. That card may only exist once
  // localStorage has been read, so the scroll waits for the list to grow: the
  // `allHearts.length` read below is this effect's dependency, and the id is
  // read and cleared outside it so the effect does not depend on itself.
  $effect(() => {
    void allHearts.length;
    const anchorId = untrack(() => pendingAnchorId);
    if (!browser || !anchorId) return;
    const target = document.getElementById(anchorId);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    untrack(() => (pendingAnchorId = null));
  });

  // The ticked hearts, resolved against the page. The toolbar's badge, its
  // disabled state and the PDF all count these and not the raw ids, so a
  // `?selected=` naming a heart this browser does not have cannot promise a
  // template that never arrives.
  let selectedHearts = $derived(allHearts.filter((h) => selectedIds.has(h.id)));

  async function handlePrintSelected() {
    const selected = selectedHearts;
    if (selected.length > 0) {
      generating = true;
      try {
        trackMultiDownload(
          selected.map((h) => h.id),
          selected.length,
        );
        // jsPDF is 140 KB gzipped and the gallery hearts' geometry another 61 KB
        // — and the page itself needs neither until this click, since the hearts
        // it shows come prerendered. Both are fetched here rather than in the
        // front page's initial bundle.
        const [{ downloadMultiPDF }, { getGalleryDesign }] = await Promise.all([
          import("$lib/pdf/template"),
          import("$lib/data/heartDesigns"),
        ]);
        const designs = selected
          .map((h) => myDesigns[h.id] ?? getGalleryDesign(h.id))
          .filter((d): d is HeartDesign => Boolean(d));
        await downloadMultiPDF(designs, { layout: pdfLayout, lang });
      } catch (err) {
        // The toolbar has no message slot; at least do not fail silently.
        console.error("Generating the multi-heart PDF failed", err);
      } finally {
        generating = false;
      }
    }
  }

  let allSelected = $derived(allHearts.length > 0 && selectedHearts.length === allHearts.length);
</script>

<svelte:head>
  <title>{metaTitle}</title>
</svelte:head>

<PageHeader {lang} active="templates" />

<main id="main-content" tabindex="-1">
  <Hero
    {lang}
    desktop={heroDesktop}
    mobile={heroMobile}
    revealed={data.heroMarkup === null}
  />

  <Gallery
    {lang}
    categories={galleryCategories}
    markup={data.markup}
    designs={data.designs}
    {myHearts}
    {myDesigns}
    {selectedIds}
    selectedCount={selectedHearts.length}
    {generating}
    {allSelected}
    bind:pdfLayout
    onPrint={handlePrintSelected}
    onSelectAll={handleSelectAll}
    onSelectNone={handleSelectNone}
    onSelect={handleSelect}
    onClick={handleClick}
    onDelete={requestDelete}
  />

  <!-- Hangs the hero's hearts while the page is still parsing. It clones them
       out of the cards above, so it belongs after the gallery and nowhere
       else — see $lib/front/heroBootstrap. -->
  <HeroBootstrap script={data.heroScript} />
</main>

<Modal
  open={deleteCandidate !== null}
  labelledBy="delete-title"
  initialFocus={cancelDeleteButtonEl}
  onClose={cancelDelete}
>
  <h2 id="delete-title">{t('deleteHeartTitle', lang)}</h2>
  <p>{t('deleteHeartPrompt', lang)}</p>
  <p class="delete-heart-name">{deleteCandidate?.name}</p>
  <div class="delete-actions">
    <button
      type="button"
      class="btn btn-ghost"
      onclick={cancelDelete}
      bind:this={cancelDeleteButtonEl}
    >
      {t('cancel', lang)}
    </button>
    <button type="button" class="btn btn-primary" onclick={confirmDelete}>
      {t('delete', lang)}
    </button>
  </div>
</Modal>

<style>
  /* The delete confirmation's own contents; <Modal> owns the scrim and card. */
  h2 {
    margin: 0 0 8px;
    font-size: 20px;
    color: var(--deep);
  }

  p {
    margin: 8px 0;
    color: var(--muted);
    line-height: 1.5;
  }

  .delete-heart-name {
    font-weight: 600;
    color: var(--ink);
  }

  .delete-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
  }
</style>

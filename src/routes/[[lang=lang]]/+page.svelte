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
  import Gallery from "$lib/components/front/Gallery.svelte";
  import { deleteUserDesign, getUserCollection } from "$lib/stores/collection";
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

  // Gallery hearts come precomputed from the load function (prerendered); user hearts
  // live in localStorage and are read in the browser. The full heart geometry
  // (segments) is large and slows down tight geometry loops if proxied, so keep it
  // out of deeply reactive state.
  let staticHearts = $derived(data.designs);
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

  function handleSelect(design: HeartDesign) {
    const wasSelected = selectedIds.has(design.id);
    selectedIds = toggleSelected(selectedIds, design.id);
    updateUrlWithSelections(selectedIds);
    trackHeartSelect(design.id, design.name, !wasSelected);
  }

  // The card's details link navigates; this only records the view.
  function handleClick(design: HeartDesign) {
    trackHeartView(design.id, design.name);
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

  let deleteCandidate = $state.raw<HeartDesign | null>(null);
  let cancelDeleteButtonEl = $state.raw<HTMLButtonElement | null>(null);

  function handleDelete(design: HeartDesign) {
    deleteUserDesign(design.id);
    userHearts = userHearts.filter((h) => h.id !== design.id);

    if (selectedIds.has(design.id)) {
      selectedIds = toggleSelected(selectedIds, design.id);
      updateUrlWithSelections(selectedIds);
    }
  }

  function requestDelete(design: HeartDesign) {
    deleteCandidate = design;
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
      hearts: category.hearts.map((id) => staticHearts[id]).filter(Boolean),
    })),
  );

  let myHearts = $derived(userHearts.map((h) => ({ ...h, isUserCreated: true })));

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
        // jsPDF is 140 KB gzipped and nothing needs it until this click, so it is
        // loaded here instead of in the front page's initial bundle.
        const { downloadMultiPDF } = await import("$lib/pdf/template");
        await downloadMultiPDF(selected, { layout: pdfLayout, lang });
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
  <Hero {lang} designs={staticHearts} />

  <Gallery
    {lang}
    categories={galleryCategories}
    {myHearts}
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

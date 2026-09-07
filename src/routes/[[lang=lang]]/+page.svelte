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
  import { onMount, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Hero from "$lib/components/front/Hero.svelte";
  import Gallery from "$lib/components/front/Gallery.svelte";
  import { deleteUserDesign, getUserCollection } from "$lib/stores/collection";
  import type { LayoutMode } from "$lib/pdf/template";
  import { SITE_TITLE, SITE_TITLE_EN } from "$lib/config";
  import { t, type Language } from "$lib/i18n";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartView,
    trackHeartSelect,
    trackMultiDownload,
  } from "$lib/analytics";
  import { Button } from "$lib/components/ui/button";

  type IndexedCategory = { id: string; hearts: string[] };

  let { data } = $props();
  let indexCategories = $derived(data.indexCategories as IndexedCategory[]);

  // Gallery hearts come precomputed from the load function (prerendered); user hearts
  // live in localStorage and are read in the browser. The full heart geometry
  // (segments) is large and slows down tight geometry loops if proxied, so keep it
  // out of deeply reactive state.
  let staticHearts = $derived(data.designs as Record<string, HeartDesign>);
  let userHearts = $state.raw<HeartDesign[]>([]);

  let selectedIds = $state<Set<string>>(new Set());
  let generating = $state(false);
  let pdfLayout = $state<LayoutMode>("medium");
  let lang = $derived(($page.params.lang === "en" ? "en" : "da") as Language);
  let metaTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
  let pendingAnchorId = $state<string | null>(null);

  // Read selections from URL on mount
  function getSelectionsFromUrl(): Set<string> {
    if (!browser) return new Set();
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("selected");
    if (selected) {
      return new Set(selected.split(",").filter(Boolean));
    }
    return new Set();
  }

  // Update URL with current selections (without adding to history)
  function updateUrlWithSelections(ids: Set<string>) {
    if (!browser) return;
    const url = new URL(window.location.href);
    if (ids.size > 0) {
      url.searchParams.set("selected", Array.from(ids).join(","));
    } else {
      url.searchParams.delete("selected");
    }
    goto(`?${url.searchParams.toString()}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  onMount(() => {
    // Load selections from URL first
    selectedIds = getSelectionsFromUrl();

    userHearts = getUserCollection();
    pendingAnchorId = window.location.hash.slice(1) || null;
  });

  function handleSelect(design: HeartDesign) {
    const newSet = new Set(selectedIds);
    const wasSelected = newSet.has(design.id);
    if (wasSelected) {
      newSet.delete(design.id);
    } else {
      newSet.add(design.id);
    }
    selectedIds = newSet;
    updateUrlWithSelections(newSet);
    trackHeartSelect(design.id, design.name, !wasSelected);
  }

  // The card's details link navigates; this only records the view.
  function handleClick(design: HeartDesign) {
    trackHeartView(design.id, design.name);
  }

  // Select all / none (GitHub issue #11): every heart shown, including the user's own.
  function handleSelectAll() {
    const newSet = new Set(allHearts.map((h) => h.id));
    selectedIds = newSet;
    updateUrlWithSelections(newSet);
  }

  function handleSelectNone() {
    selectedIds = new Set();
    updateUrlWithSelections(selectedIds);
  }

  let deleteCandidate = $state.raw<HeartDesign | null>(null);
  let cancelDeleteButtonEl = $state.raw<HTMLElement | null>(null);

  $effect(() => {
    if (!deleteCandidate) return;
    tick().then(() => cancelDeleteButtonEl?.focus());
  });

  function handleDelete(design: HeartDesign) {
    deleteUserDesign(design.id);
    userHearts = userHearts.filter((h) => h.id !== design.id);

    if (selectedIds.has(design.id)) {
      const newSet = new Set(selectedIds);
      newSet.delete(design.id);
      selectedIds = newSet;
      updateUrlWithSelections(newSet);
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
    indexCategories.map((category) => ({
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

  $effect(() => {
    const _ = allHearts.length;
    if (!browser || !pendingAnchorId) return;
    const target = document.getElementById(pendingAnchorId);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    pendingAnchorId = null;
  });

  async function handlePrintSelected() {
    const selected = allHearts.filter((h) => selectedIds.has(h.id));
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
      } finally {
        generating = false;
      }
    }
  }

  let allSelected = $derived(allHearts.length > 0 && allHearts.every((h) => selectedIds.has(h.id)));
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

{#if deleteCandidate}
  <div
    class="modal-overlay"
    onclick={cancelDelete}
    onkeydown={(e) => e.key === 'Escape' && cancelDelete()}
    role="presentation"
  >
    <div
      class="modal delete-modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="delete-title"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === 'Escape') cancelDelete();
        e.stopPropagation();
      }}
    >
      <h2 id="delete-title">{t('deleteHeartTitle', lang)}</h2>
      <p>{t('deleteHeartPrompt', lang)}</p>
      <p class="delete-heart-name">{deleteCandidate.name}</p>
      <div class="delete-actions">
        <Button variant="secondary" onclick={cancelDelete} bind:ref={cancelDeleteButtonEl}>
          {t('cancel', lang)}
        </Button>
        <Button variant="destructive" onclick={confirmDelete}>{t('delete', lang)}</Button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* --------------------------------------------------------------- modal -- */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: var(--scrim);
  }

  .modal {
    width: min(520px, 100%);
    padding: 22px;
    border-radius: 14px;
    background: var(--white);
    box-shadow: var(--shadow-modal);
  }

  .modal h2 {
    margin: 0 0 8px;
    font-size: 20px;
    color: var(--deep);
  }

  .modal p {
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

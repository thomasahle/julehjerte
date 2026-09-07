<!--
  The front page — docs/redesign/DESIGN.md §3.

  Order: nav → hero (hanging hearts over the winter landscape) → gallery (sticky
  toolbar, categories, "Mine hjerter") → footer, as one fluid document with the
  redesign's 1400 / 1200 / 900 / 700 / 600 breakpoints.

  Everything that made the old page work is still here: PDF selection mirrored
  into `?selected=`, the multi-heart PDF and its layout menu, select all / none,
  the delete confirmation for user hearts, the `#heart-<id>` anchor the detail
  page links back to, and the analytics events.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import HeartCard from "$lib/components/HeartCard.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Landscape from "$lib/components/Landscape.svelte";
  import Fir from "$lib/components/Fir.svelte";
  import Star from "$lib/components/Star.svelte";
  import HeroHearts from "$lib/components/front/HeroHearts.svelte";
  import ScrollHint from "$lib/components/front/ScrollHint.svelte";
  import StepsStrip from "$lib/components/front/StepsStrip.svelte";
  import GalleryFrame from "$lib/components/front/GalleryFrame.svelte";
  import MyHeartsEmpty from "$lib/components/front/MyHeartsEmpty.svelte";
  import {
    HERO_SLOTS_DESKTOP,
    HERO_SLOTS_MOBILE,
    HERO_SKY_STARS,
    HERO_SKY_DOTS,
  } from "$lib/components/front/heroSlots";
  import { DownloadIcon, GearIcon, PencilIcon, ArrowRightIcon } from "$lib/components/icons";
  import { deleteUserDesign, getUserCollection } from "$lib/stores/collection";
  import { downloadMultiPDF, type LayoutMode } from "$lib/pdf/template";
  import { SITE_TITLE, SITE_TITLE_EN } from "$lib/config";
  import { t, type Language } from "$lib/i18n";
  import { href as routeHref } from "$lib/i18n/routes";
  import { categoryTitle, MY_HEARTS_CATEGORY_ID } from "$lib/data/categories";
  import {
    HERO_HEART_IDS,
    HERO_HEART_IDS_MOBILE,
    pickRandomHeartIds,
  } from "$lib/utils/randomHearts";
  import { FIR_FILLS } from "$lib/landscape";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartView,
    trackHeartSelect,
    trackMultiDownload,
  } from "$lib/analytics";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";

  // Layout options for PDF generation
  const LAYOUT_OPTIONS: {
    value: LayoutMode;
    labelKey: "layoutSmall" | "layoutMedium" | "layoutLarge";
  }[] = [
    { value: "small", labelKey: "layoutSmall" },
    { value: "medium", labelKey: "layoutMedium" },
    { value: "large", labelKey: "layoutLarge" },
  ];

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

  // ---- hero -------------------------------------------------------------
  // Prerendered with a fixed set of hearts; after hydration a random set
  // cross-fades into the same slots, so nothing moves. The two layers are drawn
  // on top of each other during the fade and the outgoing one is then dropped.
  const HERO_FADE_MS = 400;
  let heroRandomIds = $state.raw<string[] | null>(null);
  let heroSwapped = $state(false);
  let heroDropInitial = $state(false);
  let heroMobileIds = $derived(heroRandomIds ? heroRandomIds.slice(0, HERO_SLOTS_MOBILE.length) : []);

  // ---- gallery frame ----------------------------------------------------
  // Decorative only, and only drawn from 1400px up, so it is measured in the
  // browser rather than guessed at prerender time.
  let galleryWrapEl = $state.raw<HTMLElement | null>(null);
  let frameHeight = $state(0);

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

    // Swap the hero's prerendered hearts for a random set.
    const picked = pickRandomHeartIds(HERO_SLOTS_DESKTOP.length);
    if (picked.length < HERO_SLOTS_DESKTOP.length) return;
    heroRandomIds = picked;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      heroSwapped = true;
      heroDropInitial = true;
      return;
    }

    // Two frames so the incoming layer is painted at opacity 0 before it rises.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        heroSwapped = true;
      });
    });
    const timer = setTimeout(() => {
      heroDropInitial = true;
    }, HERO_FADE_MS + 300);

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(timer);
    };
  });

  $effect(() => {
    if (!browser || !galleryWrapEl) return;
    const el = galleryWrapEl;
    const wideEnough = window.matchMedia("(min-width: 1400px)");
    const measure = () => {
      frameHeight = wideEnough.matches ? Math.round(el.getBoundingClientRect().height) : 0;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    wideEnough.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      wideEnough.removeEventListener("change", measure);
    };
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
    target.scrollIntoView({ block: "center", behavior: "smooth" });
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
        await downloadMultiPDF(selected, { layout: pdfLayout, lang });
      } finally {
        generating = false;
      }
    }
  }

  function heartCount(n: number): string {
    return t("categoryHeartCount", lang).replace("{n}", String(n));
  }

  let selectedCount = $derived(selectedIds.size);
  let allSelected = $derived(allHearts.length > 0 && allHearts.every((h) => selectedIds.has(h.id)));
</script>

<svelte:head>
  <title>{metaTitle}</title>
</svelte:head>

<PageHeader {lang} active="templates" />

<section class="hero">
  <!-- The landscape is inlined once per page; every <Fir>/<Star> below is a
       <use> of an id in its <defs>. -->
  <div class="hero-land-wrap"><Landscape class="hero-land" /></div>

  <svg
    class="hero-sky-m"
    viewBox="0 0 420 300"
    preserveAspectRatio="xMidYMin meet"
    aria-hidden="true"
    focusable="false"
  >
    {#each HERO_SKY_STARS as [x, y, scale] (`${x}-${y}`)}
      <Star {x} {y} {scale} />
    {/each}
    {#each HERO_SKY_DOTS as [cx, cy, r] (`${cx}-${cy}`)}
      <circle {cx} {cy} {r} fill="#fff" opacity="0.85" />
    {/each}
  </svg>

  <svg
    class="hero-tree-m"
    viewBox="0 0 390 230"
    preserveAspectRatio="xMinYMax meet"
    aria-hidden="true"
    focusable="false"
  >
    <Fir x={70} tipY={128} height={100} fill={FIR_FILLS[1]} symbol="pine-b" widthFactor={0.9} />
    <Fir x={20} tipY={52} height={178} fill={FIR_FILLS[0]} symbol="pine-c" widthFactor={0.85} />
  </svg>

  <div class="hero-inner">
    <div class="hero-hearts hero-hearts-m">
      {#if !heroDropInitial}
        <HeroHearts
          slots={HERO_SLOTS_MOBILE}
          ids={HERO_HEART_IDS_MOBILE}
          designs={staticHearts}
          idPrefix="hero-m-a"
          faded={heroSwapped}
        />
      {/if}
      {#if heroRandomIds}
        <HeroHearts
          slots={HERO_SLOTS_MOBILE}
          ids={heroMobileIds}
          designs={staticHearts}
          idPrefix="hero-m-b"
          faded={!heroSwapped}
        />
      {/if}
    </div>

    <div class="hero-text">
      <h1>{t("siteWordmark", lang)}</h1>
      <h2>{t("heroTagline", lang)}</h2>
      <p>{t("heroIntro", lang)}</p>
      <div class="hero-btns">
        <a class="btn btn-primary" href={routeHref("editor", lang)}>
          <PencilIcon size={18} />
          {t("createNewHeart", lang)}
        </a>
        <a class="btn btn-outline hero-btn-secondary" href="#skabeloner">
          <ArrowRightIcon size={18} />
          {t("heroSeeTemplates", lang)}
        </a>
      </div>
    </div>

    <div class="hero-hearts hero-hearts-d">
      {#if !heroDropInitial}
        <HeroHearts
          slots={HERO_SLOTS_DESKTOP}
          ids={HERO_HEART_IDS}
          designs={staticHearts}
          idPrefix="hero-d-a"
          faded={heroSwapped}
        />
      {/if}
      {#if heroRandomIds}
        <HeroHearts
          slots={HERO_SLOTS_DESKTOP}
          ids={heroRandomIds}
          designs={staticHearts}
          idPrefix="hero-d-b"
          faded={!heroSwapped}
        />
      {/if}
    </div>
  </div>

  <ScrollHint {lang} />
</section>

<div class="gallery-wrap" bind:this={galleryWrapEl}>
  <GalleryFrame height={frameHeight} />

  <div class="gallery" id="skabeloner">
    <div class="gallery-head">
      <h2>{t("galleryHeading", lang)}</h2>
    </div>

    <div class="toolbar">
      <span class="split">
        <Tooltip.Root disabled={selectedCount > 0 || generating}>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="split-main"
                onclick={handlePrintSelected}
                disabled={selectedCount === 0 || generating}
              >
                <DownloadIcon size={18} />
                {generating ? t("generating", lang) : t("printSelected", lang)}
                {#if !generating}
                  <span class="split-count">{selectedCount}</span>
                {/if}
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{t("selectHeartsFirst", lang)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="split-gear"
                aria-label={t("pdfSettings", lang)}
                title={t("pdfLayout", lang)}
              >
                <GearIcon size={18} />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="border-0">
            <DropdownMenu.RadioGroup bind:value={pdfLayout}>
              {#each LAYOUT_OPTIONS as option (option.value)}
                <DropdownMenu.RadioItem value={option.value}>
                  {t(option.labelKey, lang)}
                </DropdownMenu.RadioItem>
              {/each}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </span>

      <button
        type="button"
        class="btn btn-ghost"
        onclick={handleSelectAll}
        disabled={allSelected || generating}
      >
        {t("selectAll", lang)}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        onclick={handleSelectNone}
        disabled={selectedCount === 0 || generating}
      >
        {t("selectNone", lang)}
      </button>

      <StepsStrip {lang} />
    </div>

    {#each galleryCategories as category, i (category.id)}
      <section class="cat" id={category.id} style="padding-top: {i === 0 ? 8 : 44}px;">
        <div class="cat-head">
          <h3>{categoryTitle(category.id, lang)}</h3>
          <span>{heartCount(category.hearts.length)}</span>
        </div>
        <div class="cat-grid">
          {#each category.hearts as design, index (design.id)}
            <HeartCard
              {design}
              {lang}
              {index}
              selected={selectedIds.has(design.id)}
              onSelect={handleSelect}
              onClick={handleClick}
            />
          {/each}
        </div>
      </section>
    {/each}

    <section class="cat mine" id={MY_HEARTS_CATEGORY_ID}>
      <!-- No count here: the mockup's "Mine hjerter" row is the heading alone. -->
      <div class="cat-head">
        <h3>{categoryTitle(MY_HEARTS_CATEGORY_ID, lang)}</h3>
      </div>
      {#if myHearts.length === 0}
        <MyHeartsEmpty {lang} />
      {:else}
        <div class="cat-grid">
          {#each myHearts as design, index (design.id)}
            <HeartCard
              {design}
              {lang}
              {index}
              selected={selectedIds.has(design.id)}
              onSelect={handleSelect}
              onClick={handleClick}
              onDelete={requestDelete}
            />
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

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
  /* ---------------------------------------------------------------- hero -- */
  /* The bottom 12px of the hero is snow-coloured, so a fractional SVG edge can
     never show a sky-coloured hairline under the drawing. */
  .hero {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: linear-gradient(var(--sky), var(--sky)) 0 0 / 100% calc(100% - 12px) no-repeat
      var(--page);
  }

  .hero-land-wrap {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    line-height: 0;
  }

  .hero :global(.hero-land) {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 2172 / 724;
  }

  .hero-sky-m,
  .hero-tree-m {
    display: none;
    position: absolute;
    pointer-events: none;
  }

  /* A flex container paints absolutely positioned children in order-modified
     document order, and the landscape is order: 10 below 900px — so the corner
     firs need a stacking order of their own to stay on top of it. */
  .hero-tree-m {
    z-index: 1;
  }

  .hero-inner {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 640px;
    gap: 40px;
    align-items: start;
    height: 660px;
    padding: 0 40px 0 80px;
    box-sizing: border-box;
  }

  .hero-text {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 560px;
    padding-top: 88px;
  }

  .hero-text h1 {
    margin: 0;
    font-size: 56px;
    font-weight: 600;
    line-height: 1.05;
    color: var(--deep);
  }

  .hero-text h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 500;
    color: var(--green);
  }

  .hero-text p {
    margin: 0;
    max-width: 480px;
    font-size: 17px;
    line-height: 1.55;
    color: var(--muted);
  }

  .hero-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 8px;
  }

  .hero-hearts {
    position: relative;
  }

  .hero-hearts-d {
    height: 560px;
  }

  .hero-hearts-m {
    display: none;
  }

  /* ------------------------------------------------------------- gallery -- */
  .gallery-wrap {
    position: relative;
  }

  .gallery {
    position: relative;
    display: flex;
    flex-direction: column;
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
    padding: 24px 40px 56px;
    box-sizing: border-box;
  }

  .gallery-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 6px;
  }

  .gallery-head h2 {
    margin: 0;
    font-size: 32px;
    font-weight: 600;
    color: var(--deep);
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 14px 0;
    background: var(--page);
  }

  /* "Hent skabeloner (n)" and its PDF settings gear, as one red split button. */
  .split {
    display: inline-flex;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgb(31 51 41 / 0.12);
  }

  .split-main,
  .split-gear {
    display: inline-flex;
    align-items: center;
    height: 44px;
    border: none;
    background: var(--red);
    color: var(--white);
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .split-main {
    gap: 8px;
    padding: 0 18px;
    border-radius: 10px 0 0 10px;
  }

  .split-gear {
    justify-content: center;
    width: 44px;
    padding: 0;
    border-radius: 0 10px 10px 0;
    border-left: 1px solid rgb(255 255 255 / 0.35);
  }

  .split-main:hover:not(:disabled),
  .split-gear:hover:not(:disabled) {
    background: var(--red-hover);
  }

  .split-main:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .split-count {
    padding: 1px 9px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.22);
    font-size: 13px;
  }

  .cat {
    display: flex;
    flex-direction: column;
    /* The toolbar is sticky, so a category anchor must not land underneath it. */
    scroll-margin-top: 78px;
  }

  .cat-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 4px;
    margin-bottom: 10px;
  }

  .cat-head h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--green);
  }

  .cat-head span {
    font-size: 13px;
    color: var(--muted);
  }

  .cat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    column-gap: 24px;
    row-gap: 40px;
  }

  .mine {
    padding-top: 48px;
    gap: 12px;
  }

  /* --------------------------------------------------------------- modal -- */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgb(28 51 41 / 0.45);
  }

  .modal {
    width: min(520px, 100%);
    padding: 22px;
    border-radius: 14px;
    background: var(--white);
    box-shadow: 0 10px 30px rgb(28 51 41 / 0.25);
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

  /* --------------------------------------------------------- breakpoints -- */
  @media (max-width: 1199px) {
    .hero-inner {
      grid-template-columns: minmax(0, 1fr) 480px;
      height: 600px;
      padding: 0 32px 0 56px;
    }

    .hero-hearts-d {
      width: 640px;
      height: 420px;
      transform: scale(0.75);
      transform-origin: 0 0;
    }

    .hero-text {
      padding-top: 72px;
    }

    .hero-text h1 {
      font-size: 48px;
    }

    .hero-text h2 {
      font-size: 21px;
    }
  }

  @media (max-width: 899px) {
    /* The landscape leaves the absolute layer and becomes a 230px band at the
       foot of the hero; on phones it shows the right part of the drawing. */
    .hero-land-wrap {
      position: relative;
      top: 1px;
      order: 10;
      height: 230px;
      overflow: hidden;
    }

    .hero :global(.hero-land) {
      position: absolute;
      right: 0;
      bottom: 0;
      width: max(100%, 720px);
    }

    .hero-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      height: auto;
      padding: 0 24px 22px;
    }

    .hero-hearts-d {
      display: none;
    }

    .hero-hearts-m {
      display: block;
      width: 100%;
      max-width: 420px;
      height: 250px;
    }

    .hero-text {
      align-items: center;
      max-width: 520px;
      padding-top: 10px;
      gap: 12px;
    }

    .hero-text h1 {
      font-size: 44px;
    }

    .hero-text h2 {
      font-size: 19px;
    }

    .hero-text p {
      font-size: 15px;
    }

    .hero-btns {
      justify-content: center;
    }

    .hero-sky-m {
      display: block;
      left: 0;
      right: 0;
      top: 0;
      width: 100%;
      height: 300px;
    }

    .gallery {
      padding: 16px 24px 40px;
    }

    .gallery-head h2 {
      font-size: 26px;
    }

    .cat {
      scroll-margin-top: 70px;
    }
  }

  @media (max-width: 699px) {
    .toolbar {
      gap: 8px;
      padding: 10px 0;
    }
  }

  @media (max-width: 599px) {
    .hero-text h1 {
      font-size: 38px;
    }

    .hero-text h2 {
      font-size: 17px;
    }

    .hero-btn-secondary {
      display: none;
    }

    .hero-tree-m {
      display: block;
      left: 0;
      bottom: -1px;
      width: 100%;
      height: 230px;
    }

    .gallery {
      padding: 16px 16px 32px;
    }

    .cat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 14px;
      row-gap: 32px;
    }
  }
</style>

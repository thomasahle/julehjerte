<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import HeartCard from "$lib/components/HeartCard.svelte";
  import { deleteUserDesign, getUserCollection, loadStaticHeartById, type HeartCategoryWithMeta } from "$lib/stores/collection";
  import { downloadMultiPDF, type LayoutMode } from "$lib/pdf/template";
  import { SITE_TITLE, SITE_TITLE_EN, SITE_URL } from "$lib/config";
  import {
    t,
    type Language,
  } from "$lib/i18n";
  import {
    getColors,
    subscribeColors,
    type HeartColors,
  } from "$lib/stores/colors";
  import type { HeartDesign } from "$lib/types/heart";
  import {
    trackHeartView,
    trackHeartSelect,
    trackMultiDownload,
  } from "$lib/analytics";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";

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
  
  // Avoid making the full heart geometry (segments) deeply reactive — it's large and
  // slows down tight geometry loops (e.g. ribbon path building) if proxied.
  let loadedStaticHearts = $state.raw<Record<string, HeartDesign>>({});
  let userHearts = $state.raw<HeartDesign[]>([]);

  let selectedIds = $state<Set<string>>(new Set());
  let loadingStatic = $state(true);
  let generating = $state(false);
  let pdfLayout = $state<LayoutMode>("medium");
  let lang = $derived(($page.params.lang === 'en' ? 'en' : 'da') as Language);
  let langBase = $derived(`${base}${$page.params.lang ? `/${$page.params.lang}` : ''}`);
  let metaTitle = $derived(lang === "en" ? SITE_TITLE_EN : SITE_TITLE);
  let canonicalUrl = $derived(`${SITE_URL}${lang === "en" ? "/en/" : "/"}`);
  let alternateDaUrl = $derived(`${SITE_URL}/`);
  let alternateEnUrl = $derived(`${SITE_URL}/en/`);
  let colors = $state<HeartColors>({ left: "#ffffff", right: "#cc0000" });
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

  onMount(async () => {
    // Initialize colors
    colors = getColors();
    subscribeColors((c) => {
      colors = c;
    });

    // Load selections from URL first
    selectedIds = getSelectionsFromUrl();

    userHearts = getUserCollection();
    pendingAnchorId = browser ? window.location.hash.slice(1) || null : null;

    // Kick off heart loading in background; update UI as each heart arrives.
    const ids = indexCategories.flatMap((c) => c.hearts);
    loadingStatic = true;
    const loaded: Record<string, HeartDesign> = {};
    // Parsing SVG into heart designs is CPU-heavy; limit concurrency and yield
    // between parses so the gallery can paint progressively.
    const CONCURRENCY = 6;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        const design = await loadStaticHeartById(id);
        if (design) {
          loaded[id] = design;
          loadedStaticHearts = { ...loaded };
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await Promise.allSettled(workers);
    loadingStatic = false;
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

  function handleClick(design: HeartDesign) {
    trackHeartView(design.id, design.name);
    goto(`${langBase}/hjerte/${design.id}`);
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

  let categories = $derived.by(() => {
    const cats: HeartCategoryWithMeta[] = indexCategories.map((cat) => ({
      id: cat.id,
      hearts: cat.hearts.map((id) => loadedStaticHearts[id]).filter(Boolean)
    }));
    if (userHearts.length > 0) {
      cats.push({
        id: 'mine',
        hearts: userHearts.map((h) => ({ ...h, isUserCreated: true }))
      });
    }
    return cats;
  });

  // Flatten loaded hearts (static + user)
  let allHearts = $derived(categories.flatMap((cat) => cat.hearts));

  $effect(() => {
    const _ = allHearts.length;
    if (!browser || !pendingAnchorId) return;
    const target = document.getElementById(pendingAnchorId);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
        await downloadMultiPDF(selected, { layout: pdfLayout });
      } finally {
        generating = false;
      }
    }
  }

  // Category ID to translation key mapping
  const categoryTitleKeys: Record<string, "categoryKlassiske" | "categoryStjerner" | "categoryFigurer" | "categoryMoenstre" | "categoryHjerter" | "categoryMine"> = {
    klassiske: "categoryKlassiske",
    stjerner: "categoryStjerner",
    figurer: "categoryFigurer",
    moenstre: "categoryMoenstre",
    hjerter: "categoryHjerter",
    mine: "categoryMine",
  };

  let selectedCount = $derived(selectedIds.size);
</script>

<svelte:head>
  <title>{metaTitle}</title>
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="da" href={alternateDaUrl} />
  <link rel="alternate" hreflang="en" href={alternateEnUrl} />
  <link rel="alternate" hreflang="x-default" href={alternateDaUrl} />
</svelte:head>

<div class="gallery-page">
  <header>
    <h1>
      <a class="site-title-link" href="{langBase}/">{t("siteTitle", lang)}</a>
    </h1>
    <p>{t("siteDescription", lang)}</p>
  </header>

  <div class="toolbar">
    <Button href="{langBase}/editor" variant="destructive" class="shadow-s">
      {t("createNewHeart", lang)}
    </Button>
    <div class="inline-flex rounded-md shadow-xs" role="group">
      <Tooltip.Root disabled={selectedCount > 0 || generating}>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="secondary"
              class="rounded-r-none border-r-0"
              onclick={handlePrintSelected}
              disabled={selectedCount === 0 || generating}
            >
              {generating
                ? t("generating", lang)
                : `${t("printSelected", lang)} (${selectedCount})`}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{t("selectHeartsFirst", lang)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="secondary"
              size="icon"
              class="rounded-l-none"
              title="PDF Settings"
            >
              <SettingsIcon class="size-4" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="border-0">
          <DropdownMenu.RadioGroup bind:value={pdfLayout}>
            {#each LAYOUT_OPTIONS as option}
              <DropdownMenu.RadioItem value={option.value}>
                {t(option.labelKey, lang)}
              </DropdownMenu.RadioItem>
            {/each}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  </div>

  {#if allHearts.length === 0 && !loadingStatic}
    <div class="empty">
      <p>{t("noHeartsYet", lang)}</p>
      <p>{t("clickCreateNew", lang)}</p>
    </div>
  {:else}
    {#each categories as category (category.id)}
      <section class="category-section">
        <h2 class="category-header">{t(categoryTitleKeys[category.id], lang)}</h2>
        <div class="gallery svg-renderer">
          {#if category.id !== 'mine'}
            {#each (indexCategories.find((c) => c.id === category.id)?.hearts ?? []) as id (id)}
              {#if loadedStaticHearts[id]}
                {@const design = loadedStaticHearts[id]}
                <HeartCard
                  {design}
                  {lang}
                  selected={selectedIds.has(design.id)}
                  onSelect={handleSelect}
                  onClick={handleClick}
                />
              {:else}
                <div class="skeleton-card" aria-hidden="true"></div>
              {/if}
            {/each}
          {:else}
            {#each category.hearts as design (design.id)}
              <HeartCard
                {design}
                {lang}
                selected={selectedIds.has(design.id)}
                onSelect={handleSelect}
                onClick={handleClick}
                onDelete={requestDelete}
              />
            {/each}
          {/if}
        </div>
      </section>
    {/each}
    <div class="suggest-section">
      <p>{t("didntFindHeart", lang)}</p>
      <Button
        variant="link"
        href="https://github.com/thomasahle/julehjerte/issues/new?title=Heart%20suggestion&body=%23%23%20Heart%20Design%20Suggestion%0A%0A**Name%3A**%20%0A**Description%3A**%20%0A**Grid%20size%3A**%20%0A%0A**Reference%20image%20or%20description%3A**%0A%0A%3C!--%20Please%20attach%20an%20image%20or%20describe%20the%20pattern%20--%3E"
        target="_blank"
        class="gap-1"
      >
        {t("suggestHeart", lang)}
        <ExternalLinkIcon class="size-3" />
      </Button>
    </div>
  {/if}

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
</div>

<style>
  .gallery-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
    padding: 3rem 0 1rem 0;
  }

  header h1 {
    margin: 0;
    font-size: 3rem;
    font-weight: 600;
  }

  .site-title-link {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;
  }

  .site-title-link:hover {
    color: #cc0000;
  }

  header p {
    max-width: 700px;
    margin: 0.5rem auto 0;
    color: #555;
    font-size: 1.1rem;
    line-height: 1.6;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 90;
    pointer-events: none;
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1rem 0;
    background: rgba(170, 205, 216, 0.2);
    backdrop-filter: blur(4px);
  }

  .toolbar > :global(*) {
    pointer-events: auto;
  }

  .toolbar > :global(*) {
    pointer-events: auto;
  }

  .toolbar :global(button),
  .toolbar :global(a) {
    white-space: nowrap;
  }

  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #888;
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .category-section {
    max-width: 1000px;
    margin: 0 auto 2.5rem;
  }

  .category-section:first-of-type {
    margin-top: 0;
  }

  .category-header {
    color: #4a7c8a;
    font-size: 1rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 1rem 0;
    padding: 0.5rem 0;
    border-bottom: 2px solid #a3bfca;
  }

  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.5rem;
    padding-top: 35px; /* Space for selected heart handles */
  }

  .gallery.svg-renderer {
    gap: 1.5rem;
    padding-top: 0;
  }

  .skeleton-card {
    aspect-ratio: 1;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.06);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  .suggest-section {
    text-align: center;
    margin-top: 3rem;
    color: #666;
  }

  .suggest-section p {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 1000;
  }

  .modal {
    width: min(520px, 100%);
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }

  .modal h2 {
    margin: 0 0 0.5rem 0;
    color: #222;
  }

  .modal p {
    margin: 0.5rem 0;
    color: #555;
    line-height: 1.5;
  }

  .delete-heart-name {
    font-weight: 600;
    color: #222;
  }

  .delete-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  @media (max-width: 600px) {
    .gallery-page {
      padding: 0.75rem;
    }

    header h1 {
      font-size: 1.75rem;
    }

    .toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }

    .toolbar :global(a[data-slot="button"]) {
      width: 100%;
      justify-content: center;
    }

    .toolbar > div[role="group"] {
      display: flex;
      width: 100%;
    }

    /* First child might be a Tooltip wrapper, not the button directly */
    .toolbar > div[role="group"] > :global(:first-child) {
      flex: 1;
      display: flex;
    }

    .toolbar > div[role="group"] > :global(:first-child) :global(button) {
      flex: 1;
    }

    .gallery {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .gallery.svg-renderer {
      gap: 0.75rem;
    }
  }
</style>

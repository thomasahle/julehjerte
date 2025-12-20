<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import HeartCard from "$lib/components/HeartCard.svelte";
  import { getUserCollection, loadStaticHeartsIndex, loadStaticHeartById, type HeartCategoryWithMeta } from "$lib/stores/collection";
  import { downloadMultiPDF, type LayoutMode } from "$lib/pdf/template";
  import { SITE_TITLE, SITE_URL, SITE_DESCRIPTION } from "$lib/config";
  import {
    t,
    getLanguage,
    subscribeLanguage,
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
  let indexCategories = $state<IndexedCategory[]>([]);
  let loadedStaticHearts = $state<Record<string, HeartDesign>>({});
  let userHearts = $state<HeartDesign[]>([]);

  let selectedIds = $state<Set<string>>(new Set());
  let loadingIndex = $state(true);
  let loadingStatic = $state(true);
  let generating = $state(false);
  let pdfLayout = $state<LayoutMode>("medium");
  let lang = $state<Language>("da");
  let colors = $state<HeartColors>({ left: "#ffffff", right: "#cc0000" });

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
    window.history.replaceState({}, "", url.toString());
  }

  onMount(async () => {
    // Initialize language and colors
    lang = getLanguage();
    subscribeLanguage((l) => {
      lang = l;
    });
    colors = getColors();
    subscribeColors((c) => {
      colors = c;
    });

    // Load selections from URL first
    selectedIds = getSelectionsFromUrl();

    userHearts = getUserCollection();

    // Load index first so we can render progressively.
    indexCategories = await loadStaticHeartsIndex();
    loadingIndex = false;

    // Kick off heart loading in background; update UI as each heart arrives.
    const ids = indexCategories.flatMap((c) => c.hearts);
    loadingStatic = true;
    const loaded: Record<string, HeartDesign> = {};
    await Promise.allSettled(
      ids.map(async (id) => {
        const design = await loadStaticHeartById(id);
        if (!design) return;
        loaded[id] = design;
        loadedStaticHearts = { ...loaded };
      })
    );
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
    goto(`${base}/hjerte/${design.id}`);
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
  let remainingStatic = $derived.by(() => {
    const total = indexCategories.reduce((sum, c) => sum + c.hearts.length, 0);
    const loaded = Object.keys(loadedStaticHearts).length;
    return Math.max(0, total - loaded);
  });
</script>

<svelte:head>
  <title>{SITE_TITLE}</title>
  <meta name="description" content={SITE_DESCRIPTION} />
  <link rel="canonical" href={SITE_URL} />
  <meta property="og:url" content={SITE_URL} />
  <meta property="og:title" content={SITE_TITLE} />
  <meta property="og:description" content={SITE_DESCRIPTION} />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="gallery-page">
  <header>
    <h1>
      <a class="site-title-link" href="{base}/">{t("siteTitle", lang)}</a>
    </h1>
    <p>{t("siteDescription", lang)}</p>
  </header>

  <div class="toolbar">
    <Button href="{base}/editor" variant="destructive" class="shadow-s">
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

  {#if loadingIndex}
    <div class="loading">{t("loadingHearts", lang)}</div>
  {:else if allHearts.length === 0 && !loadingStatic}
    <div class="empty">
      <p>{t("noHeartsYet", lang)}</p>
      <p>{t("clickCreateNew", lang)}</p>
    </div>
  {:else}
    {#if loadingStatic && remainingStatic > 0}
      <div class="loading-inline">
        {t("loadingHearts", lang)} ({remainingStatic})
      </div>
    {/if}
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
                selected={selectedIds.has(design.id)}
                onSelect={handleSelect}
                onClick={handleClick}
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
  }

  header h1 {
    margin: 0;
    font-size: 2.5rem;
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
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .toolbar :global(button),
  .toolbar :global(a) {
    white-space: nowrap;
  }

  .loading,
  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #888;
  }

  .loading-inline {
    text-align: center;
    color: #666;
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
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

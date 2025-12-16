<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import HeartCard from "$lib/components/HeartCard.svelte";
  import { loadAllHearts } from "$lib/stores/collection";
  import { downloadMultiPDF, type LayoutMode } from "$lib/pdf/template";
  import { SITE_TITLE, SITE_URL, SITE_DESCRIPTION } from "$lib/config";
  import {
    t,
    getLanguage,
    setLanguage,
    subscribeLanguage,
    type Language,
  } from "$lib/i18n";
  import {
    getColors,
    setLeftColor,
    setRightColor,
    subscribeColors,
    type HeartColors,
  } from "$lib/stores/colors";
  import type { HeartDesign } from "$lib/types/heart";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import GitHubStarsButton from "$lib/components/GitHubStarsButton.svelte";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  // Layout options for PDF generation
  const LAYOUT_OPTIONS: {
    value: LayoutMode;
    labelKey: "layoutSmall" | "layoutMedium" | "layoutLarge";
  }[] = [
    { value: "small", labelKey: "layoutSmall" },
    { value: "medium", labelKey: "layoutMedium" },
    { value: "large", labelKey: "layoutLarge" },
  ];

  let hearts = $state<(HeartDesign & { isUserCreated?: boolean })[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let loading = $state(true);
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
    hearts = await loadAllHearts();
    loading = false;
  });

  function toggleLanguage() {
    const newLang = lang === "da" ? "en" : "da";
    setLanguage(newLang);
    lang = newLang;
  }

  function handleSelect(design: HeartDesign) {
    const newSet = new Set(selectedIds);
    if (newSet.has(design.id)) {
      newSet.delete(design.id);
    } else {
      newSet.add(design.id);
    }
    selectedIds = newSet;
    updateUrlWithSelections(newSet);
  }

  function handleClick(design: HeartDesign) {
    goto(`${base}/hjerte/${design.id}`);
  }

  async function handlePrintSelected() {
    const selected = hearts.filter((h) => selectedIds.has(h.id));
    if (selected.length > 0) {
      generating = true;
      try {
        await downloadMultiPDF(selected, { layout: pdfLayout });
      } finally {
        generating = false;
      }
    }
  }

  let selectedCount = $derived(selectedIds.size);
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
    <Button href="{base}/editor" variant="destructive">
      {t("createNewHeart", lang)}
    </Button>
    <div class="inline-flex rounded-md shadow-xs" role="group">
      <Button
        variant="secondary"
        class="rounded-r-none border-r-0"
        onclick={handlePrintSelected}
        disabled={selectedCount === 0 || generating}
      >
        {generating
          ? t("generating", lang)
          : `${t("printSelected", lang)} (${selectedCount})`}
      </Button>
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

  {#if loading}
    <div class="loading">{t("loadingHearts", lang)}</div>
  {:else if hearts.length === 0}
    <div class="empty">
      <p>{t("noHeartsYet", lang)}</p>
      <p>{t("clickCreateNew", lang)}</p>
    </div>
  {:else}
    <div class="gallery">
      {#each hearts as design (design.id)}
        <HeartCard
          {design}
          {colors}
          selected={selectedIds.has(design.id)}
          onSelect={handleSelect}
          onClick={handleClick}
        />
      {/each}
    </div>
  {/if}

  <footer class="page-footer">
    <div class="footer-controls">
      <div class="color-pickers">
        <label class="color-picker">
          <span class="color-label">{t("leftColor", lang)}</span>
          <input
            type="color"
            value={colors.left}
            oninput={(e) => setLeftColor((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="color-picker">
          <span class="color-label">{t("rightColor", lang)}</span>
          <input
            type="color"
            value={colors.right}
            oninput={(e) => setRightColor((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <button
        class="lang-toggle"
        onclick={toggleLanguage}
        title={lang === "da" ? "Switch to English" : "Skift til dansk"}
      >
        {lang === "da" ? "🇬🇧 EN" : "🇩🇰 DA"}
      </button>
      <GitHubStarsButton repo="thomasahle/julehjerte" />
      <a
        href="https://github.com/thomasahle/julehjerte/issues/new?title=Heart%20suggestion&body=%23%23%20Heart%20Design%20Suggestion%0A%0A**Name%3A**%20%0A**Description%3A**%20%0A**Grid%20size%3A**%20%0A%0A**Reference%20image%20or%20description%3A**%0A%0A%3C!--%20Please%20attach%20an%20image%20or%20describe%20the%20pattern%20--%3E"
        class="suggest-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("suggestHeart", lang)}
      </a>
    </div>
  </footer>
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
    margin: 0.5rem 0 0 0;
    color: #555;
    font-size: 1.1rem;
  }

  .toolbar {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .loading,
  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #888;
  }

  .empty p {
    margin: 0.5rem 0;
  }

  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.5rem;
  }

  .page-footer {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .footer-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .color-pickers {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }

  .color-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .color-label {
    font-size: 0.85rem;
    color: #555;
  }

  .color-picker input[type="color"] {
    width: 32px;
    height: 32px;
    border: 2px solid white;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    padding: 0;
  }

  .color-picker input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker input[type="color"]::-webkit-color-swatch {
    border-radius: 3px;
    border: none;
  }

  .lang-toggle {
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .lang-toggle:hover {
    background: white;
  }

  .suggest-link {
    color: #666;
    font-size: 0.85rem;
    text-decoration: none;
    transition: color 0.2s;
  }

  .suggest-link:hover {
    color: #cc0000;
    text-decoration: underline;
  }

  @media (max-width: 600px) {
    .gallery-page {
      padding: 1rem;
    }

    header h1 {
      font-size: 1.75rem;
    }

    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .gallery {
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
  }
</style>

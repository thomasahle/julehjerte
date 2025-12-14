<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import HeartCard from '$lib/components/HeartCard.svelte';
  import { loadAllHearts } from '$lib/stores/collection';
  import { downloadMultiPDF } from '$lib/pdf/template';
  import { SITE_TITLE } from '$lib/config';
  import type { HeartDesign } from '$lib/types/heart';

  // Scale options: internal value 0.5 gives compact 2x2 layout (the "normal" 100%)
  const SCALE_OPTIONS = [
    { value: 0.5, label: '100%' },
    { value: 0.65, label: '130%' },
    { value: 0.75, label: '150%' },
    { value: 0.85, label: '170%' },
    { value: 1.0, label: '200%' }
  ];

  let hearts = $state<(HeartDesign & { isUserCreated?: boolean })[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let loading = $state(true);
  let generating = $state(false);
  let pdfScale = $state(0.5); // Default to 100% (compact 2x2 layout)
  let showSettings = $state(false);

  // Read selections from URL on mount
  function getSelectionsFromUrl(): Set<string> {
    if (!browser) return new Set();
    const params = new URLSearchParams(window.location.search);
    const selected = params.get('selected');
    if (selected) {
      return new Set(selected.split(',').filter(Boolean));
    }
    return new Set();
  }

  // Update URL with current selections (without adding to history)
  function updateUrlWithSelections(ids: Set<string>) {
    if (!browser) return;
    const url = new URL(window.location.href);
    if (ids.size > 0) {
      url.searchParams.set('selected', Array.from(ids).join(','));
    } else {
      url.searchParams.delete('selected');
    }
    window.history.replaceState({}, '', url.toString());
  }

  onMount(async () => {
    // Load selections from URL first
    selectedIds = getSelectionsFromUrl();
    hearts = await loadAllHearts();
    loading = false;
  });

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
        await downloadMultiPDF(selected, { scale: pdfScale });
      } finally {
        generating = false;
      }
    }
  }

  function toggleSettings() {
    showSettings = !showSettings;
  }

  let selectedCount = $derived(selectedIds.size);
  let currentScaleLabel = $derived(SCALE_OPTIONS.find(o => o.value === pdfScale)?.label ?? '85%');
</script>

<svelte:head>
  <title>{SITE_TITLE}</title>
</svelte:head>

<div class="gallery-page">
  <header>
    <h1>{SITE_TITLE}</h1>
    <p>Design your own Danish woven Christmas hearts</p>
  </header>

  <div class="toolbar">
    <a href="{base}/editor" class="btn primary">
      + Create New Heart
    </a>
    <div class="print-group">
      <button
        class="btn secondary"
        onclick={handlePrintSelected}
        disabled={selectedCount === 0 || generating}
      >
        {generating ? 'Generating...' : `Print Selected (${selectedCount})`}
      </button>
      <div class="settings-dropdown">
        <button class="btn settings-btn" onclick={toggleSettings} title="PDF Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        {#if showSettings}
          <div class="dropdown-menu">
            <div class="dropdown-header">PDF Template Scale</div>
            {#each SCALE_OPTIONS as option}
              <button
                class="dropdown-item"
                class:active={pdfScale === option.value}
                onclick={() => { pdfScale = option.value; showSettings = false; }}
              >
                {option.label}
                {#if pdfScale === option.value}
                  <span class="check">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading hearts...</div>
  {:else if hearts.length === 0}
    <div class="empty">
      <p>No heart designs yet!</p>
      <p>Click "Create New Heart" to design your first heart.</p>
    </div>
  {:else}
    <div class="gallery">
      {#each hearts as design (design.id)}
        <HeartCard
          {design}
          selected={selectedIds.has(design.id)}
          onSelect={handleSelect}
          onClick={handleClick}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    background: #aacdd8;
  }

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
    color: #111;
    font-size: 2.5rem;
    font-weight: 600;
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

  .print-group {
    display: flex;
    gap: 0;
  }

  .print-group .btn.secondary {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .settings-dropdown {
    position: relative;
  }

  .settings-btn {
    background: #555;
    color: white;
    padding: 0.75rem;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid #444;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-btn:hover {
    background: #666;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 160px;
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-header {
    padding: 0.75rem 1rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.6rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.95rem;
    color: #333;
    text-align: left;
  }

  .dropdown-item:hover {
    background: #f5f5f5;
  }

  .dropdown-item.active {
    background: #e8f4f8;
    color: #0066cc;
  }

  .dropdown-item .check {
    color: #0066cc;
    font-weight: bold;
  }

  .btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    text-decoration: none;
    transition: background 0.2s, opacity 0.2s;
  }

  .btn.primary {
    background: #cc0000;
    color: white;
  }

  .btn.primary:hover {
    background: #aa0000;
  }

  .btn.secondary {
    background: #333;
    color: white;
  }

  .btn.secondary:hover:not(:disabled) {
    background: #555;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

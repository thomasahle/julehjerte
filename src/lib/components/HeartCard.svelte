<script lang="ts">
  import type { HeartDesign } from "$lib/types/heart";
  import { t, type Language } from "$lib/i18n";
  import PaperHeartSVG from "$lib/components/PaperHeartSVG.svelte";
  import { onMount } from "svelte";
  import { makeHeartAnchorId } from "$lib/utils/heartAnchors";
  import { calculateDifficulty, type DifficultyLevel } from "$lib/utils/difficulty";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    design: HeartDesign & { isUserCreated?: boolean };
    selected?: boolean;
    lang: Language;
    onSelect?: (design: HeartDesign) => void;
    onClick?: (design: HeartDesign) => void;
    onDelete?: (design: HeartDesign) => void;
  }

  let { design, selected = false, lang, onSelect, onClick, onDelete }: Props = $props();
  let previewReady = $state(false);
  let previewEl: HTMLDivElement | null = null;
  let previewSize = $state(220);

  let difficulty = $derived(calculateDifficulty(design));

  function getDifficultyLabel(level: DifficultyLevel): string {
    const labels: Record<DifficultyLevel, 'difficultyEasy' | 'difficultyMedium' | 'difficultyHard' | 'difficultyExpert'> = {
      easy: 'difficultyEasy',
      medium: 'difficultyMedium',
      hard: 'difficultyHard',
      expert: 'difficultyExpert'
    };
    return t(labels[level], lang);
  }

  onMount(() => {
    if (!previewEl) return;

    const updateSize = () => {
      if (!previewEl) return;
      // Use offsetWidth instead of getBoundingClientRect to ignore CSS transforms (hover scale)
      // Cap at 400px max - gallery cards should never be larger than this
      const width = previewEl.offsetWidth;
      if (width > 0 && width <= 400) previewSize = width;
    };
    updateSize();
    requestAnimationFrame(updateSize);

    let resizeObserver: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(previewEl);
    }

    previewReady = true;
    return () => resizeObserver?.disconnect();
  });

  function handleDetails(e: MouseEvent) {
    e.stopPropagation();
    onClick?.(design);
  }

  function handleClick() {
    onSelect?.(design);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(design);
    }
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    onDelete?.(design);
  }
</script>

<div
  class="card"
  class:selected
  id={makeHeartAnchorId(design.id)}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  role="button"
  tabindex="0"
  aria-label="{design.name}{selected ? ` - ${t('selected', lang)}` : ''}"
>
  <div class="preview svg-renderer" bind:this={previewEl}>
    {#if previewReady}
      <PaperHeartSVG
        readonly
        idPrefix={"card-" + design.id}
        initialFingers={design.fingers}
        initialGridSize={design.gridSize}
        initialWeaveParity={design.weaveParity ?? 0}
        size={previewSize}
      />
    {:else}
      <div class="thumb-skeleton" aria-hidden="true"></div>
    {/if}
  </div>
  <div class="overlay">
    <div class="header-info">
      <span class="title">{design.name}</span>
      <span class="difficulty-tag">
        {getDifficultyLabel(difficulty.level)}
      </span>
    </div>
    <button class="details-btn" onclick={handleDetails}>
      {t('details', lang)}
    </button>
  </div>
  {#if selected}
    <div class="selected-badge">✓</div>
  {/if}
  {#if design.isUserCreated && onDelete}
    <button
      class="delete-btn"
      type="button"
      onclick={handleDelete}
      onkeydown={(e) => e.stopPropagation()}
      aria-label={t('delete', lang)}
      title={t('delete', lang)}
    >
      <Trash2Icon class="size-4" />
    </button>
  {/if}
</div>

<style>
  .card {
    position: relative;
    aspect-ratio: 1;
    background: transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.2s;
    overflow: visible; /* Allow SVG hearts to overflow when scaled */
  }


  .card:hover {
    transform: scale(1.02);
  }

  .card.selected {
    outline: 3px solid #cc0000;
    outline-offset: 2px;
    border-radius: 12px;
  }

  .preview {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    padding: 8px;
    pointer-events: none; /* Don't capture events from overflow area */
    overflow: visible; /* Allow SVG hearts to overflow when scaled */
  }

  .preview.svg-renderer {
    padding: 0;
  }

  .preview :global(canvas),
  .preview :global(svg) {
    filter: drop-shadow(0 4px 8px var(--shadow-color));
    transition: filter 0.2s;
  }

  .card:hover .preview :global(canvas),
  .card:hover .preview :global(svg) {
    filter: drop-shadow(0 6px 12px var(--shadow-color-hover));
  }

  .thumb-skeleton {
    width: 70%;
    height: 70%;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.7;
    }
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-end;
    padding: 0.75rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    border-radius: 12px;
  }

  .card:hover .overlay {
    opacity: 1;
    pointer-events: auto;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    align-items: flex-start;
  }

  .title {
    color: white;
    font-size: 1rem;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .difficulty-tag {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .details-btn {
    padding: 0.4rem 0.8rem;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .details-btn:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .selected-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 28px;
    height: 28px;
    background: #cc0000;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: bold;
  }

  .delete-btn {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    width: 28px;
    height: 28px;
    background: rgba(0, 0, 0, 0.55);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
  }

  .delete-btn:hover {
    background: rgba(204, 0, 0, 0.85);
    transform: scale(1.02);
  }

  .delete-btn:active {
    transform: scale(0.98);
  }

  .delete-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }
</style>

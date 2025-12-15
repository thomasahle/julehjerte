<script lang="ts">
  import type { HeartDesign } from "$lib/types/heart";
  import { t, getLanguage, subscribeLanguage, type Language } from "$lib/i18n";
  import type { HeartColors } from "$lib/stores/colors";
  import PaperHeart from "$lib/components/PaperHeart.svelte";
  import { onMount } from "svelte";

  interface Props {
    design: HeartDesign & { isUserCreated?: boolean };
    selected?: boolean;
    colors: HeartColors;
    onSelect?: (design: HeartDesign) => void;
    onClick?: (design: HeartDesign) => void;
  }

  let { design, selected = false, colors, onSelect, onClick }: Props = $props();
  let lang = $state<Language>('da');
  let previewReady = $state(false);
  let previewEl: HTMLDivElement | null = null;
  let previewSize = $state(220);

  $effect(() => {
    lang = getLanguage();
    const unsubscribe = subscribeLanguage((l) => { lang = l; });
    return unsubscribe;
  });

  onMount(() => {
    if (!previewEl) return;

    const updateSize = () => {
      if (!previewEl) return;
      const rect = previewEl.getBoundingClientRect();
      if (rect.width > 0) previewSize = Math.round(rect.width);
    };
    updateSize();
    requestAnimationFrame(updateSize);

    let resizeObserver: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(previewEl);
    }

    if (!('IntersectionObserver' in window)) {
      previewReady = true;
      return () => resizeObserver?.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          previewReady = true;
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(previewEl);
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
    };
  });

  function handleSelect(e: MouseEvent) {
    e.stopPropagation();
    onSelect?.(design);
  }

  function handleClick() {
    onClick?.(design);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(design);
    }
  }
</script>

<div
  class="card"
  class:selected
  onclick={handleClick}
  onkeydown={handleKeyDown}
  role="button"
  tabindex="0"
  aria-label="{design.name}{selected ? ` - ${t('selected', lang)}` : ''}"
>
  <div class="preview" bind:this={previewEl}>
    {#if previewReady}
      <PaperHeart
        readonly
        initialFingers={design.fingers}
        initialGridSize={design.gridSize}
        size={previewSize}
      />
    {:else}
      <div class="thumb-skeleton" aria-hidden="true"></div>
    {/if}
  </div>
  <div class="overlay">
    <span class="title">{design.name}</span>
    <button class="select-btn" onclick={handleSelect}>
      {selected ? t('selected', lang) : t('select', lang)}
    </button>
  </div>
  {#if selected}
    <div class="selected-badge">✓</div>
  {/if}
  {#if design.isUserCreated}
    <div class="custom-badge">★</div>
    <div class="custom-badge-hover">{t('private', lang)}</div>
  {/if}
</div>

<style>
  .card {
    position: relative;
    aspect-ratio: 1;
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .card:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .card.selected {
    box-shadow:
      0 0 0 3px #cc0000,
      0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .preview {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #bad4dc;
  }

  .thumb-skeleton {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #bad4dc 0%, #d6e6eb 50%, #bad4dc 100%);
    background-size: 200% 100%;
    animation: shimmer 1.2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .overlay {
    position: absolute;
    inset: 0;
    background: rgb(188 83 97 / 30%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .card:hover .overlay {
    opacity: 1;
  }

  .title {
    color: white;
    font-size: 1rem;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .select-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    padding: 0.4rem 0.8rem;
    background: #cc0000;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .select-btn:hover {
    background: #aa0000;
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

  .card:hover .selected-badge {
    display: none;
  }

  .custom-badge {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    width: 24px;
    height: 24px;
    background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
  }

  .custom-badge-hover {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    background: linear-gradient(135deg, #ffd700 0%, #ffb700 100%);
    color: #333;
    border-radius: 12px;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
    display: none;
  }

  .card:hover .custom-badge {
    display: none;
  }

  .card:hover .custom-badge-hover {
    display: block;
  }
</style>

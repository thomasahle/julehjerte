<script lang="ts">
  import type { HeartDesign } from "$lib/types/heart";
  import { base } from "$app/paths";
  import { t, type Language } from "$lib/i18n";
  import PaperHeartSVG from "$lib/components/PaperHeartSVG.svelte";
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

  // Intrinsic preview size; the SVG scales down with the card (max-width: 100%,
  // height: auto) and gallery cards are never wider than this.
  const PREVIEW_SIZE = 400;

  let difficulty = $derived(calculateDifficulty(design));
  // A real link so the detail pages are reachable from the prerendered gallery.
  let detailsHref = $derived(`${base}${lang === 'en' ? '/en' : ''}/hjerte/${design.id}/`);

  function getDifficultyLabel(level: DifficultyLevel): string {
    const labels: Record<DifficultyLevel, 'difficultyEasy' | 'difficultyMedium' | 'difficultyHard' | 'difficultyExpert'> = {
      easy: 'difficultyEasy',
      medium: 'difficultyMedium',
      hard: 'difficultyHard',
      expert: 'difficultyExpert'
    };
    return t(labels[level], lang);
  }

  function handleDetails() {
    onClick?.(design);
  }

  function handleSelect() {
    onSelect?.(design);
  }

  function handleDelete() {
    onDelete?.(design);
  }
</script>

<!--
  The card is a plain container; PDF selection is a real button and "Details" a
  real link (no nested interactive content inside a role="button"). The select
  button covers the whole card, the overlay sits on top of it and only its
  Details link takes pointer events, so clicks elsewhere still toggle selection.
-->
<div class="card" class:selected id={makeHeartAnchorId(design.id)}>
  <div class="preview svg-renderer">
    <PaperHeartSVG
      readonly
      idPrefix={"card-" + design.id}
      initialFingers={design.fingers}
      initialGridSize={design.gridSize}
      initialWeaveParity={design.weaveParity ?? 0}
      size={PREVIEW_SIZE}
    />
  </div>
  <button
    class="select-btn"
    type="button"
    onclick={handleSelect}
    aria-pressed={selected}
    aria-label="{t('selectForPdf', lang)}: {design.name}"
  ></button>
  <div class="overlay">
    <div class="header-info">
      <span class="title">{design.name}</span>
      <span class="difficulty-tag">
        {getDifficultyLabel(difficulty.level)}
      </span>
    </div>
    <a
      class="details-btn"
      href={detailsHref}
      onclick={handleDetails}
      aria-label="{t('details', lang)}: {design.name}"
    >
      {t('details', lang)}
    </a>
  </div>
  {#if selected}
    <div class="selected-badge" aria-hidden="true">✓</div>
  {/if}
  {#if design.isUserCreated && onDelete}
    <button
      class="delete-btn"
      type="button"
      onclick={handleDelete}
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

  /* Invisible button covering the card: toggles PDF selection */
  .select-btn {
    position: absolute;
    inset: 0;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 12px;
    cursor: pointer;
  }

  .select-btn:focus-visible {
    outline: 3px solid #4a7c8a;
    outline-offset: 2px;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 0.25rem;
    padding: 0.75rem;
    opacity: 0;
    overflow: hidden; /* Never let the overlay widen the page */
    pointer-events: none; /* Let clicks fall through to the select button */
    transition: opacity 0.2s;
    border-radius: 12px;
  }

  /* Visible on hover, while any control in the card has focus, and always on touch devices */
  .card:hover .overlay,
  .card:focus-within .overlay {
    opacity: 1;
  }

  @media (hover: none) {
    .overlay {
      opacity: 1;
    }
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    align-items: flex-start;
    min-width: 0;
  }

  .title {
    color: white;
    font-size: 1rem;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    overflow-wrap: anywhere;
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
    flex-shrink: 0;
    display: inline-block;
    text-decoration: none;
    padding: 0.4rem 0.8rem;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    pointer-events: auto;
    transition: background 0.2s;
  }

  .details-btn:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .details-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
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
    pointer-events: none;
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

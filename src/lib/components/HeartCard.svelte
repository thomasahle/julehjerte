<script lang="ts">
  import PaperHeart from "./PaperHeart.svelte";
  import type { HeartDesign } from "$lib/types/heart";

  interface Props {
    design: HeartDesign & { isUserCreated?: boolean };
    selected?: boolean;
    onSelect?: (design: HeartDesign) => void;
    onClick?: (design: HeartDesign) => void;
  }

  let { design, selected = false, onSelect, onClick }: Props = $props();

  function handleSelect(e: MouseEvent) {
    e.stopPropagation();
    onSelect?.(design);
  }

  function handleClick() {
    onClick?.(design);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="card" class:selected onclick={handleClick}>
  <div class="preview">
    <PaperHeart
      readonly={true}
      initialFingers={design.fingers}
      initialGridSize={design.gridSize}
      size={280}
    />
  </div>
  <div class="overlay">
    <span class="title">{design.name}</span>
    <button class="select-btn" onclick={handleSelect}>
      {selected ? "✓ Valgt" : "Vælg"}
    </button>
  </div>
  {#if selected}
    <div class="selected-badge">✓</div>
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
</style>

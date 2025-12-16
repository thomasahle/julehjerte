<script context="module" lang="ts">
  export type TriSwitchValue = 0 | 1 | 2;
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let value: TriSwitchValue = 0;
  export let options: readonly [string, string, string] = ['Off', 'Sym', 'Anti'];
  export let titles: readonly [string, string, string] | null = null;

  const dispatch = createEventDispatcher<{ change: TriSwitchValue }>();

  function set(next: TriSwitchValue) {
    if (next === value) return;
    value = next;
    dispatch('change', next);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      set(Math.max(0, value - 1) as TriSwitchValue);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      set(Math.min(2, value + 1) as TriSwitchValue);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      set(((value + 1) % 3) as TriSwitchValue);
    }
  }
</script>

<div class="tri-row">
  <span class="tri-label">{label}</span>
  <div
    class="tri-switch"
    role="radiogroup"
    aria-label={label}
    tabindex="0"
    onkeydown={onKeyDown}
  >
    <button
      type="button"
      role="radio"
      aria-checked={value === 0}
      aria-label={`${label}: ${options[0]}`}
      class:selected={value === 0}
      title={titles?.[0] ?? options[0]}
      onclick={() => set(0)}
    >
      {options[0]}
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={value === 1}
      aria-label={`${label}: ${options[1]}`}
      class:selected={value === 1}
      title={titles?.[1] ?? options[1]}
      onclick={() => set(1)}
    >
      {options[1]}
    </button>
    <button
      type="button"
      role="radio"
      aria-checked={value === 2}
      aria-label={`${label}: ${options[2]}`}
      class:selected={value === 2}
      title={titles?.[2] ?? options[2]}
      onclick={() => set(2)}
    >
      {options[2]}
    </button>
  </div>
</div>

<style>
  .tri-row {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .tri-label {
    color: #444;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .tri-switch {
    position: relative;
    display: inline-grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    align-items: center;
    width: 168px;
    height: 30px;
    padding: 2px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    background: rgba(0, 0, 0, 0.08);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
    user-select: none;
    outline: none;
  }

  .tri-switch:focus-visible {
    box-shadow:
      inset 0 1px 1px rgba(0, 0, 0, 0.05),
      0 0 0 3px rgba(204, 0, 0, 0.2);
  }

  button {
    appearance: none;
    background: transparent;
    border: 0;
    margin: 0;
    padding: 0;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.58);
    cursor: pointer;
    height: 100%;
    transition:
      background 140ms ease,
      color 140ms ease,
      box-shadow 140ms ease;
  }

  button.selected {
    color: rgba(0, 0, 0, 0.86);
    background: rgba(255, 255, 255, 0.92);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.18),
      inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  }

  button:focus-visible {
    outline: none;
  }
</style>

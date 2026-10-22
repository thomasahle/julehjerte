<!--
  A heart's size as buttons, n × n strips, the one it has pressed: in Tegn's Escher tab the pattern's
  (its tiles a cell of the n × n grid), in its Normal tab the heart's (`restripped`). `label`, when
  given, names the row above it, as the symmetry rows are named.
-->
<script lang="ts">
	interface Props {
		sizes: readonly number[];
		/** The size pressed, or null for none of them. */
		size: number | null;
		/** What the row is, for a screen reader, and above it where `label`. */
		name: string;
		label?: boolean;
		onSize: (n: number) => void;
		disabled?: boolean;
	}

	let { sizes, size, name, label = false, onSize, disabled = false }: Props = $props();
</script>

<div class="size-row">
	{#if label}<span class="size-label" aria-hidden="true">{name}</span>{/if}
	<div class="sizes" role="group" aria-label={name} style:--count={sizes.length}>
		{#each sizes as n (n)}
			<button type="button" class="size" class:active={size === n} aria-pressed={size === n} {disabled} onclick={() => onSize(n)}>{n} × {n}</button>
		{/each}
	</div>
</div>

<style>
	.size-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* As the symmetry rows' names (SymmetryRows). */
	.size-label {
		color: var(--ink);
		font-size: 14px;
	}

	.sizes {
		display: grid;
		grid-template-columns: repeat(var(--count), 1fr);
		gap: 4px;
	}

	.size {
		padding: 6px 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.size.active {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
</style>

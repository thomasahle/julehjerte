<!--
  The dice beside "Start forfra" in Tegn's Normal and Escher tabs: a random heart, or a random tile
  (docs/redesign/DESIGN.md §7). Fortryd brings the old one back. Looks as RestartButton does.
-->
<script lang="ts">
	import { DiceIcon } from '$lib/components/icons';

	let { label, title, onclick, disabled = false }: { label: string; title: string; onclick: () => void; disabled?: boolean } = $props();
</script>

<button type="button" class="random" {title} {disabled} {onclick}>
	<DiceIcon size={14} aria-hidden="true" />{label}
</button>

<style>
	.random {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--green);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
</style>

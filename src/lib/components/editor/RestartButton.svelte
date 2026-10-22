<!-- "Start forfra" in Tegn's Normal and Escher tabs: the heart, or the tile, drawn again as it starts. -->
<script lang="ts">
	import { RestartIcon } from '$lib/components/icons';

	let { label, title, onclick, disabled = false }: { label: string; title: string; onclick: () => void; disabled?: boolean } = $props();
</script>

<button type="button" class="restart" {title} {disabled} {onclick}>
	<RestartIcon size={14} />{label}
</button>

<style>
	.restart {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
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

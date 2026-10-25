<!--
  "Centrér" beside "Start forfra" in Tegn's Escher tab: the whole pattern moved to where the most of the
  heart is whole figures, in its middle ($lib/pattern/centre). Fortryd moves it back. Looks as
  RestartButton does.
-->
<script lang="ts">
	import { CentreIcon } from '$lib/components/icons';

	let { label, title, onclick, disabled = false }: { label: string; title: string; onclick: () => void; disabled?: boolean } = $props();
</script>

<button type="button" class="centre" {title} {disabled} {onclick}>
	<CentreIcon size={14} aria-hidden="true" />{label}
</button>

<style>
	.centre {
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

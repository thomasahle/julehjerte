<script lang="ts">
	import GeneratorPage from '$lib/pages/GeneratorPage.svelte';
	let { data } = $props();
</script>

<GeneratorPage lang="da" art={data.art} mode={data.mode} />

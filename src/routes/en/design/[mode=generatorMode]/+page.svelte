<script lang="ts">
	import GeneratorPage from '$lib/pages/GeneratorPage.svelte';
	let { data } = $props();
</script>

<GeneratorPage lang="en" art={data.art} mode={data.mode} />

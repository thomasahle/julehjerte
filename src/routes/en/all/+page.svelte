<script lang="ts">
	// The archive is a working tool, not a public page: it exists on the development server only.
	// The import sits behind import.meta.env.DEV so the built site carries neither the page nor its records.
	const page = import.meta.env.DEV ? import('$lib/pages/ArchivePage.svelte') : null;
</script>

{#if page}
	{#await page then { default: ArchivePage }}
		<ArchivePage lang="en" />
	{/await}
{/if}

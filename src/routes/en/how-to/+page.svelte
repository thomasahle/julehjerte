<!--
  /en/how-to/ — the English guide page. Danish original: /saadan-goer-du/.
  See src/routes/saadan-goer-du/+page.svelte.

  NB: there must never be a src/routes/en/+page.svelte — /en/ itself is served
  by the optional [[lang=lang]] parameter route.
-->
<script lang="ts">
	import HowToPage from '$lib/pages/HowToPage.svelte';
</script>

<HowToPage lang="en" />

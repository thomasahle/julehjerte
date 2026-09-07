<!--
  /saadan-goer-du/ — the Danish guide page. English mirror: /en/how-to/.

  This route sits outside src/routes/[[lang=lang]]/ because the two languages
  use different slugs, so the language is fixed here rather than read from a
  param. The URL pair lives in $lib/i18n/routes (ROUTES.howTo), which the
  language toggle, the hreflang tags and the sitemap all read.
-->
<script lang="ts">
	import HowToPage from '$lib/pages/HowToPage.svelte';
</script>

<HowToPage lang="da" />

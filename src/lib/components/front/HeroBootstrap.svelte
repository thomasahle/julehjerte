<!--
  The inline script that hangs the hero's hearts — see $lib/front/heroBootstrap
  for what it does and why it is a string.

  It belongs immediately after the gallery in the document: that is where the
  cards it copies the hearts from have just been parsed, and it still runs
  before any module script and before DOMContentLoaded.

  In the browser there is nothing to emit — the script has already run, or, on
  a client-side navigation, there is no prerendered gallery to copy from and the
  hero draws its own hearts. The `{@html}` block then claims the <script> the
  page came with instead of touching it (see CLAIM_PRERENDERED).
-->
<script lang="ts">
	import { CLAIM_PRERENDERED } from '$lib/front/galleryHearts';

	interface Props {
		/** The script's source. Null in the browser. */
		script: string | null;
	}

	let { script }: Props = $props();
</script>

<!-- svelte-ignore hydration_html_changed -->
{@html script ?? CLAIM_PRERENDERED}

<script lang="ts">
  // Only regenerated numeric geometry reaches this component, never uploaded SVG markup.
  let { svg, alt }: { svg: string; alt: string } = $props();
  let url = $state('');
  $effect(() => {
    const next = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    url = next;
    return () => URL.revokeObjectURL(next);
  });
</script>

{#if url}<img src={url} {alt} />{/if}

<style>
  img { display: block; width: 100%; max-height: 620px; object-fit: contain; border-radius: 12px; }
</style>

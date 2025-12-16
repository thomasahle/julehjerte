<script lang="ts">
  export let size = 16;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Smooth node: collinear handles, different lengths allowed -->
  <path d="M8 12 L20 12" />
  <circle cx="8" cy="12" r="1.4" />
  <circle cx="20" cy="12" r="1.4" />
  <rect x="10.5" y="10.5" width="3" height="3" transform="rotate(45 12 12)" />
</svg>

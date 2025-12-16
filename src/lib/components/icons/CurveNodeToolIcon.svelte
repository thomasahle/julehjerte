<script lang="ts">
  export let size = 16;
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <!-- Curve node (Inkscape-like: smooth node with pulled handles) -->
  <path d="M5 17 C8 7 16 7 19 17" />
  <path d="M8 12 L16 12" />
  <circle cx="8" cy="12" r="1.4" />
  <circle cx="16" cy="12" r="1.4" />
  <rect x="10.5" y="10.5" width="3" height="3" transform="rotate(45 12 12)" />
</svg>

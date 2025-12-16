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
  <!-- Curved segment (Inkscape-like: square nodes + visible handles) -->
  <path d="M6 16 C10 8 14 8 18 16" />
  <path d="M6 16 L9 10" />
  <path d="M18 16 L15 10" />
  <circle cx="9" cy="10" r="1.4" />
  <circle cx="15" cy="10" r="1.4" />
  <rect x="4.5" y="14.5" width="3" height="3" />
  <rect x="16.5" y="14.5" width="3" height="3" />
</svg>

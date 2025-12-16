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
  <!-- Symmetric node: collinear + equal handle lengths -->
  <path d="M6 12 L18 12" />
  <circle cx="6" cy="12" r="1.4" />
  <circle cx="18" cy="12" r="1.4" />
  <rect x="10.5" y="10.5" width="3" height="3" transform="rotate(45 12 12)" />
</svg>

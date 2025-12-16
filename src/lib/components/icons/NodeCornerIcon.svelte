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
  <!-- Cusp/corner node: independent handles -->
  <path d="M12 12 L7 7" />
  <path d="M12 12 L19 15" />
  <circle cx="7" cy="7" r="1.4" />
  <circle cx="19" cy="15" r="1.4" />
  <rect x="10.5" y="10.5" width="3" height="3" transform="rotate(45 12 12)" />
</svg>

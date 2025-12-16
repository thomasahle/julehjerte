<script lang="ts">
  import { onMount } from 'svelte';

  export let repo = 'thomasahle/julehjerte';
  export let href = `https://github.com/${repo}`;

  const cacheKey = () => `github-stars:${repo}`;
  const cacheTtlMs = 60 * 60 * 1000;

  let stars: number | null = null;

  function formatStars(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\\.0$/, '')}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\\.0$/, '')}k`;
    return String(n);
  }

  onMount(() => {
    if (typeof window === 'undefined') return;

    try {
      const cachedRaw = window.localStorage.getItem(cacheKey());
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { value?: unknown; ts?: unknown };
        if (typeof cached.value === 'number' && typeof cached.ts === 'number') {
          if (Date.now() - cached.ts < cacheTtlMs) {
            stars = cached.value;
            return;
          }
        }
      }
    } catch {
      // Ignore cache errors.
    }

    void (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) return;
        const data = (await res.json()) as { stargazers_count?: unknown };
        if (typeof data.stargazers_count !== 'number') return;
        stars = data.stargazers_count;
        try {
          window.localStorage.setItem(cacheKey(), JSON.stringify({ value: stars, ts: Date.now() }));
        } catch {
          // Ignore cache errors.
        }
      } catch {
        // Ignore fetch errors.
      }
    })();
  });
</script>

<a class="github-btn" {href} target="_blank" rel="noopener noreferrer" title="View on GitHub">
  <svg class="github-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
  <span class="github-label">GitHub</span>
  <span class="stars" aria-label="GitHub stars">
    <svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
      />
    </svg>
    <span class="stars-count">{stars == null ? '—' : formatStars(stars)}</span>
  </span>
</a>

<style>
  .github-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 999px;
    border: 1px solid #ddd;
    background: rgba(255, 255, 255, 0.8);
    color: #222;
    text-decoration: none;
    font-size: 0.9rem;
    line-height: 1;
  }

  .github-btn:hover {
    background: rgba(255, 255, 255, 1);
    border-color: #ccc;
  }

  .github-icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }

  .github-label {
    font-weight: 600;
  }

  .stars {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding-left: 0.5rem;
    border-left: 1px solid rgba(0, 0, 0, 0.15);
    color: #444;
    font-variant-numeric: tabular-nums;
  }

  .star-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import GithubIcon from '@lucide/svelte/icons/github';
  import StarIcon from '@lucide/svelte/icons/star';

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

<Button
  variant="secondary"
  size="sm"
  {href}
  target="_blank"
  class="rounded-full gap-2"
>
  <GithubIcon class="size-4" />
  <span class="font-semibold">GitHub</span>
  <span class="flex items-center gap-1 pl-2 border-l border-border text-muted-foreground">
    <StarIcon class="size-3.5 fill-current" />
    <span class="tabular-nums">{stars == null ? '—' : formatStars(stars)}</span>
  </span>
</Button>

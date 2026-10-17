<!--
  A status page body (404 and the like): the big status number, a heading that says what is
  missing, one sentence, and the links that lead on.

  Shared by the generic error page (+error.svelte, e.g. /nope/) and the heart
  page when its id names no heart (/hjerte/nope/), so the two dead ends look
  and read the same. The number is decoration; the heading is the page's h1.
-->
<script lang="ts">
  interface Link {
    href: string;
    label: string;
  }

  interface Props {
    status: number;
    title: string;
    text: string;
    /** The first is the primary button, the rest ghost buttons beside it. */
    links: Link[];
  }

  let { status, title, text, links }: Props = $props();
</script>

<main class="error-page" id="main-content" tabindex="-1">
  <div class="error-content">
    <p class="error-code" aria-hidden="true">{status}</p>
    <h1 class="error-message">{title}</h1>
    <p class="error-description">{text}</p>
    <div class="error-links">
      {#each links as link, i (link.href)}
        <a href={link.href} class={['btn', i === 0 ? 'btn-primary' : 'btn-ghost']}>{link.label}</a>
      {/each}
    </div>
  </div>
</main>

<style>
  .error-page {
    /* The nav and the footer take the rest of the viewport. */
    min-height: 60vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .error-content {
    text-align: center;
    max-width: 400px;
  }

  .error-code {
    font-size: 8rem;
    font-weight: 700;
    margin: 0;
    color: var(--red);
    line-height: 1;
  }

  .error-message {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0.5rem 0 1rem;
    color: var(--deep);
  }

  .error-description {
    color: var(--muted);
    margin: 0 0 2rem;
  }

  .error-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
</style>

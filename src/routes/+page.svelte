<script lang="ts">
  import PaperHeart from '$lib/components/PaperHeart.svelte';
</script>

<svelte:head>
  <title>Julehjerter Designer</title>
</svelte:head>

<div class="app">
  <header>
    <h1>Julehjerter Designer</h1>
    <p>Design your own Danish woven Christmas hearts</p>
  </header>

  <main>
    <div class="canvas-section">
      <PaperHeart />
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background: #f0f0f0;
  }

  .app {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  header {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  header h1 {
    margin: 0;
    color: #cc0000;
    font-size: 2rem;
  }

  header p {
    margin: 0.5rem 0 0 0;
    color: #666;
  }

  main {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .canvas-section {
    flex: 1;
  }

  .sidebar {
    flex-shrink: 0;
  }

  @media (max-width: 800px) {
    main {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
    }
  }
</style>

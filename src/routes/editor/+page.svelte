<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { SITE_TITLE } from '$lib/config';
  import type { Finger, HeartDesign } from '$lib/types/heart';
  import { browser } from '$app/environment';

  // State for the loaded design
  let initialDesign = $state<HeartDesign | null>(null);
  let editingExisting = $state(false);
  let editorKey = $state(0); // Key to force PaperHeart remount

  let currentFingers: Finger[] = $state([]);
  let currentGridSize: number = $state(3);

  // Form fields
  let heartName = $state('My Heart');
  let authorName = $state('');
  let description = $state('');

  onMount(() => {
    // Read design from URL params
    const params = new URLSearchParams(window.location.search);
    const designData = params.get('design');
    if (designData) {
      try {
        const design = JSON.parse(decodeURIComponent(designData)) as HeartDesign;
        initialDesign = design;
        editingExisting = true;
        currentFingers = design.fingers;
        currentGridSize = design.gridSize;
        heartName = `${design.name} (Copy)`;
        authorName = design.author ?? '';
        description = design.description ?? '';
        // Force PaperHeart to remount with new data
        editorKey++;
      } catch (e) {
        console.error('Failed to parse design from URL', e);
      }
    }
  });

  function handleFingersChange(fingers: Finger[], gridSize: number) {
    currentFingers = fingers;
    currentGridSize = gridSize;
  }

  function generateId(): string {
    return `heart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createHeartDesign(): HeartDesign {
    return {
      id: generateId(),
      name: heartName,
      author: authorName,
      description: description || undefined,
      gridSize: currentGridSize,
      fingers: currentFingers
    };
  }

  function downloadJSON() {
    const design = createHeartDesign();
    const json = JSON.stringify(design, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function showInGallery() {
    if (!browser) return;

    const design = createHeartDesign();
    const stored = localStorage.getItem('julehjerte-collection');
    const collection: HeartDesign[] = stored ? JSON.parse(stored) : [];

    collection.push(design);
    localStorage.setItem('julehjerte-collection', JSON.stringify(collection));

    // Navigate to gallery
    goto(`${base}/`);
  }

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const design = JSON.parse(e.target?.result as string) as HeartDesign;
        if (design.fingers && design.gridSize) {
          currentFingers = design.fingers;
          currentGridSize = design.gridSize;
          heartName = design.name || 'Imported Heart';
          authorName = design.author || '';
          description = design.description || '';
          // Trigger a re-render by navigating (simple approach)
          window.location.reload();
        }
      } catch (err) {
        alert('Invalid heart design file');
      }
    };
    reader.readAsText(file);
  }
</script>

<svelte:head>
  <title>Create Heart - {SITE_TITLE}</title>
</svelte:head>

<div class="editor">
  <header>
    <div class="header-content">
      <a href="{base}/" class="back-link">&larr; Back to Gallery</a>
      <h1>{editingExisting ? 'Edit Heart' : 'Create New Heart'}</h1>
    </div>
  </header>

  <div class="editor-layout">
    <main>
      {#key editorKey}
        <PaperHeart
          onFingersChange={handleFingersChange}
          initialGridSize={currentGridSize}
          initialFingers={initialDesign?.fingers}
        />
      {/key}
    </main>

    <aside class="sidebar">
      <div class="sidebar-section">
        <h3>Heart Details</h3>
        <div class="form-field">
          <label for="name">Name</label>
          <input id="name" type="text" bind:value={heartName} />
        </div>
        <div class="form-field">
          <label for="author">Author</label>
          <input id="author" type="text" bind:value={authorName} placeholder="Your name" />
        </div>
        <div class="form-field">
          <label for="desc">Description</label>
          <textarea id="desc" bind:value={description} rows="3" placeholder="Optional description..."></textarea>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>Actions</h3>
        <div class="action-buttons">
          <button class="btn primary full-width" onclick={showInGallery}>
            Show in Gallery
          </button>
          <button class="btn secondary full-width" onclick={downloadJSON}>
            Download JSON
          </button>
          <label class="btn secondary full-width import-btn">
            Import JSON
            <input type="file" accept=".json" onchange={handleImport} hidden />
          </label>
        </div>
      </div>
    </aside>
  </div>
</div>

<style>
  .editor {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1rem;
  }

  header {
    margin-bottom: 1rem;
  }

  .header-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .back-link {
    color: #666;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover {
    color: #cc0000;
  }

  h1 {
    margin: 0;
    color: #111;
    font-size: 1.75rem;
    font-weight: 600;
  }

  .editor-layout {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 1.5rem;
    align-items: start;
  }

  main {
    display: flex;
    justify-content: center;
  }

  .sidebar {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  }

  .sidebar-section {
    margin-bottom: 1.5rem;
  }

  .sidebar-section:last-child {
    margin-bottom: 0;
  }

  .sidebar-section h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
  }

  .form-field {
    margin-bottom: 0.75rem;
  }

  .form-field:last-child {
    margin-bottom: 0;
  }

  .form-field label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    font-size: 0.9rem;
    color: #555;
  }

  .form-field input,
  .form-field textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.95rem;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .form-field input:focus,
  .form-field textarea:focus {
    outline: none;
    border-color: #cc0000;
  }

  .form-field textarea {
    resize: vertical;
    min-height: 60px;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.6rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s, transform 0.1s;
    text-align: center;
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn.primary {
    background: #cc0000;
    color: white;
  }

  .btn.primary:hover {
    background: #aa0000;
  }

  .btn.secondary {
    background: #f0f0f0;
    color: #333;
  }

  .btn.secondary:hover {
    background: #e0e0e0;
  }

  .btn.full-width {
    width: 100%;
  }

  .import-btn {
    display: block;
    cursor: pointer;
  }

  @media (max-width: 900px) {
    .editor-layout {
      grid-template-columns: 1fr;
    }

    .sidebar {
      order: -1;
    }
  }
</style>

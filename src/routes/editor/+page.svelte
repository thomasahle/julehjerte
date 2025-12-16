<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { SITE_TITLE } from '$lib/config';
  import { t, getLanguage, setLanguage, subscribeLanguage, type Language } from '$lib/i18n';
  import { getColors, setLeftColor, setRightColor, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { saveUserDesign } from '$lib/stores/collection';
  import type { Finger, GridSize, HeartDesign } from '$lib/types/heart';
  import { traceHeartFromPng, type PngTemplateLayout } from '$lib/trace/templatePng';
  import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';
  import GitHubStarsButton from '$lib/components/GitHubStarsButton.svelte';
  import { browser } from '$app/environment';

  // Helper to parse design from URL - called once at initialization
  function getDesignFromUrl(): { design: HeartDesign | null; isEditMode: boolean } {
    if (!browser) return { design: null, isEditMode: false };
    const params = new URLSearchParams(window.location.search);
    const designData = params.get('design');
    const isEditMode = params.get('edit') === 'true';
    if (!designData) return { design: null, isEditMode: false };
    try {
      const decoded = JSON.parse(decodeURIComponent(designData)) as unknown;
      return { design: normalizeHeartDesign(decoded), isEditMode };
    } catch (e) {
      console.error('Failed to parse design from URL', e);
      return { design: null, isEditMode: false };
    }
  }

  // Parse URL design ONCE at module initialization time
  const { design: urlDesign, isEditMode: urlEditMode } = getDesignFromUrl();

  // State for the loaded design - initialize with URL values
  let initialDesign = $state<HeartDesign | null>(urlDesign);
  let editingExisting = $state(urlDesign !== null);
  let isEditMode = $state(urlEditMode); // true = editing custom heart, false = creating copy
  let editorKey = $state(0); // Key to force PaperHeart remount

  // Initialize fingers/gridSize with URL design if available
  let currentFingers: Finger[] = $state(urlDesign?.fingers ?? []);
  let currentGridSize: GridSize = $state(urlDesign?.gridSize ?? { x: 3, y: 3 });

  // Form fields - initialize with URL design if available
  let heartName = $state('');
  let authorName = $state(urlDesign?.author ?? '');
  let description = $state(urlDesign?.description ?? '');
  let lang = $state<Language>('da');
  let colors = $state<HeartColors>({ left: '#ffffff', right: '#cc0000' });

  // PNG import
  let showPngImport = $state(false);
  let pngFile = $state<File | null>(null);
  let pngPreviewUrl = $state<string | null>(null);
  let pngGridSize = $state(4);
  let pngLayout = $state<PngTemplateLayout>('double');
  let pngSwapHalves = $state(false);
  let pngTracing = $state(false);

  onMount(() => {
    // Initialize language
    lang = getLanguage();
    subscribeLanguage((l) => { lang = l; });

    // Initialize colors
    colors = getColors();
    subscribeColors((c) => { colors = c; });

    // Set heart name (needs lang to be initialized)
    if (urlDesign) {
      // In edit mode, keep original name; in copy mode, append "(Copy)"
      heartName = isEditMode ? urlDesign.name : `${urlDesign.name} ${t('copy', lang)}`;
    } else if (!heartName) {
      heartName = t('myHeart', lang);
    }
  });

  function toggleLanguage() {
    const newLang = lang === 'da' ? 'en' : 'da';
    setLanguage(newLang);
    lang = newLang;
  }

  function handleFingersChange(fingers: Finger[], gridSize: GridSize) {
    currentFingers = fingers;
    currentGridSize = gridSize;
  }

  function generateId(): string {
    return `heart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createHeartDesign(): HeartDesign {
    return {
      // In edit mode, keep the original ID; otherwise generate a new one
      id: isEditMode && initialDesign ? initialDesign.id : generateId(),
      name: heartName,
      author: authorName,
      description: description || undefined,
      gridSize: currentGridSize,
      fingers: currentFingers
    };
  }

  function downloadJSON() {
    const design = createHeartDesign();
    const json = JSON.stringify(serializeHeartDesign(design), null, 2);
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
    saveUserDesign(design);

    // Navigate to gallery
    goto(`${base}/`);
  }

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string) as unknown;
        const design = normalizeHeartDesign(raw);
        if (!design) throw new Error('Invalid design');

        currentFingers = design.fingers;
        currentGridSize = design.gridSize;
        heartName = design.name || t('importedHeart', lang);
        authorName = design.author || '';
        description = design.description || '';
        editingExisting = false;
        initialDesign = design;
        editorKey++;
      } catch {
        alert(t('invalidHeartFile', lang));
      }
    };
    reader.readAsText(file);
  }

  function handleImportPng(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
    pngFile = file;
    pngPreviewUrl = URL.createObjectURL(file);
    pngGridSize = Math.max(currentGridSize.x, currentGridSize.y) || 4;
    pngLayout = 'double';
    pngSwapHalves = false;
    showPngImport = true;
  }

  function closePngImport() {
    showPngImport = false;
    pngFile = null;
    if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
    pngPreviewUrl = null;
    pngTracing = false;
  }

  async function runPngTrace() {
    if (!pngFile) return;
    pngTracing = true;
    try {
      const traced = await traceHeartFromPng(pngFile, {
        gridSize: pngGridSize,
        layout: pngLayout,
        swapHalves: pngSwapHalves
      });

      currentFingers = traced.fingers;
      currentGridSize = { x: traced.gridSize, y: traced.gridSize };

      if (!heartName) heartName = t('importedHeart', lang);

      editingExisting = false;
      initialDesign = {
        id: '',
        name: heartName,
        author: authorName,
        description: description || undefined,
        gridSize: { x: traced.gridSize, y: traced.gridSize },
        fingers: traced.fingers
      };
      editorKey++;
      closePngImport();
    } catch (e) {
      console.error(e);
      alert(t('pngImportFailed', lang));
    } finally {
      pngTracing = false;
    }
  }
</script>

<svelte:head>
  <title>{editingExisting ? t('editHeart', lang) : t('createNewHeartTitle', lang)} - {SITE_TITLE}</title>
</svelte:head>

<div class="editor">
  <header>
    <div class="header-row">
      <a href="{base}/" class="back-link">{t('backToGallery', lang)}</a>
      <a href="{base}/" class="site-title">{t('siteTitle', lang)}</a>
    </div>
    <h1>{editingExisting ? t('editHeart', lang) : t('createNewHeartTitle', lang)}</h1>
  </header>

  <div class="editor-layout">
    <main>
      {#key editorKey}
        <PaperHeart
          onFingersChange={handleFingersChange}
          initialGridSize={currentGridSize}
          initialFingers={currentFingers}
        />
      {/key}
    </main>

    <aside class="sidebar">
      <div class="sidebar-section">
        <h3>{t('heartDetails', lang)}</h3>
        <div class="form-field">
          <label for="name">{t('name', lang)}</label>
          <input id="name" type="text" bind:value={heartName} />
        </div>
        <div class="form-field">
          <label for="author">{t('author', lang)}</label>
          <input id="author" type="text" bind:value={authorName} placeholder={t('yourName', lang)} />
        </div>
        <div class="form-field">
          <label for="desc">{t('description', lang)}</label>
          <textarea id="desc" bind:value={description} rows="3" placeholder={t('optionalDescription', lang)}></textarea>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>{t('actions', lang)}</h3>
        <div class="action-buttons">
          <button class="btn primary full-width" onclick={showInGallery}>
            {isEditMode ? t('saveChanges', lang) : t('showInGallery', lang)}
          </button>
          <button class="btn secondary full-width" onclick={downloadJSON}>
            {t('downloadJson', lang)}
          </button>
          <label class="btn secondary full-width import-btn">
            {t('importJson', lang)}
            <input type="file" accept=".json" onchange={handleImport} hidden />
          </label>
          <label class="btn secondary full-width import-btn">
            {t('importPng', lang)}
            <input type="file" accept="image/png" onchange={handleImportPng} hidden />
          </label>
        </div>
      </div>
    </aside>
  </div>

  {#if showPngImport}
    <div
      class="modal-overlay"
      onclick={closePngImport}
      onkeydown={(e) => e.key === 'Escape' && closePngImport()}
      role="presentation"
    >
      <div
        class="modal"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="png-import-title"
      >
        <h2 id="png-import-title">{t('importPng', lang)}</h2>
        <p class="modal-hint">{t('pngImportHint', lang)}</p>

        {#if pngPreviewUrl}
          <img class="png-preview" src={pngPreviewUrl} alt="PNG preview" />
        {/if}

        <div class="modal-row">
          <label>
            {t('gridSize', lang)}:
            <input type="number" min="2" max="8" bind:value={pngGridSize} />
          </label>
          <label class="checkbox">
            <input type="checkbox" bind:checked={pngSwapHalves} />
            {t('pngSwapHalves', lang)}
          </label>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={pngLayout === 'double'}
              onchange={(e) => (pngLayout = (e.target as HTMLInputElement).checked ? 'double' : 'single')}
            />
            {t('pngTwoHalves', lang)}
          </label>
        </div>

        <div class="modal-actions">
          <button class="btn secondary" onclick={closePngImport} disabled={pngTracing}>
            {t('cancel', lang)}
          </button>
          <button class="btn primary" onclick={runPngTrace} disabled={pngTracing || !pngFile}>
            {pngTracing ? t('pngTracing', lang) : t('pngTrace', lang)}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <footer class="page-footer">
    <div class="footer-controls">
      <div class="color-pickers">
        <label class="color-picker">
          <span class="color-label">{t('leftColor', lang)}</span>
          <input
            type="color"
            value={colors.left}
            oninput={(e) => setLeftColor((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="color-picker">
          <span class="color-label">{t('rightColor', lang)}</span>
          <input
            type="color"
            value={colors.right}
            oninput={(e) => setRightColor((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <button class="lang-toggle" onclick={toggleLanguage} title={lang === 'da' ? 'Switch to English' : 'Skift til dansk'}>
        {lang === 'da' ? '🇬🇧 EN' : '🇩🇰 DA'}
      </button>
      <GitHubStarsButton repo="thomasahle/julehjerte" />
    </div>
  </footer>
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

  .header-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .back-link {
    color: #666;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover {
    color: #cc0000;
  }

  .site-title {
    flex: 1;
    text-align: center;
    font-size: 1.25rem;
    font-weight: 600;
    color: #333;
    text-decoration: none;
    transition: color 0.2s;
  }

  .site-title:hover {
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

  .page-footer {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .footer-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .color-pickers {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }

  .color-picker {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .color-label {
    font-size: 0.85rem;
    color: #555;
  }

  .color-picker input[type='color'] {
    width: 32px;
    height: 32px;
    border: 2px solid white;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    padding: 0;
  }

  .color-picker input[type='color']::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker input[type='color']::-webkit-color-swatch {
    border-radius: 3px;
    border: none;
  }

  .lang-toggle {
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .lang-toggle:hover {
    background: white;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 1000;
  }

  .modal {
    width: min(900px, 100%);
    max-height: 90vh;
    overflow: auto;
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }

  .modal h2 {
    margin: 0 0 0.5rem 0;
    color: #222;
  }

  .modal-hint {
    margin: 0 0 1rem 0;
    color: #666;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .png-preview {
    width: 100%;
    height: auto;
    border-radius: 10px;
    border: 1px solid #eee;
    background: #fafafa;
  }

  .modal-row {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    margin-top: 1rem;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    user-select: none;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.25rem;
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

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { SITE_TITLE } from '$lib/config';
  import { t, tArray, getLanguage, setLanguage, subscribeLanguage, type Language } from '$lib/i18n';
  import { getColors, setLeftColor, setRightColor, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { saveUserDesign } from '$lib/stores/collection';
  import type { Finger, GridSize, HeartDesign } from '$lib/types/heart';
  import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';
  import GitHubStarsButton from '$lib/components/GitHubStarsButton.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { browser } from '$app/environment';
  import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
  import XIcon from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Separator } from '$lib/components/ui/separator';

  // Help modal state
  let showHelp = $state(false);

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
  let currentWeaveParity: 0 | 1 = $state((urlDesign?.weaveParity ?? 0) as 0 | 1);

  // Form fields - initialize with URL design if available
  let heartName = $state('');
  let authorName = $state(urlDesign?.author ?? '');
  let description = $state(urlDesign?.description ?? '');
  let lang = $state<Language>('da');
  let colors = $state<HeartColors>({ left: '#ffffff', right: '#cc0000' });

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

  function handleFingersChange(fingers: Finger[], gridSize: GridSize, weaveParity: 0 | 1) {
    currentFingers = fingers;
    currentGridSize = gridSize;
    currentWeaveParity = weaveParity;
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
      weaveParity: currentWeaveParity,
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
        currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
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

</script>

<svelte:head>
  <title>{editingExisting ? t('editHeart', lang) : t('createNewHeartTitle', lang)} - {SITE_TITLE}</title>
</svelte:head>

<div class="editor">
  <PageHeader {lang}>
    <Button variant="ghost" size="icon" onclick={() => showHelp = true} aria-label={t('helpOpenAriaLabel', lang)}>
      <CircleHelpIcon size={20} />
    </Button>
  </PageHeader>

  <div class="editor-layout">
    <main>
      {#key editorKey}
        <PaperHeart
          onFingersChange={handleFingersChange}
          initialGridSize={currentGridSize}
          initialFingers={currentFingers}
          initialWeaveParity={currentWeaveParity}
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
            {t('download', lang)}
          </button>
          <label class="btn secondary full-width import-btn">
            {t('import', lang)}
            <input type="file" accept=".json" onchange={handleImport} hidden />
          </label>
        </div>
      </div>
    </aside>
  </div>

  {#if showHelp}
    <div
      class="modal-overlay"
      onclick={() => showHelp = false}
      onkeydown={(e) => e.key === 'Escape' && (showHelp = false)}
      role="presentation"
    >
      <div
        class="modal help-modal"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <div class="help-header">
          <h2 id="help-title">{t('helpTitle', lang)}</h2>
          <button class="close-button" onclick={() => showHelp = false} aria-label={t('helpCloseAriaLabel', lang)}>
            <XIcon size={20} />
          </button>
        </div>
        <div class="help-content">
          <section>
            <h3>{t('helpSectionWhatAreTitle', lang)}</h3>
            <p>{@html t('helpSectionWhatAreText', lang)}</p>
          </section>

          <section>
            <h3>{t('helpSectionBasicStructureTitle', lang)}</h3>
            <p>{@html t('helpSectionBasicStructureText', lang)}</p>
          </section>

          <section>
            <h3>{t('helpSectionEditingCurvesTitle', lang)}</h3>
            <ul>
              {#each tArray('helpSectionEditingCurvesBullets', lang) as item}
                <li>{@html item}</li>
              {/each}
            </ul>
          </section>

          <section>
            <h3>{t('helpSectionSymmetryTitle', lang)}</h3>
            <p>{t('helpSectionSymmetryIntro', lang)}</p>
            <ul>
              {#each tArray('helpSectionSymmetryBullets', lang) as item}
                <li>{@html item}</li>
              {/each}
            </ul>
            <p>{@html t('helpSectionSymmetryNote', lang)}</p>
          </section>

          <section>
            <h3>{t('helpSectionRequirementsTitle', lang)}</h3>
            <p>{t('helpSectionRequirementsIntro', lang)}</p>
            <ul>
              {#each tArray('helpSectionRequirementsBullets', lang) as item}
                <li>{@html item}</li>
              {/each}
            </ul>
          </section>

          <section>
            <h3>{t('helpSectionTipsTitle', lang)}</h3>
            <ul>
              {#each tArray('helpSectionTipsBullets', lang) as item}
                <li>{item}</li>
              {/each}
            </ul>
          </section>
        </div>
      </div>
    </div>
  {/if}

  <footer class="page-footer">
    <Separator class="mb-4" />
    <div class="footer-controls">
      <div class="flex items-center gap-2">
        <Tooltip.Root>
          <Tooltip.Trigger>
            <label class="inline-flex size-8 rounded-full border shadow-xs cursor-pointer overflow-hidden">
              <input
                type="color"
                value={colors.left}
                oninput={(e) => setLeftColor((e.target as HTMLInputElement).value)}
                class="w-full h-full border-0 cursor-pointer scale-150"
              />
            </label>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{t('leftColor', lang)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            <label class="inline-flex size-8 rounded-full border shadow-xs cursor-pointer overflow-hidden">
              <input
                type="color"
                value={colors.right}
                oninput={(e) => setRightColor((e.target as HTMLInputElement).value)}
                class="w-full h-full border-0 cursor-pointer scale-150"
              />
            </label>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>{t('rightColor', lang)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onclick={toggleLanguage}
        title={lang === 'da' ? 'Switch to English' : 'Skift til dansk'}
        class="rounded-full"
      >
        {lang === 'da' ? '🇬🇧 EN' : '🇩🇰 DA'}
      </Button>
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

  .editor-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  main {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .sidebar {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 600px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .sidebar-section {
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
  }

  .footer-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
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

  @media (max-width: 600px) {
    .editor {
      padding: 0.5rem;
    }

    .sidebar {
      grid-template-columns: 1fr;
      max-width: 400px;
    }
  }

  .help-modal {
    max-width: 700px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 1rem;
    border-bottom: 1px solid #eee;
    margin-bottom: 1rem;
    flex-shrink: 0;
  }

  .help-header h2 {
    margin: 0;
    font-size: 1.4rem;
    color: #222;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: #f0f0f0;
    color: #333;
  }

  .help-content {
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .help-content section {
    margin-bottom: 1.5rem;
  }

  .help-content section:last-child {
    margin-bottom: 0;
  }

  .help-content h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #333;
  }

  .help-content p {
    margin: 0 0 0.75rem 0;
    line-height: 1.6;
    color: #555;
  }

  .help-content ul {
    margin: 0;
    padding-left: 1.25rem;
    line-height: 1.6;
    color: #555;
  }

  .help-content li {
    margin-bottom: 0.35rem;
  }

  .help-content :global(em) {
    color: #666;
  }

  .help-content :global(strong) {
    color: #333;
  }
</style>

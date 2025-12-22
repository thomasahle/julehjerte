<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { SITE_TITLE } from '$lib/config';
  import { t, tArray, getLanguage, subscribeLanguage, type Language } from '$lib/i18n';
  import { getColors, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { saveUserDesign } from '$lib/stores/collection';
  import type { Finger, GridSize, HeartDesign } from '$lib/types/heart';
  import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
  import { sanitizeHtml } from '$lib/utils';
  import { trackImportError } from '$lib/analytics';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { browser } from '$app/environment';
  import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
  import XIcon from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { tick } from 'svelte';
  import { makeHeartAnchorId } from '$lib/utils/heartAnchors';

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
  let editorEl: HTMLDivElement | null = $state(null);
  let draftId = $state<string | null>(null);
  let lastSavedSnapshot = $state<string | null>(null);
  let hasUnsavedChanges = $state(false);
  let beforeUnloadHandler: ((event: BeforeUnloadEvent) => void) | null = null;
  let skipNextPrompt = $state(false);

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

    if (!isEditMode && !draftId) {
      draftId = generateId();
    }
    lastSavedSnapshot = getDesignSnapshot();

    if (!editorEl) return;
    editorEl.addEventListener('click', handleEditorClick, true);

    let ro: ResizeObserver | null = null;
    let resizeListener: (() => void) | null = null;

    const updateHeaderHeightVar = async () => {
      await tick();
      const headerEl = editorEl?.querySelector(':scope > .page-header') as HTMLElement | null;
      if (!headerEl || !editorEl) return;
      const headerHeight = headerEl.getBoundingClientRect().height;
      editorEl.style.setProperty('--editor-header-height', `${Math.round(headerHeight)}px`);
    };

    updateHeaderHeightVar();

    const win = globalThis as unknown as Window;
    if ('ResizeObserver' in win) {
      ro = new ResizeObserver(() => {
        updateHeaderHeightVar();
      });
      const headerEl = editorEl.querySelector(':scope > .page-header') as HTMLElement | null;
      if (headerEl) ro.observe(headerEl);
    } else {
      resizeListener = () => updateHeaderHeightVar();
      win.addEventListener('resize', resizeListener, { passive: true });
    }

    return () => {
      ro?.disconnect();
      if (resizeListener) win.removeEventListener('resize', resizeListener);
      editorEl?.removeEventListener('click', handleEditorClick, true);
    };
  });

  $effect(() => {
    if (!browser || !lastSavedSnapshot) return;
    hasUnsavedChanges = getDesignSnapshot() !== lastSavedSnapshot;
  });

  function handleFingersChange(fingers: Finger[], gridSize: GridSize, weaveParity: 0 | 1) {
    currentFingers = fingers;
    currentGridSize = gridSize;
    currentWeaveParity = weaveParity;
  }

  function generateId(): string {
    return `heart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function getDesignId(): string {
    if (isEditMode && initialDesign) return initialDesign.id;
    if (!draftId) draftId = generateId();
    return draftId;
  }

  function createHeartDesign(): HeartDesign {
    return {
      // In edit mode, keep the original ID; otherwise generate a new one
      id: getDesignId(),
      name: sanitizeHtml(heartName),
      author: sanitizeHtml(authorName),
      authorUrl: initialDesign?.authorUrl,
      publisher: initialDesign?.publisher,
      publisherUrl: initialDesign?.publisherUrl,
      source: initialDesign?.source,
      date: initialDesign?.date,
      description: sanitizeHtml(description) || undefined,
      weaveParity: currentWeaveParity,
      gridSize: currentGridSize,
      fingers: currentFingers
    };
  }

  function getDesignSnapshot(): string {
    return JSON.stringify(serializeHeartDesign(createHeartDesign()));
  }

  function isDirty(): boolean {
    if (!lastSavedSnapshot) return false;
    return getDesignSnapshot() !== lastSavedSnapshot;
  }

  function shouldHandleBackClick(target: HTMLElement | null): boolean {
    if (!target) return false;
    const link = target.closest('a');
    if (!link) return false;
    const href = link.getAttribute('href') || '';
    const expectedHref = `${base}/`;
    return href === expectedHref || href === '/';
  }

  function handleEditorClick(event: MouseEvent) {
    if (!browser || !isDirty()) return;
    const target = event.target as HTMLElement | null;
    if (!shouldHandleBackClick(target)) return;
    event.preventDefault();
    const shouldSave = window.confirm(t('saveBeforeLeavePrompt', lang));
    if (shouldSave) {
      const design = createHeartDesign();
      saveUserDesign(design);
      lastSavedSnapshot = getDesignSnapshot();
      hasUnsavedChanges = false;
    }
    skipNextPrompt = true;
    goto(`${base}/`);
  }

  function downloadSVG() {
    const design = createHeartDesign();
    const svg = serializeHeartToSVG(design);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.name.toLowerCase().replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function showInGallery() {
    if (!browser) return;

    const design = createHeartDesign();
    saveUserDesign(design);
    lastSavedSnapshot = getDesignSnapshot();
    hasUnsavedChanges = false;

    // Navigate to gallery
    goto(`${base}/#${makeHeartAnchorId(design.id)}`);
  }

  function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const design = parseHeartFromSVG(content, file.name);

        if (!design) {
          trackImportError(file.name, 'No valid paths found in SVG');
          alert(t('invalidHeartFile', lang));
          return;
        }

        currentFingers = design.fingers;
        currentGridSize = design.gridSize;
        currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
        heartName = design.name || t('importedHeart', lang);
        authorName = design.author || '';
        description = design.description || '';
        editingExisting = false;
        initialDesign = design;
        draftId = generateId();
        lastSavedSnapshot = getDesignSnapshot();
        editorKey++;
      } catch (err) {
        trackImportError(file.name, err instanceof Error ? err.message : 'Unknown parse error');
        alert(t('invalidHeartFile', lang));
      }
    };
    reader.readAsText(file);
  }

  $effect(() => {
    if (!browser) return;
    beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  });

  beforeNavigate((navigation) => {
    if (!browser || !navigation) return;
    if (skipNextPrompt) {
      skipNextPrompt = false;
      return;
    }
    if (!isDirty()) return;
    const shouldSave = window.confirm(t('saveBeforeLeavePrompt', lang));
    if (shouldSave) {
      const design = createHeartDesign();
      saveUserDesign(design);
      lastSavedSnapshot = getDesignSnapshot();
      hasUnsavedChanges = false;
    }
  });

</script>

<svelte:head>
  <title>{editingExisting ? t('editHeart', lang) : t('createNewHeartTitle', lang)} - {SITE_TITLE}</title>
</svelte:head>

<div class="editor" bind:this={editorEl}>
  <PageHeader {lang}>
    <Button
      variant="ghost"
      size="icon"
      onclick={() => showHelp = true}
      aria-label={t('helpOpenAriaLabel', lang)}
    >
      <CircleHelpIcon size={20} />
    </Button>
  </PageHeader>

  <div class="editor-top">
    {#key editorKey}
      <PaperHeart
        fullPage
        draggableToolbars
        onFingersChange={handleFingersChange}
        initialGridSize={currentGridSize}
        initialFingers={currentFingers}
        initialWeaveParity={currentWeaveParity}
      />
    {/key}
  </div>

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
        <button class="btn secondary full-width" onclick={downloadSVG}>
          {t('download', lang)}
        </button>
        <label class="btn secondary full-width import-btn">
          {t('import', lang)}
          <input type="file" accept=".svg" onchange={handleImport} hidden />
        </label>
      </div>
    </div>
  </aside>

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
</div>

<style>
  .editor {
    position: relative;
    z-index: 1;
    padding: 0;
    padding-bottom: 12rem;
    --editor-header-height: 56px;
  }

  .editor-top {
    height: calc(90dvh - var(--editor-header-height));
    min-height: 360px;
    display: flex;
    flex-direction: column;
  }

  .editor > :global(.page-header) {
    margin-bottom: 0;
  }

  .editor-top :global(.paper-heart.fullPage) {
    flex: 1 1 auto;
    min-height: 0;
  }

  .sidebar {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    width: min(760px, calc(100% - 2rem));
    margin: 1.5rem auto 2rem auto;
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

<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { SITE_TITLE } from '$lib/config';
  import { t, tArray, type Language } from '$lib/i18n';
  import { getColors, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { getUserCollection, loadStaticHeartById, saveUserDesign } from '$lib/stores/collection';
  import type { Finger, GridSize, HeartDesign } from '$lib/types/heart';
  import { normalizeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
  import { detectSymmetry } from '$lib/utils/symmetry';
  import { serializeTemplateToSVG, type TemplateLobe } from '$lib/utils/templateSvg';
  import { renderHeartSvgInline } from '$lib/rendering/heartSvg';
  import { downloadPDF } from '$lib/pdf/template';
  import { sanitizeHtml } from '$lib/utils';
  import { trackImportError } from '$lib/analytics';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { browser } from '$app/environment';
  import {
    CloseIcon,
    DownloadIcon,
    HelpIcon,
    PrinterIcon,
    SaveIcon,
    UploadIcon
  } from '$lib/components/icons';
  import { makeHeartAnchorId } from '$lib/utils/heartAnchors';

  // Help modal state
  let showHelp = $state(false);

  // Inline status/error message shown in the actions panel (replaces alert()).
  type StatusKey = 'save' | 'import' | 'load';
  let statusMessage = $state<{ key: StatusKey; kind: 'error' | 'info'; text: string } | null>(null);

  function showStatus(key: StatusKey, kind: 'error' | 'info', text: string): void {
    statusMessage = { key, kind, text };
  }

  function clearStatus(key?: StatusKey): void {
    if (key && statusMessage?.key !== key) return;
    statusMessage = null;
  }

  function isQuotaExceeded(err: unknown): boolean {
    if (!(err instanceof DOMException)) return false;
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );
  }

  function reportSaveError(err: unknown): void {
    console.error('Saving heart failed', err);
    showStatus('save', 'error', t(isQuotaExceeded(err) ? 'saveStorageFull' : 'saveFailed', lang));
  }

  // The editor accepts these URL inputs:
  //   /editor/?from=<gallery-id>   loads /hearts/<id>.svg (like the detail page) and edits a copy
  //   /editor/#design=<payload>    user-created heart; payload = encodeURIComponent(JSON.stringify(serializeHeartDesign(d)))
  //   /editor/?design=<payload>    legacy form of the same payload (kept so old links keep working)
  // edit=true and returnTo=detail are read from the query string (also accepted in the hash).
  function parseDesignPayload(raw: string): HeartDesign | null {
    // URLSearchParams has already percent-decoded once; fall back to a second decode for
    // links that were encoded twice.
    const candidates = [raw];
    try {
      candidates.push(decodeURIComponent(raw));
    } catch {
      // Not double-encoded.
    }
    for (const candidate of candidates) {
      try {
        const design = normalizeHeartDesign(JSON.parse(candidate) as unknown);
        if (design) return design;
      } catch {
        // Try the next candidate.
      }
    }
    console.error('Failed to parse design from URL');
    return null;
  }

  function getEditorUrlInput(): {
    design: HeartDesign | null;
    fromId: string | null;
    isEditMode: boolean;
    returnToDetail: boolean;
  } {
    if (!browser) return { design: null, fromId: null, isEditMode: false, returnToDetail: false };
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const get = (key: string) => query.get(key) ?? hash.get(key);
    const returnToDetail = get('returnTo') === 'detail';
    const designData = hash.get('design') ?? query.get('design');
    const design = designData ? parseDesignPayload(designData) : null;
    const rawFrom = design ? null : get('from');
    const fromId = rawFrom && /^[A-Za-z0-9_-]+$/.test(rawFrom) ? rawFrom : null;
    return { design, fromId, isEditMode: design !== null && get('edit') === 'true', returnToDetail };
  }

  // Parse URL inputs ONCE at module initialization time
  const {
    design: urlDesign,
    fromId: urlFromId,
    isEditMode: urlEditMode,
    returnToDetail: urlReturnToDetail
  } = getEditorUrlInput();

  // State for the loaded design - initialize with URL values
  let initialDesign = $state<HeartDesign | null>(urlDesign);
  let editingExisting = $state(urlDesign !== null);
  let isEditMode = $state(urlEditMode); // true = editing custom heart, false = creating copy
  let returnToDetail = $state(urlReturnToDetail);
  let editorKey = $state(0); // Key to force PaperHeart remount

  // Initialize fingers/gridSize with URL design if available
  let currentFingers: Finger[] = $state(urlDesign?.fingers ?? []);
  let currentGridSize: GridSize = $state(urlDesign?.gridSize ?? { x: 3, y: 3 });
  let currentWeaveParity: 0 | 1 = $state((urlDesign?.weaveParity ?? 0) as 0 | 1);

  // Form fields - initialize with URL design if available
  let heartName = $state('');
  let authorName = $state(urlDesign?.author ?? '');
  let description = $state(urlDesign?.description ?? '');
  let lang = $derived(($page.params.lang === 'en' ? 'en' : 'da') as Language);
  let langBase = $derived(`${base}${$page.params.lang ? `/${$page.params.lang}` : ''}`);
  let colors = $state<HeartColors>({ left: '#ffffff', right: 'rgb(185, 19, 19)' });
  let editorEl: HTMLDivElement | null = $state(null);
  let importInput: HTMLInputElement | null = $state(null);
  let draftId = $state<string | null>(null);
  let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let autosaveDirty = false;
  // Serialized design as first emitted by PaperHeart; used to tell real edits from the initial emission.
  let designBaseline: string | null = null;
  let hasDesignEdits = false;
  const AUTOSAVE_DEBOUNCE_MS = 600;

  // Below 900px the editor keeps its old stacked layout: the heart panels go under the
  // canvas instead of into PaperHeart's right-hand column (docs/redesign/DESIGN.md §7).
  // Same breakpoint PaperHeart uses; set in onMount so SSR and hydration agree.
  const NARROW_QUERY = '(max-width: 900px)';
  let isNarrow = $state(false);

  onMount(() => {
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

    if (urlFromId) {
      void loadDesignFromGallery(urlFromId);
    }
    if (!editorEl) return;

    let ro: ResizeObserver | null = null;
    let resizeListener: (() => void) | null = null;

    const updateHeaderHeightVar = async () => {
      await tick();
      const headerEl = editorEl?.querySelector(':scope > header') as HTMLElement | null;
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
      const headerEl = editorEl.querySelector(':scope > header') as HTMLElement | null;
      if (headerEl) ro.observe(headerEl);
    } else {
      resizeListener = () => updateHeaderHeightVar();
      win.addEventListener('resize', resizeListener, { passive: true });
    }

    return () => {
      ro?.disconnect();
      if (resizeListener) win.removeEventListener('resize', resizeListener);
    };
  });

  onMount(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => (isNarrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  function handleFingersChange(fingers: Finger[], gridSize: GridSize, weaveParity: 0 | 1) {
    currentFingers = fingers;
    currentGridSize = gridSize;
    currentWeaveParity = weaveParity;
    // PaperHeart emits once on mount (with reconciled boundary curves). That is not a
    // user edit, so only autosave once the design actually differs from that baseline.
    if (!hasDesignEdits) {
      const snapshot = JSON.stringify({ fingers, gridSize, weaveParity });
      if (designBaseline === null || snapshot === designBaseline) {
        designBaseline = snapshot;
        return;
      }
      hasDesignEdits = true;
    }
    scheduleAutosave();
  }

  // Reset the autosave baseline before remounting PaperHeart with a new design.
  function resetDesignBaseline(): void {
    designBaseline = null;
    hasDesignEdits = false;
  }

  // ?from=<gallery-id>: fetch the static heart and edit it as a copy (same flow as ?design= links).
  async function loadDesignFromGallery(id: string): Promise<void> {
    const design = await loadStaticHeartById(id);
    if (!design) {
      showStatus('load', 'error', t('heartNotFound', lang));
      return;
    }
    currentFingers = design.fingers;
    currentGridSize = design.gridSize;
    currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
    heartName = `${design.name} ${t('copy', lang)}`;
    authorName = design.author ?? '';
    description = design.description ?? '';
    editingExisting = true;
    isEditMode = false;
    initialDesign = design;
    resetDesignBaseline();
    editorKey++;
  }

  function generateId(): string {
    return `heart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function getDesignId(): string {
    if (isEditMode && initialDesign) return initialDesign.id;
    if (!draftId) draftId = generateId();
    return draftId;
  }

  function getBackDetailId(): string | null {
    if (isEditMode && initialDesign) return initialDesign.id;
    if (!draftId) return initialDesign?.id ?? null;
    const userHearts = getUserCollection();
    if (userHearts.some((h) => h.id === draftId)) return draftId;
    return initialDesign?.id ?? draftId;
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

  function flushAutosave(): void {
    if (!browser) return;
    if (!autosaveDirty) return;
    autosaveDirty = false;
    try {
      saveUserDesign(createHeartDesign());
      clearStatus('save');
    } catch (err) {
      autosaveDirty = true;
      reportSaveError(err);
    }
  }

  function scheduleAutosave(): void {
    if (!browser) return;
    autosaveDirty = true;
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => {
      autosaveTimeout = null;
      flushAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
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

  async function downloadTemplateSVG() {
    const design = createHeartDesign();
    const isSymmetric =
      design.gridSize.x === design.gridSize.y && detectSymmetry(design.fingers).mirrorSymmetry;
    const lobes: TemplateLobe[] = isSymmetric ? ['left'] : ['left', 'right'];
    const previewSvgs = lobes.map((lobe, index) =>
      renderHeartSvgInline(design, colors, {
        idPrefix: `template-preview-${design.id}-${lobe}-${index}`,
        outline: { color: '#111' }
      })
    );
    const svg = serializeTemplateToSVG(design, lobes, { previewSvgs });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.name.toLowerCase().replace(/\s+/g, '-')}-template.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Top bar: the A4 template as a PDF, the same generator the gallery and detail pages use.
  async function downloadTemplatePDF() {
    try {
      await downloadPDF(createHeartDesign(), { lang });
    } catch (err) {
      console.error('Generating the PDF failed', err);
    }
  }

  function showInGallery() {
    if (!browser) return;

    flushAutosave();

    const design = createHeartDesign();
    try {
      saveUserDesign(design);
      clearStatus('save');
    } catch (err) {
      reportSaveError(err);
      return;
    }

    // Navigate to gallery
    goto(`${langBase}/#${makeHeartAnchorId(design.id)}`);
  }

  function handleEditorBack(event: MouseEvent) {
    if (!returnToDetail) return;
    event.preventDefault();
    flushAutosave();
    const backId = getBackDetailId();
    if (!backId) return;
    goto(`${langBase}/hjerte/${backId}`);
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
          showStatus('import', 'error', t('invalidHeartFile', lang));
          return;
        }

        clearStatus('import');
        currentFingers = design.fingers;
        currentGridSize = design.gridSize;
        currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
        heartName = design.name || t('importedHeart', lang);
        authorName = design.author || '';
        description = design.description || '';
        editingExisting = false;
        isEditMode = false;
        initialDesign = design;
        draftId = generateId();
        resetDesignBaseline();
        editorKey++;
        scheduleAutosave();
      } catch (err) {
        trackImportError(file.name, err instanceof Error ? err.message : 'Unknown parse error');
        showStatus('import', 'error', t('invalidHeartFile', lang));
      }
    };
    reader.readAsText(file);
  }

  $effect(() => {
    if (!browser) return;
    const handler = () => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
        autosaveTimeout = null;
      }
      flushAutosave();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  beforeNavigate((navigation) => {
    if (!browser || !navigation) return;
    if (autosaveTimeout) {
      clearTimeout(autosaveTimeout);
      autosaveTimeout = null;
    }
    flushAutosave();
  });
</script>

<svelte:head>
  <title>{editingExisting ? t('editHeart', lang) : t('createNewHeartTitle', lang)} - {SITE_TITLE}</title>
</svelte:head>

<!--
  Hjertedetaljer + Handlinger. On desktop this snippet is handed to PaperHeart, which
  renders it at the bottom of the 340px panel so all five sections share one column and
  one "Skjul panel" control; below 900px the same snippet is rendered under the canvas.
  It is authored here, so the styles below reach it in both places.
-->
{#snippet heartPanels()}
  <section class="editor-panel">
    <h2 class="panel-title">{t('heartDetails', lang)}</h2>
    <label class="field" for="name">
      {t('name', lang)}
      <input
        id="name"
        name="heart-name"
        type="text"
        autocomplete="off"
        bind:value={heartName}
        oninput={scheduleAutosave}
      />
    </label>
    <label class="field" for="author">
      {t('author', lang)}
      <input
        id="author"
        name="author"
        type="text"
        autocomplete="name"
        bind:value={authorName}
        placeholder={t('yourName', lang)}
        oninput={scheduleAutosave}
      />
    </label>
    <label class="field" for="desc">
      {t('description', lang)}
      <textarea
        id="desc"
        name="description"
        autocomplete="off"
        bind:value={description}
        rows="3"
        placeholder={t('optionalDescription', lang)}
        oninput={scheduleAutosave}
      ></textarea>
    </label>
  </section>

  <section class="editor-panel">
    <h2 class="panel-title">{t('actions', lang)}</h2>
    {#if statusMessage}
      <div class={`status-message ${statusMessage.kind}`} role="alert">
        <span class="status-text">{statusMessage.text}</span>
        <button
          type="button"
          class="status-dismiss"
          onclick={() => clearStatus()}
          aria-label={t('dismissMessage', lang)}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    {/if}
    <div class="action-buttons">
      <button type="button" class="btn btn-ghost action" onclick={downloadSVG}>
        <DownloadIcon size={16} />
        {t('editorExportSvg', lang)}
      </button>
      <button type="button" class="btn btn-ghost action" onclick={() => importInput?.click()}>
        <UploadIcon size={16} />
        {t('editorImportSvg', lang)}
      </button>
      <input
        bind:this={importInput}
        id="import-svg"
        name="import-svg"
        type="file"
        accept=".svg"
        onchange={handleImport}
        hidden
      />
      <button type="button" class="btn btn-ghost action" onclick={downloadTemplateSVG}>
        <PrinterIcon size={16} />
        {t('downloadTemplate', lang)}
      </button>
    </div>
  </section>
{/snippet}

<div class="editor" bind:this={editorEl}>
  <!-- variant="editor" is the back-link + logo bar; the site nav links and the
       EN/GitHub pills belong on content pages, not in the full-screen tool. -->
  <PageHeader {lang} variant="editor" onBack={returnToDetail ? handleEditorBack : undefined} backHref={returnToDetail ? (getBackDetailId() ? `${langBase}/hjerte/${getBackDetailId()}/` : undefined) : undefined}>
    <button
      type="button"
      class="icon-button"
      onclick={() => showHelp = true}
      aria-label={t('helpOpenAriaLabel', lang)}
    >
      <HelpIcon size={20} />
    </button>
    <button
      type="button"
      class="btn btn-primary top-action"
      onclick={downloadTemplatePDF}
      title={t('editorDownloadPdf', lang)}
      aria-label={t('editorDownloadPdf', lang)}
    >
      <DownloadIcon size={18} />
      <span class="top-action-label">{t('editorDownloadPdf', lang)}</span>
    </button>
    <button
      type="button"
      class="btn btn-dark top-action"
      onclick={showInGallery}
      title={isEditMode ? t('saveChanges', lang) : t('saveToMyHearts', lang)}
      aria-label={isEditMode ? t('saveChanges', lang) : t('saveToMyHearts', lang)}
    >
      <SaveIcon size={18} />
      <span class="top-action-label">{t('editorSave', lang)}</span>
    </button>
  </PageHeader>

  <div class="editor-top">
    {#key editorKey}
      <PaperHeart
        {lang}
        fullPage
        onFingersChange={handleFingersChange}
        initialGridSize={currentGridSize}
        initialFingers={currentFingers}
        initialWeaveParity={currentWeaveParity}
        panelExtra={isNarrow ? undefined : heartPanels}
      />
    {/key}
  </div>

  {#if isNarrow}
    <aside class="sidebar">
      {@render heartPanels()}
    </aside>
  {/if}

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
          <button class="icon-button" onclick={() => showHelp = false} aria-label={t('helpCloseAriaLabel', lang)}>
            <CloseIcon size={20} />
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
    padding-bottom: 3rem;
    background: var(--page);
    --editor-header-height: var(--nav-height);
  }

  .editor-top {
    height: calc(90dvh - var(--editor-header-height));
    min-height: 360px;
    display: flex;
    flex-direction: column;
  }

  .editor > :global(header) {
    margin-bottom: 0;
  }

  .editor-top :global(.paper-heart.fullPage) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* Desktop: the tool fills the viewport, so the page itself never scrolls. */
  @media (min-width: 901px) {
    .editor {
      padding-bottom: 0;
    }

    .editor-top {
      height: calc(100dvh - var(--editor-header-height));
    }
  }

  /* Top bar (docs/redesign/DESIGN.md §7): Help, Download PDF, Gem. */
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex: none;
    border: 1.5px solid var(--line);
    border-radius: 10px;
    background: var(--white);
    color: var(--green);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .icon-button:hover {
    background: var(--cream2);
  }

  .top-action {
    height: 40px;
    padding: 0 16px;
  }

  /* Phones: the two actions become icon buttons so the bar still fits next to
     the back link and the wordmark. Their names live on aria-label/title. */
  @media (max-width: 599px) {
    .top-action {
      width: 40px;
      padding: 0;
    }

    .top-action-label {
      display: none;
    }
  }

  /*
    Panel chrome for the two sections above. PaperHeart declares the same rules
    `:global` inside its right-hand column; these cover the copy rendered under the
    canvas on phones (and keep the scoped classes here in use).
  */
  .editor-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--white);
    box-sizing: border-box;
  }

  .panel-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  .field input,
  .field textarea {
    width: 100%;
    height: 38px;
    padding: 8px 10px;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    background: var(--white);
    box-sizing: border-box;
    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    color: var(--ink);
    transition: border-color 0.15s;
  }

  .field textarea {
    height: 64px;
    min-height: 64px;
    resize: vertical;
  }

  .field input:focus,
  .field textarea:focus {
    border-color: var(--green);
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action {
    height: 40px;
    width: 100%;
    font-size: 14px;
  }

  .status-message {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
  }

  .status-message.error {
    background: #fdecec;
    border: 1px solid #f3b4b4;
    color: #8a1c1c;
  }

  .status-message.info {
    background: var(--cream2);
    border: 1px solid var(--line);
    color: var(--green);
  }

  .status-text {
    flex: 1 1 auto;
  }

  .status-dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    margin: -2px -4px 0 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .status-dismiss:hover {
    background: rgb(28 51 41 / 0.06);
  }

  /* Below 900px the panels sit under the canvas, as they always have. */
  .sidebar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    width: min(760px, calc(100% - 2rem));
    margin: 1.5rem auto 0 auto;
  }

  @media (max-width: 599px) {
    .sidebar {
      grid-template-columns: 1fr;
      max-width: 420px;
    }
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgb(28 51 41 / 0.45);
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
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 20px 50px rgb(28 51 41 / 0.25);
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
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  .help-header h2 {
    margin: 0;
    font-size: 22px;
    color: var(--deep);
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
    font-size: 17px;
    color: var(--deep);
  }

  .help-content p {
    margin: 0 0 0.75rem 0;
    line-height: 1.6;
    color: var(--ink);
  }

  .help-content ul {
    margin: 0;
    padding-left: 1.25rem;
    line-height: 1.6;
    color: var(--ink);
  }

  .help-content li {
    margin-bottom: 0.35rem;
  }

  .help-content :global(em) {
    color: var(--muted);
  }

  .help-content :global(strong) {
    color: var(--deep);
  }
</style>

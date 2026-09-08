<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { SITE_TITLE, SITE_TITLE_EN } from '$lib/config';
  import { t, tArray, type Language } from '$lib/i18n';
  import { DEFAULT_COLORS, getColors, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { getUserCollection, loadStaticHeartById, saveUserDesign } from '$lib/stores/collection';
  import {
    clearDraft,
    gallerySource,
    readDraft,
    writeDraft,
    type DraftSource,
    type EditorDraft
  } from '$lib/editor/draft';
  import type { Finger, GridSize, HeartDesign } from '$lib/types/heart';
  import { normalizeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
  import { detectSymmetry } from '$lib/utils/symmetry';
  import { serializeTemplateToSVG, type TemplateLobe } from '$lib/utils/templateSvg';
  import { renderHeartSvgInline } from '$lib/rendering/heartSvg';
  import { sanitizeHtml } from '$lib/utils';
  import { slugify } from '$lib/utils/slug';
  import { trackImportError } from '$lib/analytics';
  import CanvasBackdrop from '$lib/components/editor/CanvasBackdrop.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { browser } from '$app/environment';
  import {
    CloseIcon,
    DownloadIcon,
    HelpIcon,
    PaintbrushIcon,
    PrinterIcon,
    SaveIcon,
    UploadIcon
  } from '$lib/components/icons';
  import { NARROW_QUERY } from '$lib/breakpoints';
  import { heartHref, homeAnchorHref, href } from '$lib/i18n/routes';
  import { makeHeartAnchorId } from '$lib/utils/heartAnchors';

  // Help modal state. The dialog declares aria-modal, so it also has to behave
  // like one: focus moves in when it opens, Tab stays inside it, Escape closes
  // it, and focus returns to the button that opened it.
  let showHelp = $state(false);
  let helpButtonEl: HTMLButtonElement | null = $state(null);

  function openHelp(): void {
    showHelp = true;
  }

  function closeHelp(): void {
    if (!showHelp) return;
    showHelp = false;
    tick().then(() => helpButtonEl?.focus());
  }

  // "Mal på hjertet" and the confirmation it asks before replacing a mask that
  // has strokes on it. Same dialog rules as the help modal above.
  let showPaintConfirm = $state(false);
  let paintButtonEl: HTMLButtonElement | null = $state(null);
  let paintCancelButtonEl: HTMLButtonElement | null = $state(null);
  // The whole way over to Mal is lazy (see openInPaint), so on a cold cache the
  // press is a network round trip with nothing on screen to show for it. The
  // button is disabled meanwhile: it stops a second press from rasterising and
  // navigating a second time, and it is the only feedback the press has.
  let paintBusy = $state(false);

  // Inline status/error message shown in the actions panel (replaces alert()).
  type StatusKey = 'save' | 'import' | 'load' | 'pdf';
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
  //   /editor/?from=session        takes the heart Mal found out of the editor session (PAINT.md §3)
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
    fromSession: boolean;
    isEditMode: boolean;
    returnToDetail: boolean;
  } {
    if (!browser)
      return { design: null, fromId: null, fromSession: false, isEditMode: false, returnToDetail: false };
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const get = (key: string) => query.get(key) ?? hash.get(key);
    const returnToDetail = get('returnTo') === 'detail';
    const designData = hash.get('design') ?? query.get('design');
    const design = designData ? parseDesignPayload(designData) : null;
    const rawFrom = design ? null : get('from');
    // `session` is Mal handing over the heart it found: the design waits in the
    // editor session, not in the gallery, so it must not be looked up as an id.
    const fromSession = rawFrom === 'session';
    const fromId = !fromSession && rawFrom && /^[A-Za-z0-9_-]+$/.test(rawFrom) ? rawFrom : null;
    return {
      design,
      fromId,
      fromSession,
      isEditMode: design !== null && get('edit') === 'true',
      returnToDetail
    };
  }

  // Parse URL inputs ONCE at module initialization time
  const {
    design: urlDesign,
    fromId: urlFromId,
    fromSession: urlFromSession,
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
  // The site-wide pair, the colours this heart carries once the visitor has picked
  // any (docs/redesign/DESIGN.md §7), and what the heart is actually drawn in.
  let siteColors = $state<HeartColors>({ ...DEFAULT_COLORS });
  let designColors = $state<HeartColors | null>(urlDesign?.colors ?? null);
  let colors = $derived(designColors ?? siteColors);
  let editorEl: HTMLDivElement | null = $state(null);
  let headerEl: HTMLElement | null = $state(null);
  let importInput: HTMLInputElement | null = $state(null);
  let draftId = $state<string | null>(null);
  let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;
  let autosaveDirty = false;
  // Where autosave writes. Only a heart that is already in "Mine hjerter" goes
  // straight back into the collection; anything new (a blank editor, a copy of a
  // gallery heart, a shared link) is kept as the single editor draft until the
  // visitor presses "Gem", so a stray colour click leaves no card behind.
  let savesToCollection = $state(false);
  let draftSource = $state<DraftSource>(
    urlFromId ? gallerySource(urlFromId) : urlDesign ? 'shared' : 'blank'
  );
  // A draft found at mount, offered above the canvas until it is taken or dropped.
  let pendingDraft = $state<EditorDraft | null>(null);
  // Restoring a draft cancels whatever ?from= is still fetching or importing, so
  // neither the gallery heart nor Mal's can land on top of the restored one.
  let pendingLoadSuperseded = false;
  // Serialized design as first emitted by PaperHeart; used to tell real edits from the initial emission.
  let designBaseline: string | null = null;
  let hasDesignEdits = false;
  const AUTOSAVE_DEBOUNCE_MS = 600;

  // Below 900px the editor keeps its old stacked layout: the heart panels go under the
  // canvas instead of into PaperHeart's right-hand column (docs/redesign/DESIGN.md §7).
  // NARROW_QUERY is the same string PaperHeart and the stylesheets switch on; set in
  // onMount so SSR and hydration agree.
  let isNarrow = $state(false);

  // The page's own heading. The top bar is a back link, the wordmark and three
  // buttons, so the heading is visually hidden — but every other route has an
  // h1 and heading navigation should not start at the panel titles.
  let pageHeading = $derived(editingExisting ? t('editHeart', lang) : t('createNewHeartTitle', lang));

  onMount(() => {
    // Initialize colors
    siteColors = getColors();
    const unsubscribeColors = subscribeColors((c) => { siteColors = c; });

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

    // An existing heart is one that is already in "Mine hjerter". Only the detail
    // page of such a heart builds an ?edit=true link, but the collection is asked
    // as well: a hand-made link, or a heart deleted in another tab meanwhile,
    // must start a draft rather than resurrect a card.
    const editedId = isEditMode ? initialDesign?.id : undefined;
    savesToCollection = editedId ? getUserCollection().some((h) => h.id === editedId) : false;

    // Stored state is read after mount, never during render (see $lib/editor/draft).
    if (!savesToCollection) {
      pendingDraft = readDraft();
    }

    if (urlFromId) {
      void loadDesignFromGallery(urlFromId);
    } else if (urlFromSession) {
      // Its own docblock says a handoff that is not there leaves the blank editor
      // on screen, and that is the right answer — so a chunk that fails to load
      // gets the same treatment, logged rather than shown.
      void takePaintHandoff().catch((err) =>
        console.error('Taking the heart from Mal failed', err)
      );
    }
    if (!editorEl) return unsubscribeColors;

    let ro: ResizeObserver | null = null;
    let resizeListener: (() => void) | null = null;

    // The canvas fills the viewport minus the header, so the header's real
    // height becomes a custom property. headerEl is bound from <PageHeader>.
    const updateHeaderHeightVar = async () => {
      await tick();
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
      if (headerEl) ro.observe(headerEl);
    } else {
      resizeListener = () => updateHeaderHeightVar();
      win.addEventListener('resize', resizeListener, { passive: true });
    }

    return () => {
      unsubscribeColors();
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

  // Picking a colour is always a real edit, so it autosaves straight away — unlike
  // the geometry, which PaperHeart also emits once on mount.
  function handleColorsChange(next: HeartColors) {
    designColors = next;
    scheduleAutosave();
  }

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
    // The visitor restored a draft while this was loading: leave their heart alone.
    if (pendingLoadSuperseded) return;
    if (!design) {
      showStatus('load', 'error', t('heartNotFound', lang));
      return;
    }
    currentFingers = design.fingers;
    currentGridSize = design.gridSize;
    currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
    designColors = design.colors ?? null;
    heartName = `${design.name} ${t('copy', lang)}`;
    authorName = design.author ?? '';
    description = design.description ?? '';
    editingExisting = true;
    isEditMode = false;
    initialDesign = design;
    resetDesignBaseline();
    editorKey++;
  }

  /**
   * ?from=session: the heart Mal found, opened as a new unsaved heart.
   *
   * The session is loaded on demand rather than imported at the top of the file,
   * because it reaches the mask modules and those must stay out of the draw
   * page's bundle (PAINT.md §8). The handoff is taken exactly once, so a reload
   * of this URL finds nothing — and then the blank editor already on screen is
   * the right answer, not an error about a heart the visitor never asked for.
   */
  async function takePaintHandoff(): Promise<void> {
    const { takeHandoff } = await import('$lib/editor/session.svelte');
    const design = takeHandoff();
    if (!design || pendingLoadSuperseded) return;
    currentFingers = design.fingers;
    currentGridSize = design.gridSize;
    currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
    designColors = design.colors ?? null;
    // Mal names the heart after what the mask came from; a heart with no name is
    // still a new heart, so it gets the same name a blank editor would give it.
    heartName = design.name || t('myHeart', lang);
    authorName = design.author ?? '';
    description = design.description ?? '';
    editingExisting = false;
    isEditMode = false;
    initialDesign = design;
    draftId = generateId();
    // Like an imported SVG: a new heart that owns the draft from here on and
    // stays out of "Mine hjerter" until the visitor presses "Gem".
    savesToCollection = false;
    draftSource = 'paint';
    pendingDraft = null;
    resetDesignBaseline();
    editorKey++;
    scheduleAutosave();
  }

  /**
   * "Mal på hjertet": this heart as a mask, and over to Mal (PAINT.md §2).
   *
   * The rasteriser, the mask and the session are loaded here for the same reason
   * as above — a visitor who never presses the button never downloads them.
   */
  async function openInPaint(): Promise<void> {
    const [{ rasterizeDesign }, { detectSymmetry: detectMaskSymmetry }, { setMask }] =
      await Promise.all([
        import('$lib/paint/rasterize'),
        import('$lib/paint/symmetry'),
        import('$lib/editor/session.svelte')
      ]);
    const design = createHeartDesign();
    const mask = rasterizeDesign(design);
    // What the mask turns out to be symmetric under becomes both the setting Mal
    // paints under and the "fundet" tags on its rows (PAINT.md §5).
    const found = detectMaskSymmetry(mask);
    setMask(mask, { sourceName: design.name, symmetry: found, found });
    await goto(href('paint', lang));
  }

  /**
   * Say that the way into Mal did not work.
   *
   * Everything openInPaint needs is fetched at the moment of the press, and on a
   * prerendered site those requests are the ones that fail: a redeploy makes the
   * loaded build's chunk hashes 404, and an offline tab fails identically. Without
   * this the rejection reaches nobody — the URL does not change, the panel stays
   * empty and only the console knows — so the press reads as a dead button.
   */
  function reportPaintError(err: unknown): void {
    console.error('Opening the heart in Mal failed', err);
    showStatus('load', 'error', t('paintOpenFailed', lang));
  }

  // A mask the visitor has painted on is work they may not want to lose; one that
  // only ever arrived from an import or an earlier heart is replaced in silence.
  async function paintOnHeart(): Promise<void> {
    if (paintBusy) return;
    paintBusy = true;
    try {
      const { session } = await import('$lib/editor/session.svelte');
      if (session.mask && session.maskDirty) {
        showPaintConfirm = true;
        return;
      }
      await openInPaint();
    } catch (err) {
      reportPaintError(err);
    } finally {
      paintBusy = false;
    }
  }

  function closePaintConfirm(): void {
    if (!showPaintConfirm) return;
    showPaintConfirm = false;
    tick().then(() => paintButtonEl?.focus());
  }

  function confirmPaintOnHeart(): void {
    showPaintConfirm = false;
    paintBusy = true;
    openInPaint()
      .catch(reportPaintError)
      .finally(() => {
        paintBusy = false;
      });
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
      // A heart keeps only the colours the visitor picked; one that was never
      // touched follows the site-wide pair, as the gallery hearts do.
      colors: designColors ?? undefined,
      gridSize: currentGridSize,
      fingers: currentFingers
    };
  }

  function flushAutosave(): void {
    if (!browser) return;
    if (!autosaveDirty) return;
    autosaveDirty = false;
    const design = createHeartDesign();
    if (!savesToCollection) {
      // Not saved yet: the work in progress goes to the draft, not to "Mine
      // hjerter". A failure there costs only persistence, so it stays silent —
      // unlike a failed save, which the visitor has asked for and must hear about.
      writeDraft({ design, source: draftSource, savedAt: Date.now() });
      return;
    }
    try {
      saveUserDesign(design);
      clearStatus('save');
    } catch (err) {
      autosaveDirty = true;
      reportSaveError(err);
    }
  }

  function clearAutosaveTimer(): void {
    if (!autosaveTimeout) return;
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
  }

  function scheduleAutosave(): void {
    if (!browser) return;
    autosaveDirty = true;
    clearAutosaveTimer();
    autosaveTimeout = setTimeout(() => {
      autosaveTimeout = null;
      flushAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // "Fortsæt": take the draft up where it was left, in place of whatever the URL
  // asked for. The heart keeps the draft's id, so pressing "Gem" saves one card.
  function continueDraft(): void {
    const draft = pendingDraft;
    pendingDraft = null;
    if (!draft) return;
    pendingLoadSuperseded = true;
    const design = draft.design;
    currentFingers = design.fingers;
    currentGridSize = design.gridSize;
    currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
    designColors = design.colors ?? null;
    heartName = design.name;
    authorName = design.author ?? '';
    description = design.description ?? '';
    draftId = design.id || generateId();
    draftSource = draft.source;
    isEditMode = false;
    initialDesign = design;
    resetDesignBaseline();
    editorKey++;
  }

  // "Start forfra": the draft is abandoned in favour of the heart on screen, which
  // becomes the draft itself as soon as it is edited.
  function discardDraft(): void {
    pendingDraft = null;
    clearDraft();
  }

  function downloadSVG() {
    const design = createHeartDesign();
    const svg = serializeHeartToSVG(design);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(design.name)}.svg`;
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
    a.download = `${slugify(design.name)}-template.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Top bar: the A4 template as a PDF, the same generator the gallery and detail pages use.
  // jsPDF is loaded on demand, so it stays out of the editor's initial bundle.
  async function downloadTemplatePDF() {
    try {
      const { downloadPDF } = await import('$lib/pdf/template');
      await downloadPDF(createHeartDesign(), { lang });
    } catch (err) {
      console.error('Generating the PDF failed', err);
      showStatus('pdf', 'error', t('pdfFailed', lang));
    }
  }

  function showInGallery() {
    if (!browser) return;

    // The save below writes exactly what the pending autosave would have.
    clearAutosaveTimer();
    autosaveDirty = false;

    const design = createHeartDesign();
    try {
      saveUserDesign(design);
      clearStatus('save');
    } catch (err) {
      reportSaveError(err);
      return;
    }

    // The heart is in "Mine hjerter" now, so it is an existing heart from here on
    // and autosaves; the draft that stood in for it has been spent.
    clearDraft();
    pendingDraft = null;
    savesToCollection = true;

    // Back where the visitor came from. Arriving from a heart's page via
    // "Rediger i editor" (?returnTo=detail), "Tilbage" returns to that heart —
    // so "Gem" must not throw them out to the front page instead.
    const backId = returnToDetail ? getBackDetailId() : null;
    goto(backId ? heartHref(backId, lang) : homeAnchorHref(makeHeartAnchorId(design.id), lang));
  }

  function handleEditorBack(event: MouseEvent) {
    if (!returnToDetail) return;
    event.preventDefault();
    flushAutosave();
    const backId = getBackDetailId();
    if (!backId) return;
    goto(heartHref(backId, lang));
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
        designColors = design.colors ?? null;
        heartName = design.name || t('importedHeart', lang);
        authorName = design.author || '';
        description = design.description || '';
        editingExisting = false;
        isEditMode = false;
        initialDesign = design;
        draftId = generateId();
        // An imported file is another new heart: it replaces the draft on the next
        // autosave, and it stays out of "Mine hjerter" until "Gem".
        savesToCollection = false;
        draftSource = 'import';
        pendingDraft = null;
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
      clearAutosaveTimer();
      flushAutosave();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  beforeNavigate((navigation) => {
    if (!browser || !navigation) return;
    clearAutosaveTimer();
    flushAutosave();
  });
</script>

<svelte:head>
  <title>{pageHeading} - {lang === 'en' ? SITE_TITLE_EN : SITE_TITLE}</title>
</svelte:head>

<!--
  Hjertedetaljer + Handlinger. On desktop this snippet is handed to PaperHeart, which
  renders it at the bottom of the floating 340px panel so all five sections share one column and
  one "Skjul panel" control; below 900px the same snippet is rendered under the canvas.
  It is authored here, so the styles below reach it in both places.
-->
<!--
  The draft prompt, handed to PaperHeart so it joins the stack of notices above the
  heart. PaperHeart supplies the notice box; only the row inside it is styled here.
-->
{#snippet draftNotice()}
  <div class="draft-notice">
    <span>{t('editorDraftPrompt', lang)}</span>
    <span class="draft-notice-actions">
      <button type="button" class="btn btn-sm btn-outline" onclick={continueDraft}>
        {t('editorDraftContinue', lang)}
      </button>
      <button type="button" class="btn btn-sm btn-ghost" onclick={discardDraft}>
        {t('editorDraftStartOver', lang)}
      </button>
    </span>
  </div>
{/snippet}

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
      <button
        type="button"
        class="btn btn-outline action"
        bind:this={paintButtonEl}
        onclick={paintOnHeart}
        disabled={paintBusy}
        aria-busy={paintBusy}
      >
        <PaintbrushIcon size={16} />
        {t('paintOnHeart', lang)}
      </button>
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
  <PageHeader bind:ref={headerEl} {lang} variant="editor" onBack={returnToDetail ? handleEditorBack : undefined} backHref={returnToDetail ? (getBackDetailId() ? heartHref(getBackDetailId()!, lang) : undefined) : undefined}>
    <button
      type="button"
      class="btn btn-sm btn-ghost btn-icon icon-button"
      bind:this={helpButtonEl}
      onclick={openHelp}
      aria-haspopup="dialog"
      aria-expanded={showHelp}
      aria-label={t('helpOpenAriaLabel', lang)}
    >
      <HelpIcon size={20} />
    </button>
    <button
      type="button"
      class="btn btn-sm btn-primary top-action"
      onclick={downloadTemplatePDF}
      title={t('editorDownloadPdf', lang)}
      aria-label={t('editorDownloadPdf', lang)}
    >
      <DownloadIcon size={18} />
      <span class="top-action-label">{t('editorDownloadPdf', lang)}</span>
    </button>
    <button
      type="button"
      class="btn btn-sm btn-dark top-action"
      onclick={showInGallery}
      title={isEditMode ? t('saveChanges', lang) : t('saveToMyHearts', lang)}
      aria-label={isEditMode ? t('saveChanges', lang) : t('saveToMyHearts', lang)}
    >
      <SaveIcon size={18} />
      <span class="top-action-label">{t('editorSave', lang)}</span>
    </button>
  </PageHeader>

  <main id="main-content" tabindex="-1">
  <h1 class="sr-only">{pageHeading}</h1>
  <div class="editor-top">
    <!-- The canvas' sky and landscape. It belongs to the page, not to the editor
         component: the drawing may be inlined only once per page, and this is the
         editor page's one copy (it has no <Scene>). Outside {#key}, so remounting
         the editor with another heart does not re-inline the drawing's ids. -->
    <CanvasBackdrop />
    {#key editorKey}
      <PaperHeart
        {lang}
        fullPage
        onFingersChange={handleFingersChange}
        onColorsChange={handleColorsChange}
        initialGridSize={currentGridSize}
        initialFingers={currentFingers}
        initialWeaveParity={currentWeaveParity}
        initialColors={designColors ?? undefined}
        panelExtra={isNarrow ? undefined : heartPanels}
        notice={pendingDraft ? draftNotice : undefined}
      />
    {/key}
  </div>

  {#if isNarrow}
    <aside class="sidebar">
      {@render heartPanels()}
    </aside>
  {/if}
  </main>

  <Modal
    open={showPaintConfirm}
    labelledBy="paint-confirm-title"
    initialFocus={paintCancelButtonEl}
    onClose={closePaintConfirm}
  >
    <h2 id="paint-confirm-title" class="confirm-title">{t('paintReplaceMaskTitle', lang)}</h2>
    <p class="confirm-text">{t('paintReplaceMaskPrompt', lang)}</p>
    <div class="confirm-actions">
      <button
        type="button"
        class="btn btn-ghost"
        bind:this={paintCancelButtonEl}
        onclick={closePaintConfirm}
      >
        {t('cancel', lang)}
      </button>
      <button type="button" class="btn btn-primary" onclick={confirmPaintOnHeart}>
        {t('paintReplaceMaskConfirm', lang)}
      </button>
    </div>
  </Modal>

  <Modal
    open={showHelp}
    labelledBy="help-title"
    width="min(700px, 100%)"
    maxHeight="85vh"
    column
    onClose={closeHelp}
  >
    <div class="help-header">
      <h2 id="help-title">{t('helpTitle', lang)}</h2>
      <button type="button" class="btn btn-sm btn-ghost btn-icon icon-button" onclick={closeHelp} aria-label={t('helpCloseAriaLabel', lang)}>
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
          {#each tArray('helpSectionEditingCurvesBullets', lang) as item, i (i)}
            <li>{@html item}</li>
          {/each}
        </ul>
      </section>

      <section>
        <h3>{t('helpSectionSymmetryTitle', lang)}</h3>
        <p>{t('helpSectionSymmetryIntro', lang)}</p>
        <ul>
          {#each tArray('helpSectionSymmetryBullets', lang) as item, i (i)}
            <li>{@html item}</li>
          {/each}
        </ul>
        <p>{@html t('helpSectionSymmetryNote', lang)}</p>
      </section>

      <section>
        <h3>{t('helpSectionRequirementsTitle', lang)}</h3>
        <p>{t('helpSectionRequirementsIntro', lang)}</p>
        <ul>
          {#each tArray('helpSectionRequirementsBullets', lang) as item, i (i)}
            <li>{@html item}</li>
          {/each}
        </ul>
      </section>

      <section>
        <h3>{t('helpSectionTipsTitle', lang)}</h3>
        <ul>
          {#each tArray('helpSectionTipsBullets', lang) as item, i (i)}
            <li>{item}</li>
          {/each}
        </ul>
      </section>
    </div>
  </Modal>
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

  /* position: relative so <CanvasBackdrop> can fill exactly this box — the canvas
     area and nothing else. */
  .editor-top {
    position: relative;
    height: calc(90dvh - var(--editor-header-height));
    min-height: 360px;
    display: flex;
    flex-direction: column;
  }

  .editor-top :global(.paper-heart.fullPage) {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* Desktop: the tool fills the viewport, so the page itself never scrolls. */
  @media (min-width: 900px) {
    .editor {
      padding-bottom: 0;
    }

    .editor-top {
      height: calc(100dvh - var(--editor-header-height));
    }
  }

  /* Top bar (docs/redesign/DESIGN.md §7): Help, Download PDF, Gem. The three
     are .btn-sm / .btn-icon; only the help button's white fill (it sits on the
     header's own background, not on the page) is left to say here. */
  .icon-button {
    flex: none;
    background: var(--white);
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

  /* The draft prompt inside PaperHeart's notice box: one quiet line, its two
     actions wrapping under the question when the canvas is narrow. */
  .draft-notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.75rem;
  }

  .draft-notice-actions {
    display: flex;
    flex: none;
    gap: 0.4rem;
  }

  /* .editor-panel and .panel-title come from src/app.css; .field is this
     route's own, for the Hjertedetaljer inputs. */
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
    background: var(--alert-bg);
    border: 1px solid var(--alert-border);
    color: var(--alert-ink);
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
    background: var(--hover-wash);
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

  /* The "Mal på hjertet" confirmation inside <Modal>: a question, one line of
     consequence, and the two answers right-aligned. */
  .confirm-title {
    margin: 0 0 8px;
    font-size: 20px;
    color: var(--deep);
  }

  .confirm-text {
    margin: 0;
    line-height: 1.5;
    color: var(--ink);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }

  /* <Modal> owns the scrim and the card; what follows is the help content. */
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

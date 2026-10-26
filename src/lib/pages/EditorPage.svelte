<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, goto, replaceState } from '$app/navigation';
  import { settleOverlayHistory } from '$lib/utils/overlayHistory';
  import { onMount, tick } from 'svelte';
  import PaperHeart from '$lib/components/PaperHeart.svelte';
  import { pageTitle } from '$lib/seo';
  import { langFromParam, t, tArray } from '$lib/i18n';
  import { toHexColors } from '$lib/utils/heartColors';
  import { DEFAULT_COLORS, DEFAULT_COLORS_HEX, getColors, subscribeColors, type HeartColors } from '$lib/stores/colors';
  import { getUserCollection, loadStaticHeartById, saveUserDesign } from '$lib/stores/collection';
  import {
    clearDraft,
    gallerySource,
    readDraft,
    writeDraft,
    type DraftSource,
    type EditorDraft
  } from '$lib/editor/draft';
  import { noteSaved } from '$lib/editor/savedNotice.svelte';
  import type { Finger, GridSize, HeartDesign, HeartPattern } from '$lib/types/heart';
  import { normalizeHeartDesign, parseHeartFromSVGWithReport, serializeHeartDesign } from '$lib/utils/heartDesign';
  import { heartName as nameIn } from '$lib/utils/heartName';
  import { importSummary } from '$lib/utils/svgImportSummary';
  import { downloadHeartSvg, downloadTemplateSvg } from '$lib/editor/svgDownloads';
  import { sanitizeHtml } from '$lib/utils';
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
  import { editorHref, generatorHref, homeAnchorHref, href } from '$lib/i18n/routes';
  import { takeHandoff } from '$lib/editor/handoff';
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
  // edit=true is read from the query string (also accepted in the hash): the heart is one of "Mine
  // hjerter", opened as it is saved there now (it autosaves), the payload standing in where it is not.
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

  /** `escher`: the page's own address opens Tegn on its Escher tab (`/editor/escher/`). */
  let { escher: escherPage = false }: { escher?: boolean } = $props();

  function getEditorUrlInput(): {
    design: HeartDesign | null;
    fromId: string | null;
    fromSession: boolean;
    isEditMode: boolean;
    escher: boolean;
  } {
    if (!browser) {
      return { design: null, fromId: null, fromSession: false, isEditMode: false, escher: false };
    }
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const get = (key: string) => query.get(key) ?? hash.get(key);
    const designData = hash.get('design') ?? query.get('design');
    const linked = designData ? parseDesignPayload(designData) : null;
    const saved = linked && get('edit') === 'true' ? getUserCollection().find((h) => h.id === linked.id) : undefined;
    const design = saved ?? linked;
    const rawFrom = design ? null : get('from');
    // `?from=session` is Mal handing over the heart Find snit found (PAINT.md
    // §3): the design waits in the editor session, not in the gallery, so it
    // must not be looked up as an id.
    const fromSession = rawFrom === 'session';
    const fromId = !fromSession && rawFrom && /^[A-Za-z0-9_-]+$/.test(rawFrom) ? rawFrom : null;
    return {
      design,
      fromId,
      fromSession,
      isEditMode: design !== null && get('edit') === 'true',
      // `/editor/escher/`, or an older link's `?tab=escher`, opens Tegn on that tab.
      escher: escherPage || get('tab') === 'escher'
    };
  }

  // Parse URL inputs ONCE at module initialization time
  const {
    design: urlDesignFromLink,
    fromId: urlFromId,
    fromSession: urlFromSession,
    isEditMode: urlEditMode,
    escher: urlEscher
  } = getEditorUrlInput();

  // The heart Mal found, taken exactly once, before the first render so the
  // editor never shows a blank heart it is about to replace. It arrives as a new
  // unsaved heart with its own name, so it goes down the same road as a shared
  // `#design=` link — only the naming and the draft below differ.
  //
  // `$lib/editor/handoff` is a module of its own for this one import: reaching
  // the session store from here would pull the mask and symmetry code into the
  // draw page's own bundle, which PAINT.md §8 forbids. Taking it empties the
  // slot for good, and there is nowhere to fetch this heart from again — so a
  // reload of ?from=session finds nothing, and the blank editor already on
  // screen is the right answer rather than an error about a heart nobody asked
  // for.
  const sessionDesign = urlFromSession ? takeHandoff() : null;
  const urlDesign = sessionDesign ?? urlDesignFromLink;

  // State for the loaded design - initialize with URL values
  let initialDesign = $state<HeartDesign | null>(urlDesign);
  // A shared link opens the heart it carries for editing; the heart Mal hands
  // over is a new unsaved one, so the page is "create", not "edit".
  let editingExisting = $state(urlDesignFromLink !== null);
  let isEditMode = $state(urlEditMode); // true = editing custom heart, false = creating copy
  let editorKey = $state(0); // Key to force PaperHeart remount

  // Initialize fingers/gridSize with URL design if available
  let currentFingers: Finger[] = $state(urlDesign?.fingers ?? []);
  let currentGridSize: GridSize = $state(urlDesign?.gridSize ?? { x: 3, y: 3 });
  let currentWeaveParity: 0 | 1 = $state((urlDesign?.weaveParity ?? 0) as 0 | 1);
  // The Escher tab's tile, while the cuts are its own (HeartDesign.pattern).
  let currentPattern: HeartPattern | undefined = $state(urlDesign?.pattern);

  // Form fields - initialize with URL design if available
  let heartName = $state('');
  let authorName = $state(urlDesign?.author ?? '');
  let description = $state(urlDesign?.description ?? '');
  let lang = $derived(langFromParam($page.params.lang));
  // Viewing colours come from the header's shared controls and never schedule an edit.
  let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
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
    urlFromSession ? 'paint' : urlFromId ? gallerySource(urlFromId) : urlDesign ? 'shared' : 'blank'
  );
  // A draft found at mount, offered above the canvas until it is taken or dropped.
  let pendingDraft = $state<EditorDraft | null>(null);
  // Restoring a draft cancels whatever ?from= is still fetching or importing, so
  // neither the gallery heart nor Mal's can land on top of the restored one.
  let pendingLoadSuperseded = false;
  // Serialized design as first emitted by PaperHeart; used to tell real edits from the initial emission.
  let designBaseline: string | null = null;
  let hasDesignEdits = false;
  // The cuts as last reported, so the same cuts again (an edit that moved nothing) are no edit.
  let lastCuts: string | null = null;
  // The visitor has typed in the heart's name, author or description since it opened.
  let fieldsEdited = false;
  // The heart came in as work that is in no collection: a restored draft, or the heart Mal found.
  let cameUnsaved = false;
  // Whether the heart holds work that is not in "Mine hjerter": a heart that is not
  // there yet (a new one, a copy, an import, Mal's) edited since it opened. "Gem"
  // wears a dot for it, as tiled.art turns its Save button red. A heart that is
  // there already saves its edits itself (autosave), so it has none unless that failed.
  let unsaved = $state(false);
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
  // What "Gem" says it does, on hover and to a screen reader: that the heart is not saved yet, while it is not.
  let saveLabel = $derived(unsaved ? t('saveNotYetSaved', lang) : isEditMode ? t('saveChanges', lang) : t('saveToMyHearts', lang));

  onMount(() => {
    // Initialize colors
    colors = getColors();
    const unsubscribeColors = subscribeColors((c) => { colors = c; });

    // Set heart name (needs lang to be initialized)
    if (sessionDesign) {
      // Not a copy of anything: Mal made this heart, and it is the visitor's own.
      // The name is Mal's to set, on the design it hands over: it is the side
      // that knows whether the mask came from star.png, a photo or the visitor's
      // own brush, and `cutGeometryToDesign` takes `name` from its caller for
      // exactly that (PAINT.md §3: "Stjerne fra billede" / "Heart from image").
      // Never `session.sourceName` — that is the file the mask came from, so
      // reading it here would make a Tegn → Mal → Tegn round trip rename the
      // heart after itself. The fallback is only for a design that reaches us
      // unnamed; then it is a new heart like any other.
      heartName = sessionDesign.name || t('myHeart', lang);
    } else if (urlDesign) {
      // In edit mode, keep original name; in copy mode, append "(Copy)"
      // A copy is named after the heart's name in this language ("Flet 1 kopi").
      heartName = isEditMode ? urlDesign.name : `${nameIn(urlDesign, lang)} ${t('copy', lang)}`;
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
    // Not for a heart handed over from Mal: the visitor asked for that one just
    // now, and offering to restore an older draft over it answers a question
    // they did not ask. It takes over the draft instead, as an imported SVG does.
    if (!savesToCollection && !sessionDesign) {
      pendingDraft = readDraft();
    }
    if (sessionDesign) {
      cameUnsaved = true;
      scheduleAutosave();
    }

    if (urlFromId) {
      void loadDesignFromGallery(urlFromId);
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

  function handleFingersChange(fingers: Finger[], gridSize: GridSize, weaveParity: 0 | 1, pattern: HeartPattern | null, isStart: () => boolean) {
    currentFingers = fingers;
    currentGridSize = gridSize;
    currentWeaveParity = weaveParity;
    // The tile alone is not an edit: it comes and goes with the tab, and is saved with the next change.
    currentPattern = pattern ?? undefined;
    // PaperHeart emits once on mount (with reconciled boundary curves). That is not a
    // user edit, so only autosave once the design actually differs from that baseline.
    const snapshot = JSON.stringify({ fingers, gridSize, weaveParity });
    if (snapshot === lastCuts) return;
    lastCuts = snapshot;
    if (!hasDesignEdits) {
      if (designBaseline === null || snapshot === designBaseline) {
        designBaseline = snapshot;
        return;
      }
      // Nor is an Escher type's start, which the tab draws itself as it opens: "Gem" gets no dot for it, and no
      // draft is kept of it.
      if (isStart()) return;
      hasDesignEdits = true;
    }
    scheduleAutosave();
    // Taken back (Fortryd) to the cuts it opened with, and nothing else changed: nothing to save.
    if (snapshot === designBaseline && !fieldsEdited && !cameUnsaved) unsaved = false;
  }

  /** The visitor typed in the name, author or description. */
  function editField(): void {
    fieldsEdited = true;
    scheduleAutosave();
  }

  // Reset the autosave baseline before remounting PaperHeart with a new design.
  function resetDesignBaseline(): void {
    designBaseline = null;
    hasDesignEdits = false;
    lastCuts = null;
    fieldsEdited = false;
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
    currentPattern = design.pattern;
    heartName = `${nameIn(design, lang)} ${t('copy', lang)}`;
    // The copy is the visitor's own heart: it is not by the gallery heart's author, nor described,
    // published or dated as that one is (user test, 2026-10-22: a copy saved as "af Thomas").
    authorName = '';
    description = '';
    editingExisting = true;
    isEditMode = false;
    initialDesign = {
      ...design,
      author: '',
      authorUrl: undefined,
      publisher: undefined,
      publisherUrl: undefined,
      source: undefined,
      date: undefined,
      description: undefined,
      descriptions: undefined
    };
    resetDesignBaseline();
    unsaved = false;
    editorKey++;
  }

  /**
   * "Mal på hjertet": this heart as a mask, and over to Mal (PAINT.md §2).
   *
   * The rasteriser, the mask and the session are loaded at the press rather than
   * imported at the top of the file: they are Mal's modules, and PAINT.md §8
   * keeps them out of the draw page's bundle. A visitor who never presses the
   * button never downloads them.
   */
  async function openInPaint(keepFound = false): Promise<void> {
    const [{ rasterizeDesign }, { detectSymmetry: detectMaskSymmetry }, { session, setMaskFromDraw }, { maskMismatch }] =
      await Promise.all([
        import('$lib/paint/rasterize'),
        import('$lib/paint/symmetry'),
        import('$lib/editor/session.svelte'),
        import('$lib/paint/mask')
      ]);
    const design = createHeartDesign();
    const mask = rasterizeDesign(design);
    // With `keepFound`, a heart that is still the one Find snit found weaves the
    // same picture: Mal opens as it was left, on that heart and the drawing it
    // was found for, rather than on the heart's own picture.
    if (keepFound && session.result &&
        maskMismatch(rasterizeDesign(session.result.design, mask.size).data, mask.data) === 0) {
      await goto(href('paint', lang));
      return;
    }
    // What the mask turns out to be symmetric under becomes both the setting Mal
    // paints under and the "fundet" tags on its rows (PAINT.md §5).
    const found = detectMaskSymmetry(mask);
    // sourceName says where the mask came from, which for a heart carried over from
    // Tegn is that heart. It is not a name for whatever Mal makes next: a heart Mal
    // hands back carries its own `name` (see `sessionDesign` above), so deriving one
    // from this would turn a Tegn → Mal → Tegn round trip into "Mit hjerte fra
    // billede".
    // What was painted in Mal comes back with its Fortryd.
    setMaskFromDraw(mask, { sourceName: design.name, symmetry: found, found });
    // The confirmation just closed; its history entry has to be off before
    // the navigation pushes one, or the back would land after it.
    await settleOverlayHistory();
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

  // The header's Mal tab: this heart over to Mal as "Mal på hjertet" takes it,
  // without the question, since Fortryd in Mal brings back what was painted
  // there; but a heart still as Find snit found it leaves Mal as it was.
  function switchToPaint(): void {
    if (paintBusy) return;
    paintBusy = true;
    openInPaint(true)
      .catch(reportPaintError)
      .finally(() => {
        paintBusy = false;
      });
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
      // The written paragraphs of a gallery heart (or an imported file) are not
      // edited here; they ride along so "Eksportér SVG" writes them back.
      descriptions: initialDesign?.descriptions,
      // The names per language ride along too, but only while the heart still
      // has its own name: a copy or a renamed heart is named once, by the visitor.
      names: initialDesign && sanitizeHtml(heartName) === initialDesign.name ? initialDesign.names : undefined,
      weaveParity: currentWeaveParity,
      // Preserve the appearance in exported files; site previews use the header's pair.
      colors: toHexColors(colors, DEFAULT_COLORS_HEX),
      gridSize: currentGridSize,
      overlapAspectRatio: initialDesign?.overlapAspectRatio,
      pattern: currentPattern,
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
      unsaved = true;
      reportSaveError(err);
    }
  }

  function clearAutosaveTimer(): void {
    if (!autosaveTimeout) return;
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
  }

  // A name the visitor has not typed (the default, a copy's, an import's, Mal's) is taken whole by the
  // click into the field, so what they type replaces it. Safari puts the caret where the click let go,
  // so that mouseup is kept back.
  let nameJustTaken = false;
  let nameTyped = false;
  function takeDefaultName(event: FocusEvent & { currentTarget: HTMLInputElement }): void {
    if (nameTyped) return;
    event.currentTarget.select();
    nameJustTaken = true;
  }
  function keepNameTaken(event: MouseEvent): void {
    if (nameJustTaken) event.preventDefault();
    nameJustTaken = false;
  }

  function scheduleAutosave(): void {
    if (!browser) return;
    autosaveDirty = true;
    if (!savesToCollection) unsaved = true;
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
    // The draft is work that never went into "Mine hjerter".
    unsaved = true;
    cameUnsaved = true;
    const design = draft.design;
    currentFingers = design.fingers;
    currentGridSize = design.gridSize;
    currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
    currentPattern = design.pattern;
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
    downloadHeartSvg(createHeartDesign());
  }

  function downloadTemplateSVG() {
    downloadTemplateSvg(createHeartDesign(), colors);
  }

  // Top bar: the templates as a PDF, as the gallery's and the heart page's download prints them.
  // jsPDF is loaded on demand, so it stays out of the editor's initial bundle.
  async function downloadTemplatePDF() {
    try {
      const { downloadDesignPDF } = await import('$lib/pdf/template');
      await downloadDesignPDF(createHeartDesign(), lang);
    } catch (err) {
      console.error('Generating the PDF failed', err);
      showStatus('pdf', 'error', t('pdfFailed', lang));
    }
  }

  /**
   * "Gem": the heart into "Mine hjerter", and the editor stays on it, saying so with a way to the heart's
   * card (user tests, 2026-10-20 to 22: every tester was thrown by "Gem" leaving the editor). From here it
   * is a heart of "Mine hjerter": it saves its own edits (autosave), and the page's address opens it
   * again (`?edit=true`), so a reload, or Back and Forward, finds it rather than a blank heart or a
   * second copy to save.
   */
  function save() {
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

    // The draft that stood in for it has been spent.
    clearDraft();
    pendingDraft = null;
    savesToCollection = true;
    unsaved = false;
    cameUnsaved = false;
    isEditMode = true;
    editingExisting = true;
    initialDesign = design;
    const payload = encodeURIComponent(JSON.stringify(serializeHeartDesign(design)));
    replaceState(editorHref(lang, `?edit=true#design=${payload}`), {});
    noteSaved(design.name || t('myHeart', lang), homeAnchorHref(makeHeartAnchorId(design.id), lang));
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
        const { design, report } = parseHeartFromSVGWithReport(content, file.name);

        if (!design) {
          trackImportError(file.name, 'No valid paths found in SVG');
          showStatus('import', 'error', t('invalidHeartFile', lang));
          return;
        }

        // What the importer made of the file, so the author sees it at once.
        showStatus('import', 'info', importSummary(design, report, lang).text);
        currentFingers = design.fingers;
        currentGridSize = design.gridSize;
        currentWeaveParity = (design.weaveParity ?? 0) as 0 | 1;
        currentPattern = design.pattern;
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
  <title>{pageTitle('editor', lang)}</title>
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
        onfocus={takeDefaultName}
        onmouseup={keepNameTaken}
        oninput={() => {
          nameTyped = true;
          editField();
        }}
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
        oninput={editField}
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
        oninput={editField}
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
  <!-- variant="editor" is the logo bar; the site nav links and the
       EN/GitHub pills belong on content pages, not in the full-screen tool. The
       `mode` switch is the other half of PAINT.md §2's ask of Tegn: with the
       paint route landed, the header carries the way back and forth. -->
  <PageHeader bind:ref={headerEl} {lang} variant="editor" mode={{ current: 'draw', switchTo: switchToPaint }}>
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
      onclick={save}
      title={saveLabel}
      aria-label={saveLabel}
    >
      <SaveIcon size={18} />
      <span class="top-action-label">{t('editorSave', lang)}</span>
      {#if unsaved}<span class="unsaved-dot" aria-hidden="true"></span>{/if}
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
        initialGridSize={currentGridSize}
        initialFingers={currentFingers}
        initialWeaveParity={currentWeaveParity}
        initialPattern={currentPattern}
        initialEscherTab={urlEscher}
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
        <h3>{t('helpSectionShortcutsTitle', lang)}</h3>
        <ul>
          {#each tArray('helpSectionShortcutsBullets', lang) as item, i (i)}
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
        <h3>{t('helpSectionEscherTitle', lang)}</h3>
        <ul>
          {#each tArray('helpSectionEscherBullets', lang) as item, i (i)}
            <li>{@html item}</li>
          {/each}
        </ul>
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
          <!-- A motif, such as a tree, is hard to draw cut by cut: the design page makes it. -->
          <li>{t('helpFigureTip', lang)} <a href={generatorHref(lang, 'figure')}>{t('hintFigureLink', lang)}</a></li>
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

  /* Below 900px the editor is a page that scrolls: tool row, canvas (which keeps
     its own height inside PaperHeart) and the cards follow each other, so the box
     takes the height of what it holds instead of squeezing the canvas. */
  @media (max-width: 899px) {
    .editor-top {
      height: auto;
      min-height: 0;
    }

    .editor-top :global(.paper-heart.fullPage) {
      flex: none;
    }
  }

  /* Keep the shared colour footer visible below the desktop canvas. */
  @media (min-width: 900px) {
    .editor {
      padding-bottom: 0;
    }

    .editor-top {
      height: calc(100dvh - var(--editor-header-height) - var(--site-footer-height, 100px));
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

  /* "Gem" while the heart holds work that is not in "Mine hjerter" yet: a red dot
     on the button's corner, ringed in white against the bar. */
  .top-action {
    position: relative;
  }

  .unsaved-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--red);
    box-shadow: 0 0 0 2px var(--white);
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

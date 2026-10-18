<!--
  "Hent skabelon" — docs/redesign/DOWNLOAD.md.

  Everything about getting a heart's template out of the site, in one dialog:
  for a printer, a PDF of the folded templates at the width the visitor picks,
  on as many pages of the chosen sheet as the hearts need; for a laser cutter,
  the whole unfolded piece as an SVG or DXF (docs/redesign/LASER.md). Width
  and sheet mean the same in both, so they are set once, and
  the preview shows the sheet as it will come out.

  The geometry and the file writing are in $lib/laser and $lib/pdf (the page
  planning in $lib/pdf/plan, without jsPDF, so the preview needs no PDF); this
  dialog holds the settings, shows what they give, and hands the file over.

  It also takes several hearts at once — the front page's ticked hearts,
  docs/redesign/SELECTION.md: every piece is planned in order, the files are
  named by the count, and the laser lobe applies to every heart whose halves
  differ. One heart is exactly the single-heart dialog.

  The printer PDF holds exactly one template set per heart — a template is
  printed once and cut as often as wanted — so "Antal hjerter" is a laser
  setting only (copies of each heart on the sheet), shown in laser mode only.
-->
<script lang="ts" module>
	import type { TemplateLobe } from '$lib/utils/templateSvg';

	let sessionLobe: TemplateLobe = 'left';
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { CloseIcon, DownloadIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';
	import { getGalleryDesign } from '$lib/data/heartDesigns';
	import type { HeartDesign } from '$lib/types/heart';
	import {
		trackHeartDownload,
		trackLaserDownload,
		trackMultiDownload,
		trackMultiLaserDownload
	} from '$lib/analytics';
	import {
		LASER_MIME,
		MAX_HEARTS,
		MAX_SHEET_MM,
		MAX_WIDTH_MM,
		MIN_HEARTS,
		MIN_SHEET_MM,
		MIN_WIDTH_MM,
		WIDTH_STEP_MM,
		a3FitsAll,
		clamp,
		laserFileContent,
		laserFileName,
		laserFileUrl,
		planLaserSheet,
		type LaserFormat,
		type LaserPlan
	} from '$lib/laser/export';
	import { formatMm } from '$lib/laser/format';
	import { SHEETS, type SheetSize } from '$lib/laser/sheet';
	import { serializeLaserSvg } from '$lib/laser/svg';
	import {
		planTemplatePages,
		templatePair,
		templatePicturePixels,
		templatePieces,
		type TemplatePagePlan,
		type TemplatePiece
	} from '$lib/pdf/plan';
	import { serializeTemplatePageSvg } from '$lib/pdf/preview';
	import { prerenderHeartImages } from '$lib/pdf/heartRenderer';
	import { lobesShareTemplate } from '$lib/utils/symmetry';
	import {
		DEFAULT_DOWNLOAD_SETTINGS,
		loadDownloadSettings,
		saveDownloadSettings,
		type DownloadMode
	} from '$lib/download/settings';
	import { parseNumberInput, parseWholeNumber, typeDecimalPoint } from '$lib/download/numberInput';

	interface Props {
		/** The hearts to get, in order; one is the heart page's dialog. */
		designs: readonly HeartDesign[];
		/** The single heart's id and name, when they are not the design's own. */
		heartId?: string;
		heartName?: string;
		lang: Language;
		open: boolean;
		/** The page returns focus to whatever opened the dialog. */
		onClose: () => void;
	}

	let { designs, heartId: idProp, heartName: nameProp, lang, open, onClose }: Props = $props();

	const design = $derived(designs[0]!);
	const several = $derived(designs.length > 1);
	const heartId = $derived(idProp ?? design.id);
	const heartName = $derived(several ? designs.map((d) => d.name).join(', ') : (nameProp ?? design.name));
	/** What the multi-heart PDF event counts: every heart, as the PDF holds them all. */
	const heartList = $derived(designs.map((d) => ({ id: d.id, name: d.name })));

	// The laser lobe is remembered for this visit only (DOWNLOAD.md): having cut
	// the left halves, the visitor comes back for the right ones, but a stored
	// "Højre" would greet the next heart on another day with its second half.
	let lobe = $state<TemplateLobe>(sessionLobe);
	$effect(() => {
		sessionLobe = lobe;
	});

	type SheetKind = 'A4' | 'A3' | 'custom';

	const defaults = DEFAULT_DOWNLOAD_SETTINGS;
	let mode = $state<DownloadMode>(defaults.mode);
	let format = $state<LaserFormat>(defaults.format);
	let widthMm = $state(defaults.widthMm);
	let hearts = $state(defaults.hearts);
	let sheetKind = $state<SheetKind>('A4');
	let customWidthMm = $state<number>(SHEETS.A4.widthMm);
	let customHeightMm = $state<number>(SHEETS.A4.heightMm);
	let previewImage = $state(defaults.previewImage);
	/** The last download that went wrong, cleared by the next that works. */
	let failure = $state<DownloadMode | null>(null);
	/**
	 * A download is under way: from the click until a moment after the file has
	 * been handed to the browser. jsPDF is loaded and the pictures rendered on
	 * the click, which takes a moment; a laser file is written at once, but the
	 * second click of a double-click (or a repeated Enter) comes after that, and
	 * would give a second file and a second set of events.
	 */
	let busy = $state(false);

	// The number fields while they are edited; see "Inputs" below.
	type NumberField = 'width' | 'hearts' | 'sheetWidth' | 'sheetHeight';

	/** What is typed into a field being edited, as the input reports it. */
	let drafts = $state<Partial<Record<NumberField, string>>>({});

	// A decimal comma counts as a point (numberInput.ts); whole numbers only
	// settle when the field is left, so "80,5" is not rewritten under the cursor.
	const parseField = (raw: string): number | null => {
		const value = parseNumberInput(raw);
		return Number.isFinite(value) ? value : null;
	};

	const invalid = $derived<Record<NumberField, boolean>>({
		width: drafts.width !== undefined && parseField(drafts.width) === null,
		hearts: drafts.hearts !== undefined && parseField(drafts.hearts) === null,
		sheetWidth: drafts.sheetWidth !== undefined && parseField(drafts.sheetWidth) === null,
		sheetHeight: drafts.sheetHeight !== undefined && parseField(drafts.sheetHeight) === null
	});

	// Each opening starts from the settings of the last download. They are
	// stored when a download starts, not as they change: opening the dialog and
	// cancelling it, or Escape, leaves what was stored as it was.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const settings = loadDownloadSettings();
			mode = settings.mode;
			format = settings.format;
			widthMm = settings.widthMm;
			hearts = settings.hearts;
			if (typeof settings.sheet === 'string') {
				sheetKind = settings.sheet;
			} else {
				sheetKind = 'custom';
				customWidthMm = settings.sheet.widthMm;
				customHeightMm = settings.sheet.heightMm;
			}
			previewImage = settings.previewImage;
			drafts = {};
			failure = null;
		});
	});

	const sheet = $derived<SheetSize>(
		sheetKind === 'custom' ? { widthMm: customWidthMm, heightMm: customHeightMm } : SHEETS[sheetKind]
	);

	// ---- Printer: the folded templates, page by page ---------------------------

	const printPieces = $derived.by<TemplatePiece[]>(() => {
		if (!open || mode !== 'printer') return [];
		// One set per heart: the count is the laser's.
		return templatePieces(designs, widthMm, 1);
	});

	const printPlan = $derived.by<TemplatePagePlan | null>(() =>
		printPieces.length ? planTemplatePages(printPieces, { sheet }) : null
	);

	const pageCount = $derived(printPlan?.pages.length ?? 0);

	// The heart's picture as the PDF will print it: the same rendering, at the
	// same pixel size, so the preview shows the real heart rather than a box
	// where it goes. It takes a moment (an SVG drawn into a canvas), and until
	// it is there the preview leaves the place empty. A picture of this design
	// at another width is kept meanwhile: only its sharpness differs.
	const picturePixels = $derived(printPieces.length ? templatePicturePixels(printPieces, lang) : 0);
	let pictures = $state<{ designId: string; pixels: number; images: Map<string, string> } | null>(null);
	/** The set's key: the hearts' ids, in order. */
	const designsKey = $derived(designs.map((d) => d.id).join(' '));

	$effect(() => {
		if (!open || mode !== 'printer' || !previewImage || !picturePixels) return;
		const wanted = { designs, key: designsKey, pixels: picturePixels };
		const have = untrack(() => pictures);
		if (have && have.designId === wanted.key && have.pixels === wanted.pixels) return;
		let stale = false;
		prerenderHeartImages([...wanted.designs], wanted.pixels).then(
			(images) => {
				if (!stale) pictures = { designId: wanted.key, pixels: wanted.pixels, images };
			},
			// prerenderHeartImages logs and skips a heart it cannot draw; this is
			// for anything else. The preview then simply has no picture.
			(err) => console.error('Rendering the heart picture failed', err)
		);
		return () => {
			stale = true;
		};
	});

	const previewImages = $derived(pictures?.designId === designsKey ? pictures.images : undefined);

	// ---- Laser: one lobe's unfolded pieces on one sheet ------------------------
	// A heart's halves are cut from two colours of paper, so a sheet holds one
	// lobe: one piece per heart. A heart whose halves are the same piece needs
	// no choice; the same sheet is cut once in each colour.

	// With several hearts the lobe choice applies to every heart whose halves
	// differ; it is only left out when none of them do.
	const sharedTemplate = $derived(designs.every((d) => lobesShareTemplate(d.fingers, d.gridSize)));

	// A design the export cannot cut (a cut that stops short of the fold) has no
	// plan; the dialog then says so instead of showing a preview.
	const laserPlan = $derived.by<LaserPlan | null>(() => {
		if (!open || mode !== 'laser') return null;
		try {
			return planLaserSheet(designs, { widthMm, count: hearts, sheet, lobe });
		} catch (err) {
			console.error('Laying out the laser sheet failed', err);
			return null;
		}
	});

	// ---- What the settings give ------------------------------------------------

	// The strips against the visitor's scissors or laser, and the height: the
	// folded template's for print, the opened-out piece's for the laser.
	// Several hearts have several strip widths and heights, so the line is the
	// single heart's only.
	const derivedLine = $derived.by(() => {
		if (several) return '';
		let strip: number;
		let height: number;
		if (mode === 'printer') {
			const [left, right] = templatePair(design, widthMm);
			strip = left.stripWidthMm;
			height = Math.max(left.heightMm, right.heightMm);
		} else if (laserPlan) {
			const piece = laserPlan.pair[laserPlan.lobe === 'left' ? 0 : 1];
			strip = piece.stripWidthMm;
			height = piece.heightMm;
		} else {
			return '';
		}
		return t('pieceDerived', lang, { strip: formatMm(strip, lang), height: formatMm(height, lang) });
	});

	const sheetNote = $derived.by<{ text: string; warn: boolean } | null>(() => {
		if (mode === 'printer') {
			if (!printPlan) return null;
			if (!printPlan.fits) return { text: t('pdfTooLarge', lang), warn: true };
			return {
				text: pageCount === 1 ? t('pdfOnePage', lang) : t('pdfPages', lang, { n: pageCount }),
				warn: false
			};
		}
		// No piece at all fits: "room for 0 of 1" says nothing useful; say what
		// the printer says, and what to do about it.
		if (laserPlan && laserPlan.piecesFit === 0) return { text: t('pdfTooLarge', lang), warn: true };
		if (laserPlan && laserPlan.piecesFit < laserPlan.piecesRequested) {
			let text = t('sheetFit', lang, { n: laserPlan.piecesFit, total: laserPlan.piecesRequested });
			// With several hearts, say which ones the file will not hold.
			if (several && laserPlan.heartsLeftOut.length && laserPlan.heartsOnSheet.length) {
				const names = laserPlan.heartsLeftOut.map((h) => h.design.name).join(', ');
				// And how to get them all: A3 only when it would hold them.
				const a3 = a3FitsAll(designs, { widthMm, count: hearts, sheet, lobe });
				text += `. ${t('sheetLeftOut', lang, { names })}. ${t(a3 ? 'sheetLeftOutHintA3' : 'sheetLeftOutHint', lang)}`;
			}
			return { text, warn: true };
		}
		return null;
	});

	// The hearts the laser file holds: with several, only those the sheet had
	// room for, so its title and name match what is on it.
	const laserHearts = $derived(laserPlan ? laserPlan.heartsOnSheet.map((h) => h.design) : designs);

	const fileInfo = $derived({
		heartId,
		heartName: several ? laserHearts.map((d) => d.name).join(', ') : heartName,
		url: laserFileUrl(
			several ? laserHearts.map((d) => d.id) : [heartId],
			lang,
			(id) => getGalleryDesign(id) !== null
		),
		widthMm
	});

	const previewSvg = $derived.by(() => {
		if (mode === 'printer') {
			return printPlan?.fits
				? serializeTemplatePageSvg(printPlan, printPieces, {
						page: 0,
						lang,
						previewImage,
						images: previewImages,
						title: heartName
					})
				: '';
		}
		return laserPlan
			? serializeLaserSvg(laserPlan, {
					title: fileInfo.heartName,
					description: t('sheetPreview', lang),
					look: 'preview'
				})
			: '';
	});

	const canDownload = $derived(
		!invalid.width &&
			(mode === 'printer'
				? printPlan !== null && printPlan.fits
				: !invalid.hearts && laserPlan !== null && laserPlan.piecesFit > 0) &&
			(sheetKind !== 'custom' || (!invalid.sheetWidth && !invalid.sheetHeight))
	);

	const errorText = $derived.by(() => {
		if (mode === 'printer') return failure === 'printer' ? t('pdfFailed', lang) : null;
		return failure === 'laser' || laserPlan === null ? t('laserFailed', lang) : null;
	});

	const fileFormat = $derived(mode === 'printer' ? 'PDF' : format.toUpperCase());

	// ---- Inputs ---------------------------------------------------------------
	// A number field follows what is typed at once, clamped to its range and
	// rounded to a whole millimetre (or heart), so the preview, the line under it
	// and the button always show what the file will be. Something that is not a
	// number (or nothing) marks the field and disables the button until it is
	// fixed; leaving the field then puts the last good value back. The typed text
	// is kept as it is while the field is being edited ("30" stays "30" and
	// gives 40 mm), and settles on the value used when the field is left.

	/** The field's value: the typed text while it is edited, else the setting. */
	const shown = (field: NumberField): string | number => drafts[field] ?? current(field);

	const LIMITS: Record<NumberField, [number, number]> = {
		width: [MIN_WIDTH_MM, MAX_WIDTH_MM],
		hearts: [MIN_HEARTS, MAX_HEARTS],
		sheetWidth: [MIN_SHEET_MM, MAX_SHEET_MM],
		sheetHeight: [MIN_SHEET_MM, MAX_SHEET_MM]
	};

	function current(field: NumberField): number {
		if (field === 'width') return widthMm;
		if (field === 'hearts') return hearts;
		return field === 'sheetWidth' ? customWidthMm : customHeightMm;
	}

	function assign(field: NumberField, value: number): void {
		const [lo, hi] = LIMITS[field];
		const next = Math.round(clamp(value, lo, hi));
		if (field === 'width') widthMm = next;
		else if (field === 'hearts') hearts = next;
		else if (field === 'sheetWidth') customWidthMm = next;
		else customHeightMm = next;
	}

	function setNumber(field: NumberField, raw: string): void {
		drafts[field] = raw;
		const value = parseField(raw);
		if (value !== null) assign(field, value);
	}

	function commitNumber(field: NumberField, input: HTMLInputElement): void {
		delete drafts[field];
		const typed = parseWholeNumber(input.value);
		if (input.value.trim() && Number.isFinite(typed)) assign(field, typed);
		// Written back as well: the typed text may clamp onto the value already
		// set, which changes no state, and the field would keep showing it.
		input.value = String(current(field));
	}

	// A single-choice ToggleGroup lets a second click clear it; none of the
	// choices here has an "off", so an empty answer keeps what was there.
	function chooseMode(next: unknown): void {
		if (next === 'printer' || next === 'laser') mode = next;
	}

	function chooseLobe(next: unknown): void {
		if (next === 'left' || next === 'right') lobe = next;
	}

	const lobeName = (which: TemplateLobe) => t(which === 'left' ? 'lobeLeft' : 'lobeRight', lang);

	function chooseFormat(next: unknown): void {
		if (next === 'svg' || next === 'dxf') format = next;
	}

	function chooseSheet(next: unknown): void {
		if (next === 'A4' || next === 'A3' || next === 'custom') sheetKind = next;
	}

	// ---- Download -------------------------------------------------------------

	/** How long the button stays busy after the file has gone to the browser. */
	const BUSY_HOLD_MS = 1000;

	// jsPDF is 140 KB gzipped and only this click needs it, so it is loaded here
	// rather than with the page.
	async function downloadPdf(): Promise<void> {
		if (several) trackMultiDownload(heartList);
		else trackHeartDownload(design.id, design.name);
		try {
			const { downloadTemplatesPDF } = await import('$lib/pdf/template');
			await downloadTemplatesPDF([...designs], { widthMm, hearts: 1, sheet, lang, previewImage });
			failure = null;
		} catch (err) {
			// Without this the download simply did nothing, with no sign of why.
			console.error('Generating the PDF failed', err);
			failure = 'printer';
		}
	}

	let downloadButton = $state.raw<HTMLButtonElement | null>(null);

	// The button disables itself while a download is under way, and a disabled
	// button cannot keep focus: Chromium drops it to <body>, outside the dialog.
	// Once it is enabled again it takes focus back, so the next Tab, Enter or
	// Escape lands inside the dialog — but only if focus really went astray, not
	// if the visitor has moved on to another control meanwhile.
	async function restoreFocus(): Promise<void> {
		await tick();
		const active = document.activeElement;
		if (!open || !downloadButton) return;
		if (active === null || active === document.body) downloadButton.focus();
	}

	function downloadLaser(): void {
		if (!laserPlan) return;
		try {
			const content = laserFileContent(laserPlan, format, fileInfo);
			const blob = new Blob([content], { type: LASER_MIME[format] });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = laserFileName(
				several ? t('laserMultiFilename', lang, { n: laserHearts.length }) : heartId,
				widthMm,
				format,
				laserPlan.shared ? undefined : lobeName(laserPlan.lobe)
			);
			document.body.appendChild(link);
			link.click();
			link.remove();
			// Some browsers start the download only after the click returns, so the
			// URL has to outlive it for a moment.
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			failure = null;
			// The hearts with a piece on the sheet, as the file name counts them.
			if (several) trackMultiLaserDownload(laserHearts.map((d) => ({ id: d.id, name: d.name })), format, widthMm);
			else trackLaserDownload(heartId, heartName, format, widthMm);
		} catch (err) {
			console.error('Writing the laser file failed', err);
			failure = 'laser';
		}
	}

	// Every activation of the button comes through here, by mouse or keyboard;
	// while one download is under way the rest are ignored.
	async function download(): Promise<void> {
		if (busy || !canDownload) return;
		busy = true;
		saveDownloadSettings({
			mode,
			widthMm,
			hearts,
			sheet: sheetKind === 'custom' ? { widthMm: customWidthMm, heightMm: customHeightMm } : sheetKind,
			format,
			previewImage
		});
		try {
			if (mode === 'printer') await downloadPdf();
			else downloadLaser();
			await new Promise((resolve) => setTimeout(resolve, BUSY_HOLD_MS));
		} finally {
			busy = false;
			await restoreFocus();
		}
	}
</script>

<Modal {open} labelledBy="download-dialog-title" width="min(860px, 100%)" {onClose}>
	<div class="download">
		<div class="head">
			<h2 id="download-dialog-title" class="title">
				{#if several}
					{t('getTemplatesTitle', lang)}
					<span class="title-count" data-testid="download-count">{designs.length}</span>
				{:else}
					{t('getTemplateTitle', lang)}
				{/if}
			</h2>
			<!-- At every width: on a phone "Annuller" sits below the fold of a
			     scrolling dialog, and the scrim around it is a thin strip. -->
			<button
				class="btn btn-ghost btn-icon close"
				type="button"
				aria-label={t('close', lang)}
				data-testid="download-close"
				onclick={onClose}
			>
				<CloseIcon size={18} />
			</button>
		</div>

		<div class="body">
			<div class="controls">
				<div class="field">
					<span class="label" id="download-mode-label">{t('downloadMode', lang)}</span>
					<div class="segmented">
						<ToggleGroup
							type="single"
							role="radiogroup"
							aria-labelledby="download-mode-label"
							value={mode}
							onValueChange={chooseMode}
						>
							<ToggleGroupItem value="printer">{t('modePrinter', lang)}</ToggleGroupItem>
							<ToggleGroupItem value="laser">{t('modeLaser', lang)}</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<p class="hint">
						{mode === 'printer' ? t('modePrinterHint', lang) : t('laserFormatHint', lang)}
					</p>
				</div>

				<div class="field">
					<label class="label" for="download-width">{t('pieceWidth', lang)}</label>
					<input
						id="download-width"
						class="number"
						type="number"
						min={MIN_WIDTH_MM}
						max={MAX_WIDTH_MM}
						step={WIDTH_STEP_MM}
						value={shown('width')}
						aria-invalid={invalid.width}
						oninput={(e) => setNumber('width', e.currentTarget.value)}
						onblur={(e) => commitNumber('width', e.currentTarget)}
						onkeydown={typeDecimalPoint}
					/>
					{#if derivedLine}
						<p class="hint" data-testid="download-derived">{derivedLine}</p>
					{/if}
				</div>

				{#if mode === 'laser'}
					<div class="field">
						<label class="label" for="download-hearts">{t('heartsCount', lang)}</label>
						<input
							id="download-hearts"
							class="number"
							type="number"
							min={MIN_HEARTS}
							max={MAX_HEARTS}
							step="1"
							value={shown('hearts')}
							aria-invalid={invalid.hearts}
							oninput={(e) => setNumber('hearts', e.currentTarget.value)}
							onblur={(e) => commitNumber('hearts', e.currentTarget)}
						/>
						<p class="hint">{several ? t('piecesEachNote', lang) : t('piecesNote', lang)}</p>
					</div>
				{/if}

				<div class="field">
					<span class="label" id="download-sheet-label">{t('sheet', lang)}</span>
					<div class="segmented">
						<ToggleGroup
							type="single"
							role="radiogroup"
							aria-labelledby="download-sheet-label"
							value={sheetKind}
							onValueChange={chooseSheet}
						>
							<ToggleGroupItem value="A4">A4</ToggleGroupItem>
							<ToggleGroupItem value="A3">A3</ToggleGroupItem>
							<ToggleGroupItem value="custom">{t('sheetCustom', lang)}</ToggleGroupItem>
						</ToggleGroup>
					</div>
					{#if sheetKind === 'custom'}
						<div class="sheet-size">
							<label class="small-label">
								<span>{t('sheetWidth', lang)}</span>
								<input
									class="number"
									type="number"
									min={MIN_SHEET_MM}
									max={MAX_SHEET_MM}
									step="1"
									value={shown('sheetWidth')}
									aria-invalid={invalid.sheetWidth}
									oninput={(e) => setNumber('sheetWidth', e.currentTarget.value)}
									onblur={(e) => commitNumber('sheetWidth', e.currentTarget)}
									onkeydown={typeDecimalPoint}
								/>
							</label>
							<label class="small-label">
								<span>{t('sheetHeight', lang)}</span>
								<input
									class="number"
									type="number"
									min={MIN_SHEET_MM}
									max={MAX_SHEET_MM}
									step="1"
									value={shown('sheetHeight')}
									aria-invalid={invalid.sheetHeight}
									oninput={(e) => setNumber('sheetHeight', e.currentTarget.value)}
									onblur={(e) => commitNumber('sheetHeight', e.currentTarget)}
									onkeydown={typeDecimalPoint}
								/>
							</label>
						</div>
					{/if}
					{#if sheetNote}
						<p class="hint" class:warn={sheetNote.warn} role="status" data-testid="download-sheet-note">
							{sheetNote.text}
						</p>
					{/if}
				</div>

				{#if mode === 'laser'}
					{#if sharedTemplate}
						<p class="hint" data-testid="download-lobe-note">{t('laserSameNote', lang)}</p>
					{:else}
						<div class="field">
							<span class="label" id="download-lobe-label">{t('laserPiece', lang)}</span>
							<div class="segmented">
								<ToggleGroup
									type="single"
									role="radiogroup"
									aria-labelledby="download-lobe-label"
									value={lobe}
									onValueChange={chooseLobe}
								>
									<ToggleGroupItem value="left">{lobeName('left')}</ToggleGroupItem>
									<ToggleGroupItem value="right">{lobeName('right')}</ToggleGroupItem>
								</ToggleGroup>
							</div>
							<p class="hint" data-testid="download-lobe-note">{t('laserBothNote', lang)}</p>
						</div>
					{/if}

					<div class="field">
						<span class="label" id="download-format-label">{t('laserFormat', lang)}</span>
						<div class="segmented">
							<ToggleGroup
								type="single"
								role="radiogroup"
								aria-labelledby="download-format-label"
								value={format}
								onValueChange={chooseFormat}
							>
								<ToggleGroupItem value="svg">SVG</ToggleGroupItem>
								<ToggleGroupItem value="dxf">DXF</ToggleGroupItem>
							</ToggleGroup>
						</div>
					</div>
				{:else}
					<div class="field">
						<label class="checkbox">
							<input type="checkbox" data-testid="download-preview-image" bind:checked={previewImage} />
							<span>{t('pdfShowPreviewImage', lang)}</span>
						</label>
					</div>
				{/if}
			</div>

			<figure class="preview" data-mode={mode}>
				<!-- Drawn from the same plan and geometry the file is made from: what
				     is here is what the PDF's first page or the laser file holds. -->
				<div class="preview-sheet" role="img" aria-label={t('sheetPreview', lang)}>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- markup from serializeTemplatePageSvg / serializeLaserSvg, which escape the heart's name -->
					{@html previewSvg}
				</div>
				{#if mode === 'laser'}
					<figcaption class="legend">{t('laserLegend', lang)}</figcaption>
				{:else if pageCount > 1}
					<figcaption class="legend" data-testid="download-preview-page">
						{t('pdfPreviewPage', lang, { n: pageCount })}
					</figcaption>
				{/if}
			</figure>
		</div>

		{#if errorText}
			<p class="error" role="alert">{errorText}</p>
		{/if}

		<div class="buttons">
			<button type="button" class="btn btn-ghost" onclick={onClose}>{t('cancel', lang)}</button>
			<button
				bind:this={downloadButton}
				type="button"
				class="btn btn-primary"
				onclick={download}
				disabled={!canDownload || busy}
				aria-busy={busy}
				data-busy={busy || undefined}
			>
				{#if busy}
					<span class="spinner" aria-hidden="true"></span>
					{t('generating', lang)}
				{:else}
					<DownloadIcon size={18} />
					{t('downloadFile', lang, { format: fileFormat })}
				{/if}
			</button>
		</div>
	</div>
</Modal>

<style>
	.download {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	/* Pulled into the card's padding so its glyph sits near the edge. */
	.close {
		flex: none;
		margin-right: -10px;
	}

	.title {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		margin: 0;
		font-size: 24px;
	}

	/* The count, as the bar's button shows it. */
	.title-count {
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--red);
		color: var(--white);
		font-size: 15px;
		font-weight: 600;
	}

	/* Settings on the left, the sheet on the right; stacked below 900px, with
	   the preview under the settings it follows from. */
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 24px;
		align-items: start;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
	}

	.warn {
		color: var(--red);
		font-weight: 600;
	}

	.number {
		width: 96px;
		height: 36px;
		padding: 4px 10px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		box-sizing: border-box;
		font-family: inherit;
		font-size: 14px;
		color: var(--ink);
	}

	.number:focus {
		border-color: var(--green);
	}

	/* Not a number: the button waits until it is one. */
	.number[aria-invalid='true'] {
		border-color: var(--red);
		box-shadow: 0 0 0 1px var(--red);
	}

	.sheet-size {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	.small-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: var(--ink);
		cursor: pointer;
	}

	.checkbox input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--green);
	}

	/* The same restyled ToggleGroup as the paint mode's panels. */
	.segmented :global([data-slot='toggle-group']) {
		display: flex;
		gap: 0;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
		background: var(--white);
	}

	.segmented :global([data-slot='toggle-group-item']) {
		flex: 1 1 0;
		padding: 7px 8px;
		border-radius: 0;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		box-shadow: none;
		cursor: pointer;
	}

	.segmented :global([data-slot='toggle-group-item']:hover) {
		background: var(--cream2);
		color: var(--green);
	}

	.segmented :global([data-slot='toggle-group-item'][data-state='on']) {
		background: var(--green);
		color: var(--white);
	}

	/* The group's overflow: hidden would clip an outline, and box-shadow: none
	   above cancels the shadcn ring, so the keyboard ring is drawn inset: 3px of
	   --blue (3.5:1 on the white segment) with a 2px white halo inside it, which
	   is what carries the 3:1 against the green "on" segment (SC 1.4.11). */
	.segmented :global([data-slot='toggle-group-item']:focus-visible) {
		outline: none;
		box-shadow:
			inset 0 0 0 3px var(--blue),
			inset 0 0 0 5px var(--white);
	}

	.preview {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	/* The sheet keeps its proportions inside a box at most 320px tall. */
	.preview-sheet {
		width: 100%;
		height: 320px;
		color: var(--muted);
	}

	.preview-sheet :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.preview-sheet :global(.sheet) {
		fill: var(--white);
		stroke: var(--line);
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
	}

	.preview-sheet :global(.cut path) {
		stroke: #000;
		stroke-width: 0.6px;
	}

	/* The printer page's fold, dashed as the PDF prints it. The laser file has
	   no fold line: it is cut lines only (DOWNLOAD.md, round 2). */
	.preview-sheet :global(.fold path) {
		stroke: var(--muted);
		stroke-width: 0.6px;
		stroke-dasharray: 3 2;
	}

	/* The laser preview wears the file's own colour, the red every line of it
	   is cut in, as the legend under it says. The printer page stays black on
	   white, as it prints. */
	.preview[data-mode='laser'] .preview-sheet :global(.cut path) {
		stroke: #ff0000;
	}

	/* The printer page's labels and address lines, in the PDF's Helvetica so a
	   line that fits here fits there. */
	.preview-sheet :global(.label) {
		fill: var(--ink);
		font-family: Helvetica, Arial, sans-serif;
	}

	.preview-sheet :global(.address) {
		fill: var(--muted);
		font-family: Helvetica, Arial, sans-serif;
	}

	.legend {
		font-size: 12px;
		color: var(--muted);
		text-align: center;
	}

	.error {
		margin: 0;
		color: var(--red);
		font-size: 14px;
	}

	/* While a download is under way the button says so and turns a ring. */
	.btn[data-busy] {
		cursor: progress;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
			border-right-color: currentColor;
			opacity: 0.6;
		}
	}

	.buttons {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 12px;
	}

	@media (max-width: 899px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}

		.preview-sheet {
			height: 260px;
		}
	}
</style>

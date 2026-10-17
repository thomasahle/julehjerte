<!--
  "Hent til laserskærer" — docs/redesign/LASER.md.

  The heart's whole unfolded piece as a laser-ready SVG or DXF: the visitor
  picks the format, the heart's width, how many hearts, the sheet and whether
  to score the fold, sees the sheet as it will be cut, and downloads one file.

  The geometry and the file writing are all in $lib/laser; this dialog holds
  the settings, shows what they give, and hands the file to the browser.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';
	import { DownloadIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';
	import { SITE_URL } from '$lib/config';
	import { heartPath } from '$lib/i18n/routes';
	import type { HeartDesign } from '$lib/types/heart';
	import { trackLaserDownload } from '$lib/analytics';
	import {
		DEFAULT_WIDTH_MM,
		LASER_MIME,
		MAX_HEARTS,
		MAX_SHEET_MM,
		MAX_WIDTH_MM,
		MIN_HEARTS,
		MIN_SHEET_MM,
		MIN_WIDTH_MM,
		WIDTH_STEP_MM,
		clamp,
		laserFileContent,
		laserFileName,
		loadLaserSettings,
		planLaserSheet,
		saveLaserSettings,
		type LaserFormat,
		type LaserPlan
	} from '$lib/laser/export';
	import { formatMm } from '$lib/laser/format';
	import { SHEETS, type SheetSize } from '$lib/laser/sheet';
	import { serializeLaserSvg } from '$lib/laser/svg';

	interface Props {
		design: HeartDesign;
		heartId: string;
		heartName: string;
		lang: Language;
		open: boolean;
		/** The page returns focus to whatever opened the dialog. */
		onClose: () => void;
	}

	let { design, heartId, heartName, lang, open, onClose }: Props = $props();

	type SheetKind = 'A4' | 'A3' | 'custom';

	let format = $state<LaserFormat>('svg');
	let widthMm = $state(DEFAULT_WIDTH_MM);
	let hearts = $state(1);
	let sheetKind = $state<SheetKind>('A4');
	let customWidthMm = $state<number>(SHEETS.A4.widthMm);
	let customHeightMm = $state<number>(SHEETS.A4.heightMm);
	let scoreFold = $state(false);
	let downloadFailed = $state(false);

	// Each opening starts from what was used last time (format and width); the
	// rest is per heart and per sheet, and starts afresh.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const settings = loadLaserSettings();
			format = settings.format;
			widthMm = settings.widthMm;
			downloadFailed = false;
		});
	});

	$effect(() => {
		if (open) saveLaserSettings({ format, widthMm });
	});

	const sheet = $derived<SheetSize>(
		sheetKind === 'custom' ? { widthMm: customWidthMm, heightMm: customHeightMm } : SHEETS[sheetKind]
	);

	// A design the export cannot cut (a cut that stops short of the fold) has no
	// plan; the dialog then says so instead of showing a preview.
	const plan = $derived.by<LaserPlan | null>(() => {
		if (!open) return null;
		try {
			return planLaserSheet(design, { widthMm, hearts, sheet });
		} catch (err) {
			console.error('Laying out the laser sheet failed', err);
			return null;
		}
	});

	const derivedLine = $derived.by(() => {
		if (!plan) return '';
		const [left, right] = plan.pair;
		return t('laserDerived', lang, {
			strip: formatMm(left.stripWidthMm, lang),
			height: formatMm(Math.max(left.heightMm, right.heightMm), lang)
		});
	});

	const fileInfo = $derived({
		heartId,
		heartName,
		url: `${SITE_URL}${heartPath(heartId, lang)}`,
		widthMm,
		scoreFold
	});

	const previewSvg = $derived(
		plan
			? serializeLaserSvg(plan, {
					scoreFold,
					title: heartName,
					description: t('laserPreview', lang),
					look: 'preview'
				})
			: ''
	);

	const canDownload = $derived(plan !== null && plan.heartsFit > 0);
	const failed = $derived(downloadFailed || plan === null);

	// ---- Inputs ---------------------------------------------------------------
	// A number field takes what is typed while it is in range and settles on the
	// nearest allowed value when it is left, as the paint mode's fields do.

	type NumberField = 'width' | 'hearts' | 'sheetWidth' | 'sheetHeight';

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
		if (field === 'width') widthMm = value;
		else if (field === 'hearts') hearts = Math.round(value);
		else if (field === 'sheetWidth') customWidthMm = value;
		else customHeightMm = value;
	}

	function setNumber(field: NumberField, raw: string): void {
		const value = Number(raw);
		const [lo, hi] = LIMITS[field];
		if (!raw.trim() || !Number.isFinite(value) || value < lo || value > hi) return;
		assign(field, value);
	}

	function commitNumber(field: NumberField, input: HTMLInputElement): void {
		const [lo, hi] = LIMITS[field];
		const next = input.value.trim() && Number.isFinite(Number(input.value))
			? clamp(Number(input.value), lo, hi)
			: current(field);
		assign(field, next);
		// Written back as well: a refused value that clamps onto the current one
		// changes no state, and the field would keep showing the refused text.
		input.value = String(current(field));
	}

	// A single-choice ToggleGroup lets a second click clear it; neither choice
	// here has an "off", so an empty answer keeps what was there.
	function chooseFormat(next: unknown): void {
		if (next === 'svg' || next === 'dxf') format = next;
	}

	function chooseSheet(next: unknown): void {
		if (next === 'A4' || next === 'A3' || next === 'custom') sheetKind = next;
	}

	// ---- Download -------------------------------------------------------------

	function download(): void {
		if (!plan || !canDownload) return;
		try {
			const content = laserFileContent(plan, format, fileInfo);
			const blob = new Blob([content], { type: LASER_MIME[format] });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = laserFileName(heartId, widthMm, format);
			document.body.appendChild(link);
			link.click();
			link.remove();
			// Some browsers start the download only after the click returns, so the
			// URL has to outlive it for a moment.
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			downloadFailed = false;
			trackLaserDownload(heartId, heartName, format, widthMm);
		} catch (err) {
			console.error('Writing the laser file failed', err);
			downloadFailed = true;
		}
	}
</script>

<Modal {open} labelledBy="laser-dialog-title" width="min(860px, 100%)" {onClose}>
	<div class="laser">
		<h2 id="laser-dialog-title" class="title">{t('laserTitle', lang)}</h2>

		<div class="body">
			<div class="controls">
				<div class="field">
					<span class="label" id="laser-format-label">{t('laserFormat', lang)}</span>
					<div class="segmented">
						<ToggleGroup
							type="single"
							role="radiogroup"
							aria-labelledby="laser-format-label"
							value={format}
							onValueChange={chooseFormat}
						>
							<ToggleGroupItem value="svg">SVG</ToggleGroupItem>
							<ToggleGroupItem value="dxf">DXF</ToggleGroupItem>
						</ToggleGroup>
					</div>
					<p class="hint">{t('laserFormatHint', lang)}</p>
				</div>

				<div class="field">
					<label class="label" for="laser-width">{t('laserWidth', lang)}</label>
					<input
						id="laser-width"
						class="number"
						type="number"
						min={MIN_WIDTH_MM}
						max={MAX_WIDTH_MM}
						step={WIDTH_STEP_MM}
						value={widthMm}
						oninput={(e) => setNumber('width', e.currentTarget.value)}
						onblur={(e) => commitNumber('width', e.currentTarget)}
					/>
					{#if derivedLine}
						<p class="hint" data-testid="laser-derived">{derivedLine}</p>
					{/if}
				</div>

				<div class="field">
					<label class="label" for="laser-hearts">{t('laserHearts', lang)}</label>
					<input
						id="laser-hearts"
						class="number"
						type="number"
						min={MIN_HEARTS}
						max={MAX_HEARTS}
						step="1"
						value={hearts}
						oninput={(e) => setNumber('hearts', e.currentTarget.value)}
						onblur={(e) => commitNumber('hearts', e.currentTarget)}
					/>
					<p class="hint">{t('laserPiecesNote', lang)}</p>
				</div>

				<div class="field">
					<span class="label" id="laser-sheet-label">{t('laserSheet', lang)}</span>
					<div class="segmented">
						<ToggleGroup
							type="single"
							role="radiogroup"
							aria-labelledby="laser-sheet-label"
							value={sheetKind}
							onValueChange={chooseSheet}
						>
							<ToggleGroupItem value="A4">A4</ToggleGroupItem>
							<ToggleGroupItem value="A3">A3</ToggleGroupItem>
							<ToggleGroupItem value="custom">{t('laserCustom', lang)}</ToggleGroupItem>
						</ToggleGroup>
					</div>
					{#if sheetKind === 'custom'}
						<div class="sheet-size">
							<label class="small-label">
								<span>{t('laserSheetWidth', lang)}</span>
								<input
									class="number"
									type="number"
									min={MIN_SHEET_MM}
									max={MAX_SHEET_MM}
									step="1"
									value={customWidthMm}
									oninput={(e) => setNumber('sheetWidth', e.currentTarget.value)}
									onblur={(e) => commitNumber('sheetWidth', e.currentTarget)}
								/>
							</label>
							<label class="small-label">
								<span>{t('laserSheetHeight', lang)}</span>
								<input
									class="number"
									type="number"
									min={MIN_SHEET_MM}
									max={MAX_SHEET_MM}
									step="1"
									value={customHeightMm}
									oninput={(e) => setNumber('sheetHeight', e.currentTarget.value)}
									onblur={(e) => commitNumber('sheetHeight', e.currentTarget)}
								/>
							</label>
						</div>
					{/if}
					{#if plan && plan.heartsFit < plan.heartsRequested}
						<p class="hint fit" role="status" data-testid="laser-fit">
							{t('laserSheetFit', lang, { n: plan.heartsFit })}
						</p>
					{/if}
				</div>

				<div class="field">
					<label class="checkbox">
						<input type="checkbox" bind:checked={scoreFold} />
						<span>{t('laserScoreFold', lang)}</span>
					</label>
					<p class="hint">{t('laserScoreHint', lang)}</p>
				</div>
			</div>

			<figure class="preview">
				<!-- The writer's own SVG, in its preview look: what is drawn here is
				     what the file will hold. -->
				<div class="preview-sheet" role="img" aria-label={t('laserPreview', lang)}>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- markup from serializeLaserSvg, which escapes the heart's name -->
					{@html previewSvg}
				</div>
				<figcaption class="legend">{t('laserLegend', lang)}</figcaption>
			</figure>
		</div>

		{#if failed}
			<p class="error" role="alert">{t('laserFailed', lang)}</p>
		{/if}

		<div class="buttons">
			<button type="button" class="btn btn-ghost" onclick={onClose}>{t('cancel', lang)}</button>
			<button type="button" class="btn btn-primary" onclick={download} disabled={!canDownload}>
				<DownloadIcon size={18} />
				{t('laserDownload', lang, { format: format.toUpperCase() })}
			</button>
		</div>
	</div>
</Modal>

<style>
	.laser {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.title {
		margin: 0;
		font-size: 24px;
	}

	/* Settings on the left, the sheet on the right; stacked on a phone, with the
	   preview under the settings it follows from. */
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

	.fit {
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

	.preview-sheet :global(.score path) {
		stroke: var(--muted);
		stroke-width: 0.6px;
		stroke-dasharray: 3 2;
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

	.buttons {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 12px;
	}

	@media (max-width: 699px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}

		.preview-sheet {
			height: 260px;
		}
	}
</style>

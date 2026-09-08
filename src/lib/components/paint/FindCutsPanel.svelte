<!--
  Mal's right column: "Find snit" (docs/redesign/PAINT.md §2).

  One panel with four faces — ask, search, found, failed — because they are one
  conversation and swapping panels under the visitor would lose their place. The
  symmetry rows belong here rather than beside the tools (decision 2): they are
  what the search is asked to hold, not something the brush does.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { base } from '$app/paths';
	import SymmetryRows from '$lib/components/editor/SymmetryRows.svelte';
	import { ExternalIcon, ScissorsIcon } from '$lib/components/icons';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import {
		ADVANCED_LIMITS,
		clampAdvanced,
		type AdvancedNumber,
		type AdvancedSettings
	} from '$lib/inverse/engine';
	import type { PaintError, PaintResult, PaintStatus } from '$lib/editor/session.svelte';
	import type { SymmetrySettings } from '$lib/paint/symmetry';

	interface Props {
		symmetry: SymmetrySettings;
		onSymmetry: (next: SymmetrySettings) => void;
		/** What detection suggested, for the "fundet" pills. */
		found: SymmetrySettings | null;
		status: PaintStatus;
		error: PaintError | null;
		result: PaintResult | null;
		/**
		 * Whether the page is showing the found heart rather than the mask.
		 *
		 * The face is the page's to choose, not `status`'s: the canvas swaps between
		 * the heart and the mask on the same flag, and the two must never disagree.
		 * Reading it off `status === 'done'` once meant that a visitor who went back
		 * to the mask kept a summary panel with no Find snit button in it, so the
		 * page's own loop — paint, find, adjust, find again — could not be walked.
		 */
		showingResult: boolean;
		/** The rows the heart could actually be held to; null until there is one. */
		honoured: SymmetrySettings | null;
		/** Whole seconds since the search started. */
		elapsed: number;
		/** The engine's current stage name, as `core/` spells it. */
		stage: string;
		advanced: AdvancedSettings;
		onAdvanced: (next: AdvancedSettings) => void;
		onResetAdvanced: () => void;
		/** False while there is nothing to search for — an untouched mask. */
		canFind: boolean;
		onFind: () => void;
		onCancel: () => void;
		onOpenInDraw: () => void;
		onBackToMask: () => void;
		lang: Language;
	}

	let {
		symmetry,
		onSymmetry,
		found,
		status,
		error,
		result,
		showingResult,
		honoured,
		elapsed,
		stage,
		advanced,
		onAdvanced,
		onResetAdvanced,
		canFind,
		onFind,
		onCancel,
		onOpenInDraw,
		onBackToMask,
		lang
	}: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	/** The engine's stage names in words. Anything else is simply "working". */
	const STAGES: Record<string, TranslationKey> = {
		preprocessing: 'paintStagePreparing',
		graph: 'paintStageGraph',
		connectors: 'paintStageConnectors',
		model: 'paintStageModel',
		solving: 'paintStageSolving',
		validating: 'paintStageValidating',
		rounding: 'paintStageRounding',
		paper: 'paintStagePaper',
		tolerances: 'paintStageTolerances',
		exporting: 'paintStageExporting'
	};

	const FAILURES: Record<PaintError['kind'], TranslationKey> = {
		timeout: 'paintFailedTimeout',
		noSolution: 'paintFailedNoSolution',
		engine: 'paintFailedEngine'
	};

	let searching = $derived(status === 'searching');
	let stageText = $derived(tr(STAGES[stage] ?? 'paintStageWorking'));

	/**
	 * One decimal in the visitor's own notation: Danish writes 3,9 mm and 1,3 %
	 * where `toFixed` writes a point.
	 */
	function decimal(value: number): string {
		return value.toLocaleString(lang === 'en' ? 'en' : 'da', {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		});
	}

	/** Which of the three faces is on screen; the effect below watches it. */
	let face = $derived(searching ? 'searching' : showingResult && result ? 'found' : 'ask');

	let headingEl = $state.raw<HTMLHeadingElement | null>(null);
	let settled = false;

	// A face swap replaces the whole panel, the pressed button included, so focus
	// would fall to <body> and a keyboard visitor would have to tab in from the top
	// of the page to reach Afbryd or Åbn i Tegn. The heading is where the new face
	// begins, so that is where focus goes — never on the first render, which nobody
	// asked for.
	$effect(() => {
		void face;
		untrack(() => {
			if (!settled) {
				settled = true;
				return;
			}
			headingEl?.focus();
		});
	});

	// The rows the converter honoured differ from what was asked: the solve did
	// not hold the symmetry closely enough to be corrected into it (§11).
	let symmetryDropped = $derived(
		!!honoured &&
			(['curve', 'lobe', 'lobes'] as const).some((row) => honoured[row] !== symmetry[row])
	);

	/**
	 * A typed number, passed on only once it is already in range.
	 *
	 * `min` and `max` on a number input constrain the spinner, not the keyboard,
	 * and an emptied field parses as 0 — while the engine *throws* on a width
	 * outside [20, 300], inside the worker, at solve time, where the page can only
	 * report it as an engine that failed to load. Clamping on every keystroke would
	 * rewrite the field under the cursor (a 5 on its way to 50 would turn into 20),
	 * so a value outside the range waits for `commitNumber` instead.
	 */
	function setNumber(key: AdvancedNumber, raw: string): void {
		const value = Number(raw);
		const [lo, hi] = ADVANCED_LIMITS[key];
		if (!raw.trim() || !Number.isFinite(value) || value < lo || value > hi) return;
		onAdvanced({ ...advanced, [key]: value });
	}

	/** Leaving the field: whatever stands in it becomes a number the engine takes. */
	function commitNumber(key: AdvancedNumber, input: HTMLInputElement): void {
		const next = input.value.trim() ? clampAdvanced(key, Number(input.value)) : advanced[key];
		if (next !== advanced[key]) onAdvanced({ ...advanced, [key]: next });
		// Written back directly as well: when the clamp lands on the value the
		// settings already hold, nothing changes and the field would otherwise keep
		// the text that was refused.
		input.value = String(next);
	}
</script>

<section class="editor-panel">
	<!-- tabindex="-1" so the effect above can put focus here when the face swaps,
	     the way every page on the site takes focus to its <main>. -->
	<h2 class="panel-title" bind:this={headingEl} tabindex="-1">{tr('paintFindCuts')}</h2>

	{#if searching}
		<div class="progress-row">
			<ScissorsIcon size={18} />
			<span>{t('paintSearching', lang, { seconds: elapsed })}</span>
		</div>
		<!-- role="status" on the stage and not on the seconds: the search can run for
		     two minutes, and a stage that changes a handful of times is news, while a
		     counter ticking every second is noise. -->
		<p class="note" role="status">{stageText}</p>
		<div class="bar" role="progressbar" aria-label={tr('paintFindCuts')}>
			<span></span>
		</div>
		<div class="actions">
			<button type="button" class="btn btn-sm btn-outline" onclick={onCancel}>
				{tr('paintCancel')}
			</button>
		</div>
	{:else if showingResult && result}
		<!-- The answer to a wait that may have lasted a minute or two: it has to say
		     so on its own, not only to whoever is watching the panel. -->
		<div class="summary" role="status">
			<p class="lead">{tr('paintFound')}</p>
			<p class="numbers">
				{t('paintFoundSummary', lang, {
					left: result.report.cuts[0],
					right: result.report.cuts[1],
					clearance: decimal(result.report.clearanceMm),
					mismatch: decimal(100 * result.report.mismatch)
				})}
			</p>
		</div>
		{#if result.report.identical}
			<p class="note">{tr('paintFoundIdentical')}</p>
		{/if}
		{#if symmetryDropped}
			<p class="note">{tr('paintSymmetryNotHeld')}</p>
		{/if}
		<div class="actions">
			<button type="button" class="btn btn-sm btn-primary" onclick={onOpenInDraw}>
				{tr('paintOpenInDraw')}
			</button>
			<button type="button" class="btn btn-sm btn-outline" onclick={onBackToMask}>
				{tr('paintBackToMask')}
			</button>
		</div>
	{:else}
		{#if status === 'failed' && error}
			<p class="alert" role="alert">
				{tr(FAILURES[error.kind])}
			</p>
		{/if}
		<p class="lead">{tr('paintFindCutsHint')}</p>
		<SymmetryRows {lang} value={symmetry} onChange={onSymmetry} {found} />
		<button type="button" class="btn btn-primary find" onclick={onFind} disabled={!canFind}>
			<ScissorsIcon size={16} />
			{tr(status === 'failed' ? 'paintTryAgain' : 'paintFindCuts')}
		</button>

		<details class="advanced">
			<summary>{tr('paintAdvanced')}</summary>
			<label class="field">
				<span>{tr('paintPaperWidth')}</span>
				<input
					type="number"
					min="20"
					max="300"
					step="5"
					value={advanced.widthMm}
					oninput={(e) => setNumber('widthMm', e.currentTarget.value)}
					onblur={(e) => commitNumber('widthMm', e.currentTarget)}
				/>
			</label>
			<label class="field">
				<span>{tr('paintMinStripWidth')}</span>
				<input
					type="number"
					min="0.5"
					max="30"
					step="0.5"
					value={advanced.minWidthMm}
					oninput={(e) => setNumber('minWidthMm', e.currentTarget.value)}
					onblur={(e) => commitNumber('minWidthMm', e.currentTarget)}
				/>
			</label>
			<label class="checkbox">
				<input
					type="checkbox"
					checked={advanced.matchingSheets}
					onchange={(e) =>
						onAdvanced({ ...advanced, matchingSheets: e.currentTarget.checked })}
				/>
				<span>{tr('paintMatchingSheets')}</span>
			</label>
			<div class="advanced-footer">
				<button type="button" class="link" onclick={onResetAdvanced}>{tr('paintReset')}</button>
				<!-- The engine is somebody else's work; its licences travel with it. -->
				<a class="link" href="{base}/inverse/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener">
					{tr('paintEngineNotices')}
					<ExternalIcon size={12} />
				</a>
			</div>
		</details>
	{/if}
</section>

<style>
	.lead {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}

	.numbers {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink);
	}

	/* The two lines of the answer are one live region, so they need one box; the
	   gap is the panel's own, so the wrapper changes nothing on screen. */
	.summary {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.note {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
	}

	.alert {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid var(--alert-border);
		border-radius: 8px;
		background: var(--alert-bg);
		color: var(--alert-ink);
		font-size: 13px;
		line-height: 1.45;
	}

	.actions {
		display: flex;
		gap: 8px;
	}

	.actions .btn {
		flex: 1 1 0;
	}

	.find {
		height: 40px;
	}

	.progress-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		color: var(--deep);
	}

	.bar {
		height: 6px;
		border-radius: 999px;
		background: var(--cream2);
		overflow: hidden;
	}

	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		border-radius: 999px;
		background: var(--green);
		animation: sweep 1.4s ease-in-out infinite;
	}

	@keyframes sweep {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(250%);
		}
	}

	/* A bar that says "still working" without moving, for visitors who asked for
	   no motion. */
	@media (prefers-reduced-motion: reduce) {
		.bar span {
			width: 100%;
			animation: none;
		}
	}

	.advanced {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 13px;
	}

	.advanced summary {
		cursor: pointer;
		color: var(--green);
		font-weight: 600;
	}

	.field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		color: var(--ink);
	}

	.field input {
		width: 84px;
		height: 32px;
		padding: 4px 8px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		box-sizing: border-box;
		font-family: inherit;
		font-size: 13px;
		color: var(--ink);
	}

	.field input:focus {
		border-color: var(--green);
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		cursor: pointer;
	}

	.advanced-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--green);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}
</style>

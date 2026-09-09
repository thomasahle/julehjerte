<!--
  Mal's right column: "Find snit" (docs/redesign/PAINT.md §2).

  One panel with four faces — ask, search, found, failed — because they are one
  conversation and swapping panels under the visitor would lose their place.

  The three symmetry rows used to be one of those faces. They are what the search
  is asked to hold (decision 2), but they are also live while painting — a row
  switched on mirrors every stroke from that moment — so they now stand in their
  own "Symmetri" panel beside the tools that they change. This panel reads them
  from the session, as it always did, and no longer offers to set them.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { ExternalIcon, ScissorsIcon } from '$lib/components/icons';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import {
		ADVANCED_LIMITS,
		clampAdvanced,
		ENGINE_GRACEFUL_STOP,
		type AdvancedNumber,
		type AdvancedSettings
	} from '$lib/inverse/engine';
	import type {
		AttemptState,
		ErrorTrend,
		SearchProgress,
		StageKey
	} from '$lib/paint/searchProgress';
	import { ENGINE_NOTICES_KEY, engineNoticesHref } from '$lib/inverse/notices';
	import type { PaintError, PaintResult, PaintStatus } from '$lib/editor/session.svelte';
	import type { Frame } from '$lib/paint/frame';
	import type { SymmetrySettings } from '$lib/paint/symmetry';

	interface Props {
		/** The rows as they stand, for the notice about the ones the heart lost. */
		symmetry: SymmetrySettings;
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
		/** "Kanten" as the visitor set it, which decides what the numbers mean. */
		frame: Frame;
		/** Whether the found heart is showing the protected outline over it. */
		showMotif: boolean;
		onShowMotif: (next: boolean) => void;
		/** Whole seconds since the search started. */
		elapsed: number;
		/** What the engine is doing, folded out of its progress events. */
		progress: SearchProgress;
		/**
		 * Ask the engine to stop and hand back its best validated candidate.
		 *
		 * Dormant: the button that would call it is drawn only when the engine can
		 * do this (`ENGINE_GRACEFUL_STOP`) *and* somebody passed a handler, and
		 * today neither is true — the only stop there is terminates the worker and
		 * throws the search away. PAINT.md §12 (b) is the contract that would
		 * change that, and it takes both halves: a flag flipped on its own would
		 * draw a button that does nothing.
		 */
		onUseBest?: () => void;
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
		status,
		error,
		result,
		showingResult,
		honoured,
		frame,
		showMotif,
		onShowMotif,
		elapsed,
		progress,
		onUseBest,
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

	/**
	 * Above this share of cells the panel says so: the heart is close, not right.
	 *
	 * 1 % is where the difference stops being arithmetic and becomes something you
	 * can point at. On a printed heart of 400 cells a side, one cell in a hundred
	 * is a seam wide enough to see once the paper is woven — the moment the visitor
	 * would rather be told than left to find out on the table. Under it the panel
	 * says nothing extra, as it always did.
	 *
	 * There is no engine number to borrow here, and it is worth saying which one
	 * this is *not*: `ENFORCE_COST_LIMIT` (0.03, `toHeartDesign.ts`) bounds how far
	 * the symmetry correction may move a design from the uncorrected one. That is a
	 * budget on our own correction, not an allowance on how far the found heart may
	 * sit from the mask the visitor painted, and it says nothing about this number.
	 */
	const MEDIOCRE_MISMATCH = 0.01;

	/**
	 * Every stage the reducer can report, in words.
	 *
	 * `StageKey` is a closed set, so this is exhaustive by type: a stage that
	 * arrives without a sentence has already become `'working'` upstream, and a
	 * stage added there will not compile until it has one here.
	 */
	const STAGES: Record<StageKey, TranslationKey> = {
		working: 'paintStageWorking',
		preprocessing: 'paintStagePreparing',
		directInitializing: 'paintStageSeeding',
		directFitting: 'paintStageFitting',
		directClearance: 'paintStageClearance',
		directRefining: 'paintStageRefining',
		directSharing: 'paintStageSharing',
		directPolishing: 'paintStagePolishing',
		directMatching: 'paintStageMatching',
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

	/**
	 * The word behind the dot, for a screen reader.
	 *
	 * Only the two states the dot alone distinguishes: a waiting row already says
	 * "ikke prøvet" in the text everybody can see, and a second copy of it would
	 * be read out twice in a row — so that one answers null and nothing is drawn.
	 */
	const ATTEMPT_STATES: Record<Exclude<AttemptState, 'waiting'>, TranslationKey> = {
		done: 'paintAttemptDone',
		running: 'paintAttemptRunning'
	};

	function attemptWord(state: AttemptState): TranslationKey | null {
		return state === 'waiting' ? null : ATTEMPT_STATES[state];
	}

	const TRENDS: Record<ErrorTrend, TranslationKey> = {
		falling: 'paintSearchFalling',
		rising: 'paintSearchRising',
		flat: 'paintSearchFlat'
	};

	const FAILURES: Record<PaintError['kind'], TranslationKey> = {
		timeout: 'paintFailedTimeout',
		noSolution: 'paintFailedNoSolution',
		engine: 'paintFailedEngine'
	};

	let searching = $derived(status === 'searching');
	let stageText = $derived(tr(STAGES[progress.stage]));

	// The narrow and wide layouts render this panel in two different places, and
	// only one at a time — but an id in markup outlives that arrangement, and a
	// duplicate one would point both lists' labels at the same heading.
	const attemptsId = $props.id();

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

	/**
	 * The numbers beside the stage, joined into one line.
	 *
	 * PAINT.md §2 asks for "Tilpasser kurverne … 12 s · 4 + 4 strimler · afvigelse
	 * 1,3 % og faldende": the seconds always, then whatever the engine has said so
	 * far. Each part is left out rather than printed empty, because a search that
	 * has not yet chosen its strip counts has nothing true to say about them, and
	 * "0 + 0 strimler" would be a number about nothing.
	 */
	let searchDetails = $derived.by(() => {
		const parts = [t('paintSearchElapsed', lang, { seconds: elapsed })];
		if (progress.counts) {
			parts.push(
				t('paintSearchStrips', lang, {
					left: progress.counts[0],
					right: progress.counts[1]
				})
			);
		}
		if (progress.error !== null) {
			const deviation = t('paintSearchDeviation', lang, {
				percent: decimal(100 * progress.error)
			});
			parts.push(
				progress.errorTrend ? `${deviation} ${tr(TRENDS[progress.errorTrend])}` : deviation
			);
		}
		// The MILP route counts rounds rather than attempts, and its own two
		// numbers say what the fitter's error says: how close it is, and whether it
		// already has something it could hand back.
		if (progress.route === 'milp') {
			if (progress.round !== null) parts.push(t('paintSearchRound', lang, { round: progress.round }));
			if (progress.gap !== null) {
				parts.push(t('paintSearchGap', lang, { percent: decimal(100 * progress.gap) }));
			}
			if (progress.incumbent) parts.push(tr('paintSearchIncumbent'));
		}
		return parts.join(' · ');
	});

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

	/**
	 * The number the visitor should judge the heart by.
	 *
	 * Inside the motif where there is one, over the whole square where there is
	 * not — the same choice the summary line above makes, for the same reason: a
	 * large, accurately woven band dilutes an error in the middle.
	 */
	let difference = $derived(result ? (result.report.motifMismatch ?? result.report.mismatch) : 0);

	/**
	 * The verdict is read off the number the panel prints, not off the raw share.
	 *
	 * The summary rounds to one decimal of a percent, so 0.996 % and 1.004 % both
	 * come out as "1,0%". Comparing the raw fraction gave the second of those the
	 * "close, but not right" line and a third button and the first of them nothing
	 * at all — two hearts showing the same number and disagreeing about it, which
	 * is exactly the confusion the line was added to remove. So the same rounding
	 * that reaches the screen decides.
	 */
	let mediocre = $derived(Math.round(1000 * difference) > 1000 * MEDIOCRE_MISMATCH);

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
		<!-- role="status" on the stage and nowhere else: the search can run for two
		     minutes, and a stage that changes a handful of times is news, while the
		     seconds, the error and the attempts change several times a second and
		     would be read aloud over each other for the whole search. -->
		<div class="progress-row" role="status">
			<ScissorsIcon size={18} />
			<span>{stageText}</span>
		</div>
		<p class="numbers">{searchDetails}</p>
		{#if progress.attempts.length}
			<!-- What the fitter is working through: every strip-count pair it
			     announced, the one it is on marked, and the ones it has finished with
			     their last error. Nothing is invented — a pair the engine has not
			     mentioned is not in the list at all. -->
			<div class="attempts">
				<p class="attempts-title" id={attemptsId}>{tr('paintAttempts')}</p>
				<ul aria-labelledby={attemptsId}>
					{#each progress.attempts as attempt (attempt.counts.join('x'))}
						{@const word = attemptWord(attempt.state)}
						<li class="attempt" class:running={attempt.state === 'running'}>
							<span class="dot {attempt.state}" aria-hidden="true"></span>
							<span class="attempt-counts">
								{t('paintAttemptCounts', lang, {
									left: attempt.counts[0],
									right: attempt.counts[1]
								})}
							</span>
							{#if attempt.error !== null}
								<span class="attempt-error">{decimal(100 * attempt.error)} %</span>
							{:else if attempt.state === 'waiting'}
								<!-- "ikke prøvet", not "venter". The count search announces every
								     pair it scored and `gridFinalists` hands the refiner three of
								     them, so most of a long list is never queued for anything: on
								     the star, eight pairs were announced and five were still on
								     screen, unqueued, when the answer arrived. The row says what is
								     known and makes no promise about what the fitter will do next.
								     The seed error behind it is not printed either: it measures an
								     unrefined uniform grid, which is a third quantity again. -->
								<span class="attempt-error">{tr('paintAttemptWaiting')}</span>
							{/if}
							<!-- The dot is the only thing that tells done from running, so the word
							     it stands for goes where a screen reader will find it. Not on a
							     waiting row: there the visible text is already the word, and both
							     would be read out one after the other. -->
							{#if word}<span class="sr-only">{tr(word)}</span>{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		<div class="bar" role="progressbar" aria-label={tr('paintFindCuts')}>
			<span></span>
		</div>
		<div class="actions">
			<button type="button" class="btn btn-sm btn-outline" onclick={onCancel}>
				{tr('paintCancel')}
			</button>
			{#if ENGINE_GRACEFUL_STOP && onUseBest}
				<!-- Dormant until the engine can stop without throwing the search away
				     (PAINT.md §12 (b)). Written now so the day the message exists this
				     panel needs no new thinking, only the flag and the handler.
				     Both, and that is the point of the second half of the condition: the
				     flag alone would otherwise put a primary button beside Afbryd that
				     does nothing at all, which is worse than no button. -->
				<button type="button" class="btn btn-sm btn-primary" onclick={onUseBest}>
					{tr('paintUseBest')}
				</button>
			{/if}
		</div>
	{:else if showingResult && result}
		<!-- The answer to a wait that may have lasted a minute or two: it has to say
		     so on its own, not only to whoever is watching the panel. -->
		<div class="summary" role="status">
			<p class="lead">{tr('paintFound')}</p>
			{#if result.report.motifMismatch !== undefined}
				<!-- The motif's own difference comes first, and the whole square after
				     it: a large, accurately woven band dilutes an error in the middle,
				     so the middle is the number that says whether this is the heart the
				     visitor painted (docs/inverse/MOTIF-BORDER.md). -->
				<p class="numbers">
					{t('paintFoundMotifSummary', lang, {
						motif: decimal(100 * result.report.motifMismatch),
						mismatch: decimal(100 * result.report.mismatch)
					})}
				</p>
				<p class="numbers">
					{t('paintFoundCuts', lang, {
						left: result.report.cuts[0],
						right: result.report.cuts[1],
						clearance: decimal(result.report.clearanceMm)
					})}
				</p>
			{:else}
				<p class="numbers">
					{t('paintFoundSummary', lang, {
						left: result.report.cuts[0],
						right: result.report.cuts[1],
						clearance: decimal(result.report.clearanceMm),
						mismatch: decimal(100 * result.report.mismatch)
					})}
				</p>
			{/if}
		</div>
		{#if result.report.motifMismatch !== undefined}
			<label class="checkbox">
				<input
					type="checkbox"
					checked={showMotif}
					onchange={(e) => onShowMotif(e.currentTarget.checked)}
				/>
				<span>{tr('paintShowMotif')}</span>
			</label>
		{/if}
		<!-- A percentage is a number, not a verdict: 0.4 % and 1.7 % read the same to
		     anyone who has not woven one of these. Past the threshold the panel says
		     in words that this is close and not right, and names the three things
		     that can be done about it — the mask first and a symmetry second,
		     because those two change what the search is looking for. "Find snit
		     igen" comes last on purpose: it asks the engine the same question over,
		     and while the answer is not bit-identical — the solve is time-budgeted,
		     so the clock decides which incumbent it stops on — it differs by less
		     than the panel prints. Two runs on Uret v2's mask both read "4 + 4 snit
		     · mindst 3,1 mm", with the difference moving between 2,6 % and 2,7 %
		     (PAINT.md §11). So it is worth a press only once something under it has
		     moved. -->
		{#if mediocre}
			<p class="note">{tr('paintFoundMediocre')}</p>
		{/if}
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
			{#if mediocre}
				<!-- Its own line under the other two: "Tilbage til masken" already fills
				     its third of the panel, and a third button beside them would put all
				     three onto two lines each. -->
				<button type="button" class="btn btn-sm btn-ghost again" onclick={onFind}>
					<ScissorsIcon size={16} />
					{tr('paintFindCutsAgain')}
				</button>
			{/if}
		</div>
	{:else}
		{#if status === 'failed' && error}
			<p class="alert" role="alert">
				{tr(FAILURES[error.kind])}
			</p>
		{/if}
		<p class="lead">{tr('paintFindCutsHint')}</p>
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
			{#if frame.mode === 'free'}
				<!-- Only while the band is free: with the band fixed there is no checker
				     to count, and a number that changes nothing is worse than no number. -->
				<label class="field">
					<span>{tr('paintFrameCells')}</span>
					<input
						type="number"
						min={ADVANCED_LIMITS.frameCells[0]}
						max={ADVANCED_LIMITS.frameCells[1]}
						step="1"
						value={advanced.frameCells}
						oninput={(e) => setNumber('frameCells', e.currentTarget.value)}
						onblur={(e) => commitNumber('frameCells', e.currentTarget)}
					/>
				</label>
			{/if}
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
				<!-- The engine is somebody else's work; its licences travel with it.
				     `notices.ts` owns the path and the label, so the obligation the
				     retired generator page carried cannot be dropped by accident. -->
				<a class="link" href={engineNoticesHref()} target="_blank" rel="noopener">
					{tr(ENGINE_NOTICES_KEY)}
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
		flex-wrap: wrap;
		gap: 8px;
	}

	.actions .btn {
		flex: 1 1 0;
	}

	/* Full width, so it wraps onto a line of its own under the two above. */
	.actions .again {
		flex-basis: 100%;
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

	/* The stage line's own numbers, under it rather than beside it: at 340px the
	   sentence PAINT.md asks for runs to two lines whatever is done to it, and
	   this way the words that change every few seconds are the ones that wrap. */
	.progress-row + .numbers {
		font-size: 13px;
		color: var(--muted);
	}

	.attempts {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.attempts-title {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
	}

	.attempts ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.attempt {
		display: grid;
		grid-template-columns: 10px 1fr auto;
		align-items: center;
		gap: 8px;
		padding: 2px 6px;
		border-radius: 6px;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}

	/* The one being worked on, in the panel's own ground and ink rather than a
	   colour of its own: it is the row the eye should land on, and the list is
	   already three shades of one green. */
	.attempt.running {
		background: var(--cream2);
		color: var(--ink);
		font-weight: 600;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--line);
	}

	.dot.done {
		background: var(--green);
	}

	.dot.running {
		background: var(--green);
		box-shadow: 0 0 0 3px rgb(var(--deep-rgb) / 0.12);
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

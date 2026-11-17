<!--
  The weaving film on a heart's page: the heart being cut, woven and hung, in 3D, as a
  recording the visitor can play, scrub and look around in.

  The recording (static/weave/<id>.jhb) is a simulation of the paper made offline
  (scripts/weave); the player that draws it (static/weave/film.js) and three.js are fetched
  with it, in the background by the heart's page (HeartStage) or at the latest when this view
  is first shown ($lib/weave/film). The film never waits for the recording: shown before it has
  arrived, it is the one worked out in the browser, and the recording is used the next time.
  While another view is on the stage the film stays as it is, paused and out of sight (`shown`),
  so coming back shows the same moment at once; after going on to another page and back it is
  opened again at that moment. A heart without a recording (a visitor's own, or one the
  simulator has not made) gets a film worked out in the browser from its cuts, with the same
  steps and simpler movements ($lib/weave/sketch).

  The film is a card filling the stage, kept as plain as the page around it: a band at the top
  names the step, a band at the bottom has play, the position, the speed and full screen, and
  the player keeps the heart between them (`insets`). What happens in the step is written out
  for screen readers only.
  The two papers have the colours the heart has on the page: the header's pair, or the heart's
  own pair in colourful mode, and they follow it when it changes. The film reads them where the
  page's hearts do, from --paper-left / --paper-right, and the captions name the strips by them
  ($lib/weave/papers).

  A drag turns the view (two fingers or shift: move it; pinch: zoom; a double click puts it
  back). Outside full screen a finger moving up or down scrolls the page, and the wheel zooms
  only with ctrl or cmd, so the film never traps the page's scrolling.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import { t, type Language } from '$lib/i18n';
	import { DEFAULT_COLORS } from '$lib/stores/colors';
	import type { HeartDesign } from '$lib/types/heart';
	import { pairAttributes } from '$lib/utils/palette';
	import {
		canPlayWeaveFilm,
		createWeaveFilm,
		keepWeaveFilmPlace,
		preloadWeaveFilm,
		weaveFilmPlace,
		weaveFilmSeconds,
		weaveRecordingReady,
		type WeaveFilmEntry,
		type WeaveFilmPlayer,
		type WeaveStep
	} from '$lib/weave/film';
	import { paperNumber, paperWords, parsePaper, type Rgb } from '$lib/weave/papers';
	import { stepWords } from '$lib/weave/words';

	interface Props {
		/** The heart's id: its recording is static/weave/<id>.jhb. */
		id: string;
		/** The heart's recording; without one the film is worked out here from `design`. */
		entry: WeaveFilmEntry | null;
		design: HeartDesign | null;
		lang: Language;
		/** False while another view is on the stage: the film is kept, paused and out of sight, so coming back shows it at once. */
		shown?: boolean;
	}

	let { id, entry, design, lang, shown = true }: Props = $props();

	// The simulator's red half is the heart's right-hand paper, its white half the left-hand one.
	interface Papers {
		red: Rgb;
		white: Rgb;
	}
	const DEFAULT_PAPERS: Papers = {
		red: parsePaper(DEFAULT_COLORS.right) ?? [185, 19, 19],
		white: parsePaper(DEFAULT_COLORS.left) ?? [255, 255, 255]
	};
	// The simulated weaving is slow and careful; shown this many times faster it keeps the pace
	// of the cutting before it and the hanging after it.
	const WEAVE_PACE = 2.5;
	const SPEEDS = [1, 2, 4, 0.5];

	let stage: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let caption = $state<HTMLDivElement>();
	let bar = $state<HTMLDivElement>();

	let status = $state<'loading' | 'ready' | 'failed' | 'no3d'>('loading');
	let steps = $state<WeaveStep[]>([]);
	let stepIndex = $state(0);
	let time = $state(0);
	let total = $state(0);
	let playing = $state(false);
	let speed = $state(SPEEDS[0]);
	let fullscreen = $state(false);
	let canFullscreen = $state(false);

	let papers = $state<Papers>(DEFAULT_PAPERS);

	let player: WeaveFilmPlayer | null = null;
	/** Whether the film shown is the heart's recording. */
	let recorded = false;
	let gone = false;
	/** Whether the film goes on playing when it comes back into view. */
	let resume = false;
	/** The waiting bar only shows when the film takes a while: with everything fetched it is a flash. */
	let slow = $state(false);

	let paperNames = $derived(paperWords(papers.red, papers.white, lang));
	let words = $derived(steps[stepIndex] ? stepWords(steps[stepIndex], lang, paperNames) : null);

	/** The papers as the page has them now, to the film too if they are new. */
	function readPapers() {
		const style = getComputedStyle(stage);
		const red = parsePaper(style.getPropertyValue('--paper-right')) ?? DEFAULT_PAPERS.red;
		const white = parsePaper(style.getPropertyValue('--paper-left')) ?? DEFAULT_PAPERS.white;
		if (String(red) === String(papers.red) && String(white) === String(papers.white)) return;
		papers = { red, white };
		player?.papers(paperNumber(red), paperNumber(white));
	}

	const clock = (seconds: number) =>
		`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

	async function load() {
		status = 'loading';
		slow = false;
		setTimeout(() => (slow = true), 600);
		// The recording if it is already here; the film never waits for it. Until it has arrived
		// (the page fetches it in the background) the film is worked out here from the cuts.
		const kept = entry && canPlayWeaveFilm(true) ? weaveRecordingReady(id, entry) : null;
		if (!canPlayWeaveFilm(!!kept) || (!kept && !design)) {
			status = 'no3d';
			return;
		}
		if (entry && !kept) preloadWeaveFilm(id, entry);
		recorded = !!kept;
		const drawn = design;
		const recording = kept
			? Promise.resolve(kept)
			: import('$lib/weave/sketch').then(({ designLines, sketchFilm }) =>
					sketchFilm(designLines(drawn!), drawn!.weaveParity ?? 0, WEAVE_PACE)
				);
		// Silenced here, heard below: the player may fail first.
		recording.catch(() => {});
		// A player from before a recording that did not arrive is kept: its canvas takes no second one.
		if (!player) {
			try {
				const made = await createWeaveFilm(
					canvas,
					stage,
					{
						step: (index) => (stepIndex = index),
						time: (seconds) => (time = seconds),
						playing: (now) => (playing = now)
					},
					{ red: paperNumber(papers.red), white: paperNumber(papers.white), weave: WEAVE_PACE }
				);
				if (gone) return made.destroy();
				player = made;
				// The colours may have changed while the player was on its way.
				made.papers(paperNumber(papers.red), paperNumber(papers.white));
			} catch {
				// No WebGL, or the player itself did not arrive.
				if (!gone) status = navigator.onLine === false ? 'failed' : 'no3d';
				return;
			}
		}
		const made = player;
		try {
			const film = await made.open(await recording);
			if (!film || gone) return;
			steps = film.steps;
			total = film.total;
			made.speed(speed);
			status = 'ready';
			// Back from another view: the film goes on from where it was left, playing or not.
			const left = weaveFilmPlace(id);
			const seconds = left ? weaveFilmSeconds(left, film, recorded) : 0;
			if (seconds > 0 && seconds < film.total) made.seek(seconds);
			const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const play = !still && (left?.playing ?? true);
			if (shown) made.play(play);
			else resume = play;
		} catch {
			if (!gone) status = 'failed';
		}
	}

	/** Where the film is now, for coming back to. */
	function place() {
		const start = steps[stepIndex]?.start ?? 0;
		const end = steps[stepIndex + 1]?.start ?? total;
		return {
			seconds: time,
			playing,
			recorded,
			step: stepIndex,
			into: end > start ? Math.min(1, Math.max(0, (time - start) / (end - start))) : 0,
			steps: steps.length,
			total
		};
	}

	onMount(() => {
		canFullscreen = document.fullscreenEnabled === true;
		const onFullscreen = () => (fullscreen = document.fullscreenElement === stage);
		document.addEventListener('fullscreenchange', onFullscreen);
		// The header's colours and the colourful mode both reach the page through <html>'s class
		// and variables (src/routes/+layout.svelte, $lib/stores/colorMode).
		readPapers();
		const onColours = new MutationObserver(readPapers);
		onColours.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style']
		});
		void load();
		return () => {
			gone = true;
			if (status === 'ready') keepWeaveFilmPlace(id, place());
			onColours.disconnect();
			document.removeEventListener('fullscreenchange', onFullscreen);
			player?.destroy();
			player = null;
		};
	});

	// Another view takes the stage: the film stops where it is, and goes on when it is back.
	let wasShown = true;
	$effect(() => {
		const now = shown;
		if (now === wasShown) return;
		wasShown = now;
		if (!now) {
			resume = playing;
			player?.play(false);
		} else if (resume) {
			player?.play(true);
		}
	});

	// The heart is kept clear of the caption and the transport, whatever their height is.
	$effect(() => {
		if (status !== 'ready' || !caption || !bar) return;
		const top = caption;
		const bottom = bar;
		const tell = () => player?.insets(top.offsetHeight + 12, bottom.offsetHeight + 12);
		const observer = new ResizeObserver(tell);
		observer.observe(top);
		observer.observe(bottom);
		tell();
		return () => observer.disconnect();
	});

	function nextSpeed() {
		speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
		player?.speed(speed);
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void stage.requestFullscreen().catch(() => {});
	}
</script>

<div class="film" class:is-away={!shown} class:is-fullscreen={fullscreen} bind:this={stage} {...pairAttributes(id)}>
	<!-- The canvas takes the keyboard itself (arrows turn, + and − zoom, space plays). -->
	<canvas
		bind:this={canvas}
		class:is-ready={status === 'ready'}
		tabindex={status === 'ready' ? 0 : -1}
		aria-label={t('weaveCanvasLabel', lang)}
	></canvas>

	{#if status === 'ready' && words}
		<div class="film-caption" bind:this={caption}>
			<p class="film-count">
				{t('weaveStepOf', lang, { n: stepIndex + 1, total: steps.length })}
			</p>
			<p class="film-title" aria-live="polite">{words.title}<span class="sr-only">. {words.text}</span></p>
		</div>

		<div class="film-bar" bind:this={bar}>
			<button type="button" aria-label={t(playing ? 'weavePause' : 'weavePlay', lang)} onclick={() => player?.toggle()}>
				{#if playing}
					<PauseIcon size={18} fill="currentColor" aria-hidden="true" />
				{:else}
					<PlayIcon size={18} fill="currentColor" aria-hidden="true" />
				{/if}
			</button>
			<span class="film-clock">{clock(time)} / {clock(total)}</span>
			<input
				type="range"
				min="0"
				max={total}
				step="0.05"
				value={time}
				style="--played: {total ? (time / total) * 100 : 0}%"
				aria-label={t('weavePosition', lang)}
				aria-valuetext={`${clock(time)} / ${clock(total)}`}
				oninput={(event) => player?.seek(Number(event.currentTarget.value))}
			/>
			<button type="button" aria-label={`${t('weaveSpeed', lang)}: ${speed}×`} onclick={nextSpeed}>
				{speed === 0.5 ? '½' : speed}×
			</button>
			{#if canFullscreen}
				<button
					type="button"
					aria-label={t(fullscreen ? 'weaveExitFullscreen' : 'weaveFullscreen', lang)}
					onclick={toggleFullscreen}
				>
					{#if fullscreen}
						<MinimizeIcon size={18} aria-hidden="true" />
					{:else}
						<MaximizeIcon size={18} aria-hidden="true" />
					{/if}
				</button>
			{/if}
		</div>
	{:else if status === 'loading' && slow}
		<div class="film-wait" role="status">
			<progress aria-label={t('weaveLoading', lang)}></progress>
		</div>
	{:else if status === 'failed'}
		<div class="film-wait" role="alert">
			<p>{t('weaveLoadError', lang)}</p>
			<button type="button" class="film-retry" onclick={load}>{t('generatorRetry', lang)}</button>
		</div>
	{:else if status === 'no3d'}
		<div class="film-wait" role="alert">
			<p>{t('weaveNo3d', lang)}</p>
		</div>
	{/if}
</div>

<style>
	/* The cutting mat's own green, so the card looks the same before the first frame is drawn. */
	.film {
		--band: rgb(11 33 25 / 0.72);
		--on-mat: #f4f7f2;
		--on-mat-soft: #c9d8cd;
		position: absolute;
		inset: 0;
		border-radius: 12px;
		overflow: hidden;
		background: #163a2d;
		box-shadow: 0 8px 20px var(--shadow-color);
		color: var(--on-mat);
	}

	/* Out of sight but still laid out, so the picture keeps its size. */
	.film.is-away {
		visibility: hidden;
	}

	.film.is-fullscreen {
		border-radius: 0;
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		touch-action: pan-y;
		cursor: grab;
		opacity: 0;
		transition: opacity 0.3s;
	}

	canvas.is-ready {
		opacity: 1;
	}

	canvas:active {
		cursor: grabbing;
	}

	.is-fullscreen canvas {
		touch-action: none;
	}

	/* Inside the card: the page's ring would be cut off by its rounded corners. */
	canvas:focus-visible {
		outline-offset: -4px;
		box-shadow: none;
	}

	/* Two bands across the card, a shade darker than the mat. */
	.film-caption,
	.film-bar {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		background: var(--band);
	}

	.film-caption {
		top: 0;
		gap: 14px;
		/* Room for a title of two lines: the heart does not jump when the step changes. */
		min-height: 56px;
		padding: 8px 18px;
		/* Looking around starts anywhere on the picture, also under the words. */
		pointer-events: none;
	}

	.film-caption p {
		margin: 0;
	}

	.film-count {
		flex: none;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--on-mat-soft);
	}

	.film-title {
		padding-left: 14px;
		border-left: 1px solid rgb(244 247 242 / 0.25);
		font-size: 16px;
		font-weight: 600;
		line-height: 1.25;
	}

	.film-bar {
		bottom: 0;
		gap: 4px;
		padding: 6px 10px;
	}

	.film-bar input {
		flex: 1;
		min-width: 0;
		height: 22px;
		margin: 0 8px;
		background: none;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
	}

	.film-bar input::-webkit-slider-runnable-track {
		height: 2px;
		border-radius: 1px;
		background: linear-gradient(
			to right,
			var(--on-mat) var(--played),
			rgb(244 247 242 / 0.3) var(--played)
		);
	}

	.film-bar input::-moz-range-track {
		height: 2px;
		border-radius: 1px;
		background: linear-gradient(
			to right,
			var(--on-mat) var(--played),
			rgb(244 247 242 / 0.3) var(--played)
		);
	}

	.film-bar input::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 12px;
		height: 12px;
		margin-top: -5px;
		border: 0;
		border-radius: 50%;
		background: var(--on-mat);
	}

	.film-bar input::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: 0;
		border-radius: 50%;
		background: var(--on-mat);
	}

	.film-bar button {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
		padding: 0 6px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: inherit;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.film-bar button:hover {
		background: rgb(244 247 242 / 0.14);
	}

	/* The page's ring is drawn for light ground; here it sits on the dark band. */
	.film-bar button:focus-visible,
	.film-bar input:focus-visible,
	.film-retry:focus-visible {
		outline: 2px solid var(--on-mat);
		outline-offset: 1px;
		box-shadow: none;
	}

	.film-clock {
		margin-left: 4px;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.film-wait {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 24px;
		text-align: center;
		font-size: 15px;
	}

	.film-wait p {
		margin: 0;
	}

	.film-wait progress {
		width: min(60%, 220px);
		height: 6px;
		accent-color: var(--on-mat);
	}

	.film-retry {
		padding: 8px 16px;
		border: 1.5px solid var(--on-mat);
		border-radius: 999px;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.film-retry:hover {
		background: rgb(244 247 242 / 0.14);
	}

	@media (max-width: 599px) {
		.film-caption {
			gap: 10px;
			padding: 8px 12px;
		}

		.film-title {
			padding-left: 10px;
			font-size: 15px;
		}

		.film-bar {
			padding: 4px 6px;
		}
	}
</style>

<!--
  The weaving film on a heart's page: the heart being cut, woven and hung, in 3D, as a
  recording the visitor can play, step through, scrub and look around in.

  The recording (static/weave/<id>.jhb) is a simulation of the paper made offline
  (scripts/weave); the player that draws it (static/weave/film.js) and three.js are fetched
  with it, when this view is first shown, so a heart page pays nothing for the film until
  it is asked for ($lib/weave/film).

  The film is a card filling the stage. The caption (which step, what happens in it) and the
  transport lie over the picture, and the player keeps the heart between them (`insets`).
  The paper is always red and white, whatever the page's paper colours: the captions name the
  strips by those colours.

  A drag turns the view (two fingers or shift: move it; pinch: zoom). Outside full screen a
  finger moving up or down scrolls the page, and the wheel zooms only with ctrl or cmd, so
  the film never traps the page's scrolling.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SkipBackIcon from '@lucide/svelte/icons/skip-back';
	import SkipForwardIcon from '@lucide/svelte/icons/skip-forward';
	import ZoomInIcon from '@lucide/svelte/icons/zoom-in';
	import ZoomOutIcon from '@lucide/svelte/icons/zoom-out';
	import { t, type Language } from '$lib/i18n';
	import {
		canPlayWeaveFilm,
		createWeaveFilm,
		fetchWeaveRecording,
		type WeaveFilmEntry,
		type WeaveFilmPlayer,
		type WeaveStep
	} from '$lib/weave/film';
	import { stepWords } from '$lib/weave/words';

	interface Props {
		/** The heart's id: its recording is static/weave/<id>.jhb. */
		id: string;
		entry: WeaveFilmEntry;
		lang: Language;
	}

	let { id, entry, lang }: Props = $props();

	// The site's red paper (--paper-right), as the player wants a colour.
	const RED = 0xb91313;
	// The simulated weaving is slow and careful; shown this many times faster it keeps the pace
	// of the cutting before it and the hanging after it.
	const WEAVE_PACE = 2.5;
	const SPEEDS = [1, 2, 4, 0.5];

	let stage: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let caption = $state<HTMLDivElement>();
	let bar = $state<HTMLDivElement>();

	let status = $state<'loading' | 'ready' | 'failed' | 'no3d'>('loading');
	let fetched = $state(0);
	let steps = $state<WeaveStep[]>([]);
	let stepIndex = $state(0);
	let time = $state(0);
	let total = $state(0);
	let playing = $state(false);
	let speed = $state(SPEEDS[0]);
	let fullscreen = $state(false);
	let canFullscreen = $state(false);

	let player: WeaveFilmPlayer | null = null;
	let gone = false;

	let words = $derived(steps[stepIndex] ? stepWords(steps[stepIndex], lang) : null);

	const clock = (seconds: number) =>
		`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

	async function load() {
		status = 'loading';
		fetched = 0;
		if (!canPlayWeaveFilm()) {
			status = 'no3d';
			return;
		}
		const recording = fetchWeaveRecording(id, entry, (fraction) => (fetched = fraction));
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
					{ red: RED, weave: WEAVE_PACE }
				);
				if (gone) return made.destroy();
				player = made;
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
			if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) made.play(true);
		} catch {
			if (!gone) status = 'failed';
		}
	}

	onMount(() => {
		canFullscreen = document.fullscreenEnabled === true;
		const onFullscreen = () => (fullscreen = document.fullscreenElement === stage);
		document.addEventListener('fullscreenchange', onFullscreen);
		void load();
		return () => {
			gone = true;
			document.removeEventListener('fullscreenchange', onFullscreen);
			player?.destroy();
			player = null;
		};
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

<div class="film" class:is-fullscreen={fullscreen} bind:this={stage}>
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
			<p class="film-title" aria-live="polite">{words.title}</p>
			<p class="film-text">{words.text}</p>
		</div>

		<div class="film-bar" bind:this={bar}>
			<div class="film-scrub">
				<div class="film-ticks" aria-hidden="true">
					{#each steps as step, index (index)}
						{#if index > 0}
							<span style="left: {(step.start / total) * 100}%"></span>
						{/if}
					{/each}
				</div>
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
			</div>
			<div class="film-buttons">
				<button type="button" aria-label={t('weavePreviousStep', lang)} onclick={() => player?.step(-1)}>
					<SkipBackIcon size={18} aria-hidden="true" />
				</button>
				<button
					type="button"
					class="film-play"
					aria-label={t(playing ? 'weavePause' : 'weavePlay', lang)}
					onclick={() => player?.toggle()}
				>
					{#if playing}
						<PauseIcon size={20} aria-hidden="true" />
					{:else}
						<PlayIcon size={20} aria-hidden="true" />
					{/if}
				</button>
				<button type="button" aria-label={t('weaveNextStep', lang)} onclick={() => player?.step(1)}>
					<SkipForwardIcon size={18} aria-hidden="true" />
				</button>
				<span class="film-clock">{clock(time)} / {clock(total)}</span>
				<span class="film-gap"></span>
				<button
					type="button"
					class="film-speed"
					aria-label={`${t('weaveSpeed', lang)}: ${speed}×`}
					onclick={nextSpeed}
				>
					{speed === 0.5 ? '½' : speed}×
				</button>
				<button type="button" aria-label={t('weaveZoomOut', lang)} onclick={() => player?.zoom(1.2)}>
					<ZoomOutIcon size={18} aria-hidden="true" />
				</button>
				<button type="button" aria-label={t('weaveZoomIn', lang)} onclick={() => player?.zoom(1 / 1.2)}>
					<ZoomInIcon size={18} aria-hidden="true" />
				</button>
				<button type="button" aria-label={t('weaveResetView', lang)} onclick={() => player?.reset()}>
					<RotateCcwIcon size={18} aria-hidden="true" />
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
		</div>
	{:else if status === 'loading'}
		<div class="film-wait" role="status">
			<p>{t('weaveLoading', lang)}</p>
			<progress max="1" value={fetched}></progress>
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
		--glass: rgb(14 40 31 / 0.78);
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

	.film-caption,
	.film-bar {
		position: absolute;
		left: 10px;
		right: 10px;
		border-radius: 10px;
		background: var(--glass);
		backdrop-filter: blur(6px);
	}

	.film-caption {
		top: 10px;
		padding: 9px 14px 10px;
		/* Looking around starts anywhere on the picture, also under the words. */
		pointer-events: none;
	}

	.film-caption p {
		margin: 0;
	}

	.film-count {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--on-mat-soft);
	}

	.film-title {
		font-size: 16px;
		font-weight: 600;
		line-height: 1.3;
	}

	.film-text {
		margin-top: 2px;
		font-size: 13.5px;
		line-height: 1.4;
		color: var(--on-mat-soft);
		/* Room for two lines, as most steps take: the heart does not jump when the step changes.
		   A longer text at a narrow stage grows the caption, and the heart moves clear of it. */
		min-height: calc(2 * 1.4em);
	}

	.film-bar {
		bottom: 10px;
		padding: 6px 8px 6px;
	}

	.film-scrub {
		position: relative;
		height: 22px;
		margin: 0 6px;
	}

	.film-ticks span {
		position: absolute;
		top: 8px;
		width: 2px;
		height: 6px;
		margin-left: -1px;
		border-radius: 1px;
		background: var(--glass);
		pointer-events: none;
		z-index: 1;
	}

	.film-scrub input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		background: none;
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
	}

	.film-scrub input::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			var(--on-mat) var(--played),
			rgb(244 247 242 / 0.3) var(--played)
		);
	}

	.film-scrub input::-moz-range-track {
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			var(--on-mat) var(--played),
			rgb(244 247 242 / 0.3) var(--played)
		);
	}

	.film-scrub input::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		margin-top: -4px;
		border: 0;
		border-radius: 50%;
		background: var(--on-mat);
		position: relative;
		z-index: 2;
	}

	.film-scrub input::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border: 0;
		border-radius: 50%;
		background: var(--on-mat);
	}

	.film-buttons {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.film-buttons button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 34px;
		height: 34px;
		padding: 0 6px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: inherit;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.film-buttons button:hover {
		background: rgb(244 247 242 / 0.14);
	}

	/* The page's ring is drawn for light ground; here it sits on the dark glass. */
	.film-buttons button:focus-visible,
	.film-scrub input:focus-visible,
	.film-retry:focus-visible {
		outline: 2px solid var(--on-mat);
		outline-offset: 1px;
		box-shadow: none;
	}

	.film-buttons .film-play {
		background: var(--on-mat);
		color: #163a2d;
	}

	.film-buttons .film-play:hover {
		background: #ffffff;
	}

	.film-clock {
		margin-left: 8px;
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
		color: var(--on-mat-soft);
		white-space: nowrap;
	}

	.film-gap {
		flex: 1;
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

	/* A phone: the clock gives way first, then the buttons close up. */
	@media (max-width: 599px) {
		.film-caption,
		.film-bar {
			left: 6px;
			right: 6px;
		}

		.film-caption {
			top: 6px;
			padding: 7px 10px 8px;
		}

		.film-bar {
			bottom: 6px;
		}

		.film-title {
			font-size: 15px;
		}

		.film-text {
			font-size: 13px;
		}

		.film-buttons {
			gap: 0;
		}

		.film-clock {
			display: none;
		}
	}
</style>

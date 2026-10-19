<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { GeometryCache, geometryKey } from '$lib/generator/cache';
	import { FIGURE_TEMPLATES, TEXT_TEMPLATES, templateVariants } from '$lib/generator/templates';
	import {
		motifLabel,
		matchingMotifs,
		type CatalogItem
	} from '$lib/generator/catalog';
	import {
		DEFAULT_COLORS,
		DEFAULT_COLORS_HEX,
		getColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import { toHexColors } from '$lib/utils/heartColors';
	import { base } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import GeneratorFrameIcon from '$lib/components/GeneratorFrameIcon.svelte';
	import DesignStart, { type StartArt } from '$lib/components/DesignStart.svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { href, editorHref, otherLanguage } from '$lib/i18n/routes';
	import { pageTitle } from '$lib/seo';
	import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';
	import { handoffToDraw } from '$lib/editor/handoff';
	import { saveUserDesign } from '$lib/stores/collection';
	import { defaults, readGeneratorState, normalizeText, fittedCells, TEXT_LINES, TEXT_LINE_LENGTH, type GeneratorState, frameGap, stripCount, largestScale, SPACED_STYLES, BOARD_STYLES } from '$lib/generator/state';
	import type {
		GeneratorResult,
		GeneratorRequest
	} from '$lib/generator/generate';
	import type { Font, Ring } from '$lib/generator/geometry';
	import {
		DownloadIcon,
		PencilIcon,
		SaveIcon
	} from '$lib/components/icons';
	import { Search as SearchIcon } from '@lucide/svelte';
	let { lang, art }: { lang: Language; art: StartArt } = $props();
	const fonts = [
		['nunito', 'generatorFontNunito'],
		['breeserif', 'generatorFontBree'],
		['oswald', 'generatorFontOswald'],
		['kalam', 'generatorFontHandwriting'],
		['cinzel', 'generatorFontCinzel'],
		['righteous', 'generatorFontRighteous']
	] as const;

	let config = $state<GeneratorState>({ ...defaults });
	let mounted = $state(false),
		catalog = $state<CatalogItem[]>([]),
		query = $state(''),
		limit = $state(24),
		browseAll = $state(false),
		retry = $state(0);
	const cache = new GeometryCache();
	type Failure = { error: string; character?: string };
	type Thumbnail = { result?: GeneratorResult; failure?: Failure };
	let thumbnails = $state<Record<string, Thumbnail>>({});
	const borderNames: Record<GeneratorState['style'], TranslationKey> = {
		rays: 'generatorRays',
		wedges: 'generatorWedges',
		silhouette: 'generatorSilhouette',
		motifs: 'generatorMotifs',
		squares: 'generatorSquareCells',
		board: 'generatorSquareCells',
		check: 'generatorCheck',
		sunburst: 'generatorSunburst',
		fitted: 'generatorFitted',
		corners: 'generatorCorners',
		layers: 'generatorLayers',
		strips: 'generatorStrips'
	};
	const borderLabel = (style: GeneratorState['style']) => t(borderNames[style], lang);
	const textFrameNames: Record<GeneratorState['textFrame'], TranslationKey> = {
		woven: 'generatorDense',
		air: 'generatorAir',
		checkered: 'generatorCheckered',
		circle: 'generatorCircle'
	};
	const cellNames: Record<GeneratorState['cells'], TranslationKey> = {
		square: 'generatorSquareCells',
		letters: 'generatorLetterCells'
	};
	/** Frames drawn around a round centre panel name the circle first. */
	const circled = (style: GeneratorState['style']) =>
		style === 'rays' || style === 'check' || style === 'sunburst' || style === 'board';

	const failures = new GeometryCache<Failure>();
	const errorText = (failure: Failure) => {
		const key: TranslationKey =
			failure.error === 'topology'
				? 'generatorTopologyError'
				: failure.error === 'empty'
					? 'generatorEmptyError'
					: failure.error === 'character'
						? 'generatorCharacterError'
						: 'generatorClearanceError';
		return t(key, lang, { char: failure.character ?? '' });
	};
	const hardToCutText = (letters: string[]) =>
		letters.length
			? t('generatorHardToCutLetters', lang, {
					letters: new Intl.ListFormat(lang, { type: 'conjunction' }).format(
						letters.map((letter) => `“${letter}”`)
					)
				})
			: t('generatorHardToCut', lang);
	let displayed = $state<GeneratorResult | null>(null);
	let result = $state<GeneratorResult | null>(null),
		busy = $state(false),
		error = $state(''),
		notice = $state(''),
		downloadBusy = $state(false),
		loadError = $state(false);
	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let preview = $derived(
		displayed
			? renderHeartSvgMarkup(displayed.design, colors, {
					idPrefix: 'generated-preview'
				})
			: ''
	);
	const currentDesign = () =>
		result
			? {
					...result.design,
					colors: toHexColors(colors, DEFAULT_COLORS_HEX)
				}
			: null;
	/** The preview worker's job and the newest one waiting for it. While a
	 * slider moves, only its latest value waits, and every finished result is
	 * kept, for moving back; a long job for a value already left is abandoned. */
	type Job = { request: GeneratorRequest; key: string; token: number };
	let running: (Job & { started: number }) | null = null,
		waiting: Job | null = null;
	let worker: Worker | null = null,
		revision = 0,
		savedId: string | null = null;
	const ABANDON_MS = 400;
	function startJob(job: Job) {
		if (!worker) {
			worker = new Worker(new URL('../generator/worker.ts', import.meta.url), { type: 'module' });
			worker.onmessage = (e) => finishJob(e.data);
			worker.onerror = () => {
				const failed = running;
				worker?.terminate();
				worker = null;
				running = null;
				if (failed?.token === revision) {
					busy = false;
					error = t('generatorLoadError', lang);
					displayed = null;
				}
				nextJob();
			};
		}
		running = { ...job, started: performance.now() };
		worker.postMessage(job.request);
	}
	function finishJob(data: { result?: GeneratorResult } & Partial<Failure>) {
		const job = running;
		running = null;
		if (job) {
			if (data.result) cache.set(job.key, data.result);
			else failures.set(job.key, data as Failure);
			if (job.token === revision) {
				busy = false;
				if (data.result) {
					result = data.result;
					displayed = data.result;
				} else {
					displayed = null;
					error = errorText(data as Failure);
				}
				// A nearby value finished on the way shows while the newest is prepared.
			} else if (data.result && busy) displayed = data.result;
		}
		nextJob();
	}
	function nextJob() {
		if (running || !waiting) return;
		const job = waiting;
		waiting = null;
		startJob(job);
	}
	function queueJob(job: Job) {
		if (!running) return startJob(job);
		waiting = job;
		setTimeout(() => {
			if (running && running.token !== revision && waiting === job) {
				worker?.terminate();
				worker = null;
				running = null;
				nextJob();
			}
		}, Math.max(0, ABANDON_MS - (performance.now() - running.started)));
	}
	const requests = new Map<string, Promise<unknown>>();
	const asset = async <T,>(path: string): Promise<T> => {
		if (!requests.has(path))
			requests.set(
				path,
				fetch(`${base}/generator/${path}?v=20261014`)
					.then((r) => {
						if (!r.ok) throw new Error('Asset request failed');
						return r.json();
					})
					.catch((e) => {
						requests.delete(path);
						throw e;
					})
			);
		return requests.get(path)! as Promise<T>;
	};
	async function requestFor(
		snapshot: GeneratorState
	): Promise<GeneratorRequest> {
		const request: GeneratorRequest = {
			mode: snapshot.mode as 'figure' | 'text',
			name:
				snapshot.mode === 'text'
					? snapshot.text
					: motifLabel(
							{ id: snapshot.motif, name: snapshot.motif, art: '', box: 24 },
							lang
						),
			// Geometry is colour independent; only the preview reads the footer preference.
			colors: DEFAULT_COLORS_HEX,
			text: snapshot.text,
			frame: snapshot.frame,
			frameSize: snapshot.frameSize,
			scale: snapshot.scale / 100,
			style: snapshot.style,
			textFrame: snapshot.textFrame,
			fittedCells: fittedCells(snapshot),
			gap: frameGap(snapshot),
			board: stripCount(snapshot)
		};
		// A motif on a board keeps the choice its default size made.
		if (snapshot.mode === 'figure' && BOARD_STYLES.includes(snapshot.style))
			request.layout = cache.get(geometryKey({ ...snapshot, scale: defaults.scale }))?.layout;
		if (snapshot.mode === 'text')
			request.font = await asset<Font>(`fonts/${snapshot.font}.json`);
		else
			request.contours = (
				await asset<{ contours: Ring[] }>(`motifs/${snapshot.motif}.json`)
			).contours;
		return request;
	}
	const label = (item: CatalogItem) => motifLabel(item, lang);
	let matches = $derived(matchingMotifs(catalog, query, browseAll));

	onMount(() => {
		colors = getColors();
		const unsubscribe = subscribeColors((next) => {
			colors = next;
		});
		config = readGeneratorState(window.location.hash);
		const mode = new URLSearchParams(window.location.search).get('mode');
		if (mode === 'figure' || mode === 'text') config.mode = mode;
		// A shared link pasted into an open generator changes only the hash.
		// The page's own replaceState below never fires this event.
		const follow = () => (config = readGeneratorState(window.location.hash));
		window.addEventListener('hashchange', follow);
		mounted = true;
		return () => {
			window.removeEventListener('hashchange', follow);
			unsubscribe();
			revision++;
			worker?.terminate();
			worker = null;
			running = waiting = null;
		};
	});
	$effect(() => {
		if (!mounted || config.mode !== 'figure') return;
		void retry;
		let live = true;
		loadError = false;
		asset<CatalogItem[]>('catalog.json')
			.then((items) => {
				if (live) catalog = items;
			})
			.catch(() => {
				if (live) loadError = true;
			});
		return () => {
			live = false;
		};
	});
	$effect(() => {
		if (!mounted) return;
		const snapshot = { ...config };
		const url = new URL(window.location.href);
		url.searchParams.delete('mode');
		url.hash =
			snapshot.mode === 'start'
				? ''
				: 'make=' + encodeURIComponent(JSON.stringify(snapshot));
		// The router finishes mounting after this first effect. Defer one task so
		// direct links can initialise before synchronising their shareable state.
		const timer = setTimeout(() => replaceState(url, {}), 0);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		if (!mounted) return;
		const key = geometryKey(config);
		const snapshot = untrack(() => ({ ...config }));
		void retry;
		// Keep the last preview while calculating, but disable export immediately.
		// Only the newest request may become the downloadable result.
		const token = ++revision;
		waiting = null;
		result = null;
		notice = '';
		error = '';
		savedId = null;
		if (snapshot.mode === 'start') {
			displayed = null;
			busy = false;
			return;
		}
		const cached = cache.get(key);
		if (cached) {
			result = cached;
			displayed = cached;
			busy = false;
			return;
		}
		const failed = failures.get(key);
		if (failed) {
			displayed = null;
			error = errorText(failed);
			busy = false;
			return;
		}
		busy = true;
		requestFor(snapshot)
			.then((request) => {
				if (token === revision) queueJob({ request, key, token });
			})
			.catch(() => {
				if (token === revision) {
					busy = false;
					error = t('generatorLoadError', lang);
					displayed = null;
				}
			});
	});
	// The thumbnails show every frame at the default size, space around the
	// figure and strips, so moving those sliders (or choosing a frame) leaves
	// them alone.
	let thumbnailState = $derived(
		JSON.stringify({
			...config,
			frame: defaults.frame,
			style: defaults.style,
			textFrame: defaults.textFrame,
			frameSize: defaults.frameSize,
			scale: defaults.scale,
			spacing: defaults.spacing,
			strips: defaults.strips
		})
	);
	$effect(() => {
		if (!mounted) return;
		const snapshot: GeneratorState = JSON.parse(thumbnailState);
		const variants = templateVariants(snapshot);
		// Each keeps its last heart until the new one is ready, which then fades in.
		const previous = untrack(() => thumbnails);
		const initial: Record<string, Thumbnail> = {};
		const pending = variants.filter((variant) => {
			const key = geometryKey(variant.state),
				result = cache.get(key),
				failure = failures.get(key);
			initial[variant.id] = result || failure ? { result, failure } : { result: previous[variant.id]?.result };
			return !result && !failure;
		});
		// Small motifs may try several boards; prepare them after the others.
		pending.sort((a, b) => Number(a.state.style === 'motifs') - Number(b.state.style === 'motifs'));
		thumbnails = initial;
		if (busy || snapshot.mode === 'start' || !pending.length) return;
		let live = true;
		let background: Worker | null = null;
		const timer = setTimeout(async () => {
			try {
				const request = await requestFor(snapshot);
				if (!live) return;
				background = new Worker(
					new URL('../generator/worker.ts', import.meta.url),
					{ type: 'module' }
				);
				let index = 0;
				const next = () => {
					if (!live || index >= pending.length) {
						background?.terminate();
						return;
					}
					const { state } = pending[index];
					background!.postMessage({
						...request,
						frame: state.frame,
						style: state.style,
						textFrame: state.textFrame,
						fittedCells: fittedCells(state),
						gap: frameGap(state),
						board: stripCount(state)
					});
				};
				background.onmessage = (e) => {
					if (!live) return;
					const variant = pending[index++],
						key = geometryKey(variant.state);
					const thumb: Thumbnail = e.data.result
						? { result: e.data.result }
						: { failure: e.data };
					if (thumb.result) cache.set(key, thumb.result);
					else failures.set(key, thumb.failure!);
					thumbnails = { ...thumbnails, [variant.id]: thumb };
					next();
				};
				background.onerror = () => background?.terminate();
				next();
			} catch {
				/* Foreground reports asset errors; thumbnails remain neutral. */
			}
			// Once typing pauses and the main preview is done.
		}, 400);
		return () => {
			live = false;
			clearTimeout(timer);
			background?.terminate();
		};
	});
	function chooseMode(mode: GeneratorState['mode']) {
		config.mode = mode;
		query = '';
		browseAll = false;
		limit = 24;
		if (mode === 'start' && mounted) replaceState(href('generator', lang), {});
	}
	async function download() {
		if (!result || downloadBusy) return;
		const design = currentDesign()!;
		downloadBusy = true;
		notice = '';
		try {
			const { downloadPDF } = await import('$lib/pdf/template');
			await downloadPDF(design, { lang });
		} catch {
			notice = t('generatorFailedDownload', lang);
		} finally {
			downloadBusy = false;
		}
	}
	function save() {
		if (!result) return;
		try {
			savedId ??= `user-${crypto.randomUUID()}`;
			saveUserDesign({ ...currentDesign()!, id: savedId });
			notice = t('generatorSaved', lang);
		} catch {
			notice = t('generatorFailedSave', lang);
		}
	}
	function edit() {
		if (result) {
			handoffToDraw(currentDesign()!);
			void goto(editorHref(lang, '?from=session'));
		}
	}
</script>

<svelte:head><title>{pageTitle('generator', lang)}</title></svelte:head>
<PageHeader
	{lang}
	variant={config.mode === 'start' ? 'site' : 'editor'}
	backHref={href('generator', lang)}
	languageUrl={href('generator', otherLanguage(lang)) +
		(config.mode === 'start'
			? ''
			: '#make=' + encodeURIComponent(JSON.stringify(config)))}
	onBack={config.mode === 'start'
		? undefined
		: (e) => {
				e.preventDefault();
				chooseMode('start');
			}}
></PageHeader>
{#if config.mode === 'start'}
	<DesignStart {lang} {art} onchoose={chooseMode} />
{:else}
	<main id="main-content" class="workbench" tabindex="-1">
		<section
			class="panel library"
			aria-label={t(
				config.mode === 'text' ? 'generatorText' : 'generatorFigure',
				lang
			)}
		>
			<div class="mode-tabs">
				<button
					aria-pressed={config.mode === 'figure'}
					onclick={() => chooseMode('figure')}
					>{t('generatorFigures', lang)}</button
				><button
					aria-pressed={config.mode === 'text'}
					onclick={() => chooseMode('text')}
					>{t('generatorLetters', lang)}</button
				>
			</div>
			<h1>
				{t(config.mode === 'text' ? 'generatorText' : 'generatorFigure', lang)}
			</h1>
			{#if config.mode === 'text'}
				<label for="heart-text">{t('generatorName', lang)}</label><textarea
					id="heart-text"
					class="name-input"
					rows={Math.max(3, config.text.split('\n').length)}
					value={config.text}
					oninput={(event) => {
						const value = normalizeText(event.currentTarget.value);
						config.text = value;
						if (event.currentTarget.value !== value)
							event.currentTarget.value = value;
					}}
					autocomplete="off"
					spellcheck="false"></textarea>
				<p class="hint">{t('generatorNameHint', lang, { lines: TEXT_LINES, chars: TEXT_LINE_LENGTH })}</p>
				<div class="examples">
					{#each ['ANNA', 'JUL', 'JULE\nMAND'] as word (word)}<button
							onclick={() => (config.text = word)}>{word}</button
						>{/each}
				</div>
				<h2>{t('generatorFont', lang)}</h2>
				<div class="fonts">
					{#each fonts as [id, key] (id)}<button
							aria-pressed={config.font === id}
							onclick={() => (config.font = id)}
							><img
								src={`${base}/generator/fonts/${id}-sample.svg`}
								width="55"
								height="32"
								alt=""
							/>{t(key, lang)}</button
						>{/each}
				</div>
			{:else}
				<label class="search" for="motif-search"
					><SearchIcon size={18} /><input
						id="motif-search"
						type="search"
						placeholder={t('generatorSearch', lang)}
						aria-label={t('generatorSearch', lang)}
						bind:value={query}
						oninput={() => (limit = 24)}
					/></label
				>
				{#if loadError}<p role="alert">{t('generatorLoadError', lang)}</p>
					<button class="btn btn-outline" onclick={() => retry++}
						>{t('generatorRetry', lang)}</button
					>{/if}
				{#if !query.trim() && !browseAll}<p class="motif-heading">
						{t('generatorChristmasChoices', lang)}
					</p>{/if}
				<div class="motifs">
					{#each matches.slice(0, limit) as item (item.id)}<button
							aria-pressed={config.motif === item.id}
							aria-label={label(item)}
							title={`${label(item)} · ${item.package === 'tabler' ? 'Tabler' : item.package === 'phosphor' ? 'Phosphor' : 'Juleflet'}`}
							onclick={() => (config.motif = item.id)}
							><svg viewBox={`0 0 ${item.box} ${item.box}`} aria-hidden="true"
								>{@html item.art}</svg
							><span>{label(item)}</span></button
						>{/each}
				</div>
				{#if catalog.length && !matches.length}<p>
						{t('generatorNoMatches', lang)}
					</p>{/if}
				{#if matches.length > limit}<button
						class="more"
						onclick={() => (limit += 24)}
						>{t('generatorMore', lang)} ({matches.length})</button
					>{/if}
				{#if !query.trim()}<button
						class="more"
						onclick={() => {
							browseAll = !browseAll;
							limit = 24;
						}}
						>{t(
							browseAll ? 'generatorShowChristmas' : 'generatorBrowseAll',
							lang
						)}</button
					>{/if}
				<a
					class="credit"
					href={`${base}/generator/SOURCES.txt`}
					target="_blank"
					rel="noopener">{t('generatorLibraries', lang)}</a
				>
			{/if}
			<button class="back-start" onclick={() => chooseMode('start')}
				>← {t('generatorOtherStart', lang)}</button
			>
		</section>
		<section
			class="stage"
			aria-label={t('generatorPreview', lang)}
			aria-busy={busy}
		>
			<span class="eyebrow">{t('generatorPreview', lang)}</span>
			<div class="preview" aria-busy={busy}>
				{#if preview}<div
						class="heart-art"
						role="img"
						aria-label={t('generatorPreview', lang) +
							': ' +
							(displayed?.design.name ?? config.text)}
					>
						{@html preview}
					</div>{:else}<div class="placeholder-heart" aria-hidden="true">
						♥
					</div>{/if}
			</div>
			<div class="stage-status" role="status">
				{busy
					? t('generatorWorking', lang)
					: result
						? t('generatorReady', lang)
						: ''}
			</div>
			{#if error}<div class="error" role="alert">{error}</div>{/if}
			{#if result?.hardToCut}<div class="warning" role="status">
					{hardToCutText(result.hardToCut.letters)}
				</div>{/if}
			{#if displayed}<p class="cut-note">
					{t('generatorPureWeave', lang)}
				</p>{/if}
			<p class="fine-note">{t('generatorFine', lang)}</p>
		</section>
		<section
			class="panel settings"
			aria-label={t('generatorPersonalise', lang)}
		>
			<h2>{t('generatorPersonalise', lang)}</h2>
			{#if config.mode === 'figure'}
				<h3>{t('generatorChooseTemplate', lang)}</h3>
				<div class="frame-options">
					{#each FIGURE_TEMPLATES as choice (choice.id)}
						<button
							aria-label={circled(choice.style) ? `${t('generatorCircle', lang)} · ${borderLabel(choice.style)}` : borderLabel(choice.style)}
							aria-pressed={config.style === choice.style}
							title={thumbnails[choice.id]?.failure
								? t('generatorTemplateUnavailable', lang)
								: undefined}
							onclick={() => {
								config.frame = choice.frame;
								config.style = choice.style;
								config.scale = Math.min(config.scale, largestScale(choice.style));
							}}
						>
							<!-- Until the thumbnail is ready, frames without a circle show a square. -->
							<GeneratorFrameIcon
								frame={circled(choice.style) || choice.style === 'layers' ? choice.frame : 'checkered'}
								design={thumbnails[choice.id]?.result?.design}
								{colors}
								unavailable={!!thumbnails[choice.id]?.failure}
							/>
							{#if circled(choice.style)}
								{t('generatorCircle', lang)}<small>{borderLabel(choice.style)}</small>
							{:else}
								{borderLabel(choice.style)}
							{/if}
						</button>
					{/each}
				</div>
				<!-- Every frame takes the motif's size, up to 100% where the frame has room for it (see largestScale), and all but the board frames, whose squares hold the motif, the space around it. -->
				<label class="range-label" for="motif-size"
					>{t('generatorSize', lang)}<output>{config.scale}%</output></label
				><input
					id="motif-size"
					type="range"
					min="45"
					max={largestScale(config.style)}
					step="1"
					bind:value={config.scale}
				/>
				{#if config.style === 'strips'}
					<label class="range-label" for="board-strips"
						>{t('generatorStripCount', lang)}<output>{config.strips} × {config.strips}</output></label
					><input
						id="board-strips"
						type="range"
						min="3"
						max="6"
						step="1"
						bind:value={config.strips}
					/>
				{/if}
				{#if SPACED_STYLES.includes(config.style)}
					<label class="range-label" for="frame-spacing"
						>{t('generatorSpacing', lang)}<output>{config.spacing}%</output></label
					><input
						id="frame-spacing"
						type="range"
						min="0"
						max="15"
						step="1"
						bind:value={config.spacing}
					/>
				{/if}
			{:else}
				<h3>{t('generatorTextFrame', lang)}</h3>
				<div class="frame-options">
					{#each TEXT_TEMPLATES as choice (choice.id)}
						<button
							aria-label={choice.cells ? `${t(textFrameNames[choice.textFrame], lang)} · ${t(cellNames[choice.cells], lang)}` : undefined}
							aria-pressed={config.textFrame === choice.textFrame && (!choice.cells || config.cells === choice.cells)}
							onclick={() => {
								config.textFrame = choice.textFrame;
								if (choice.cells) config.cells = choice.cells;
							}}
						>
							<GeneratorFrameIcon
								frame={choice.textFrame}
								design={thumbnails[choice.id]?.result?.design}
								{colors}
								unavailable={!!thumbnails[choice.id]?.failure}
							/>{t(textFrameNames[choice.textFrame], lang)}{#if choice.cells}<small>{t(cellNames[choice.cells], lang)}</small>{/if}
						</button>
					{/each}
				</div>
				{#if config.textFrame === 'checkered'}<p class="hint">{t('generatorCheckeredHint', lang)}</p>{/if}
			{/if}
			<div class="actions">
				<button
					class="btn btn-primary"
					disabled={!result || busy || downloadBusy}
					onclick={download}
					><DownloadIcon size={18} />{t('generatorDownload', lang)}</button
				>
				<p class="hint">{t('generatorPaperHint', lang)}</p>
				<button
					class="btn btn-outline"
					disabled={!result || busy}
					onclick={save}
					><SaveIcon size={18} />{t('generatorSave', lang)}</button
				>
				<button class="edit-button" disabled={!result || busy} onclick={edit}
					><PencilIcon size={16} />{t('generatorEdit', lang)}</button
				>
				{#if notice}<p role="status" class="notice">{notice}</p>{/if}
			</div>
		</section>
	</main>
	<div class="generator-credit">
		<a
			href="https://cs.au.dk/~gerth/julehjerter/slides.pdf"
			target="_blank"
			rel="noopener">{t('generatorCredits', lang)}</a
		>
		<a href={`${base}/generator/SOURCES.txt`} target="_blank" rel="noopener"
			>{t('generatorSources', lang)}</a
		>
	</div>
{/if}

<style>
	:global(body) {
		background: #f6f5ef;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.13em;
		font-size: 11px;
		font-weight: 800;
		color: #6c8066;
	}
	.workbench {
		display: grid;
		grid-template-columns: 290px minmax(240px, 1fr) 290px;
		gap: 25px;
		max-width: 1510px;
		margin: auto;
		padding: 28px 30px 40px;
		align-items: start;
	}
	.panel {
		background: #fffefa;
		border: 1px solid #dee2d6;
		border-radius: 20px;
		padding: 22px;
		box-shadow: 0 7px 28px #263c2607;
	}
	.panel h1 {
		font-size: 23px;
		line-height: 1.2;
		color: #2f4634;
		margin: 23px 0;
	}
	.panel h2 {
		font-size: 17px;
		margin: 0 0 19px;
		color: #2f4634;
	}
	.panel h3,
	.panel label:not(.search) {
		font-size: 12px;
		font-weight: 800;
		color: #495944;
	}
	.panel h3 {
		margin: 21px 0 11px;
	}
	.mode-tabs,
	.mode-tabs {
		background: #edf0e6;
		padding: 4px;
		border-radius: 11px;
	}
	.mode-tabs button {
		flex: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		padding: 9px;
		font-size: 12px;
		color: #65765c;
		font-weight: 750;
	}
	.mode-tabs button[aria-pressed='true'] {
		background: #fffefa;
		color: #365943;
		box-shadow: 0 2px 7px #263c2610;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		cursor: default;
		opacity: 0.45;
	}
	button:focus-visible,
	a:focus-visible,
	input:focus-visible {
		outline: 3px solid #bd942b;
		outline-offset: 3px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 7px;
		border: 1px solid #d8dece;
		border-radius: 10px;
		padding: 9px;
		color: #64785f;
	}
	.search input {
		min-width: 0;
		width: 100%;
		font-size: 12px;
		background: transparent;
		border: 0;
		outline: none;
	}
	.motifs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 7px;
		margin: 15px 0;
		max-height: 485px;
		overflow: auto;
		padding: 2px;
	}
	.motifs button {
		border: 1px solid #e4e7dc;
		border-radius: 11px;
		background: #fffefa;
		min-width: 0;
		min-height: 78px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		padding: 10px 4px;
		color: #475e45;
	}
	.motifs svg {
		width: 33px;
		height: 33px;
		fill: currentColor;
	}
	.motifs span {
		font-size: 10px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.motifs button[aria-pressed='true'],
	.fonts button[aria-pressed='true'],
	.frame-options button[aria-pressed='true'] {
		border-color: #6d8b56;
		background: #edf3e4;
		color: #314a2c;
		box-shadow: inset 0 0 0 1px #6d8b56;
	}
	.more,
	.back-start,
	.edit-button {
		border: 0;
		background: transparent;
		color: #617c51;
		font-size: 12px;
		font-weight: 700;
		padding: 10px 0;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.credit {
		font-size: 10px;
		color: #84917c;
	}
	.back-start {
		border-top: 1px solid #e8eadd;
		margin-top: 18px;
		padding-top: 19px;
	}
	.name-input {
		resize: vertical;
		line-height: 1.3;
		font-size: 27px;
		letter-spacing: 0.03em;
		font-weight: 750;
		width: 100%;
		border: 1px solid #bdcaaa;
		border-radius: 10px;
		padding: 12px;
		margin: 8px 0;
		color: #354c31;
		background: white;
	}
	.hint {
		font-size: 11px;
		color: #7b8674;
		line-height: 1.6;
		margin: 8px 0 13px;
	}
	.examples {
		display: flex;
		gap: 6px;
		margin-bottom: 23px;
	}
	.examples button {
		background: #eef1e6;
		border: 0;
		border-radius: 6px;
		padding: 5px 10px;
		font-size: 11px;
		color: #5c744c;
	}
	.fonts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.fonts button {
		border: 1px solid #dce2d1;
		background: white;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px;
		gap: 3px;
		color: #4d6243;
		font-size: 11px;
	}
	.fonts img {
		width: 55px;
		height: 32px;
		object-fit: contain;
	}
	.stage {
		position: sticky;
		top: 26px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding-top: 28px;
		min-width: 0;
	}
	.preview {
		width: 100%;
		min-height: 340px;
		display: grid;
		place-items: center;
	}
	.heart-art {
		width: 100%;
		max-width: 540px;
		filter: drop-shadow(0 18px 15px #3b483118);
	}
	.heart-art :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
	.placeholder-heart {
		font-size: 270px;
		line-height: 1.5;
		color: #b72f2b;
	}
	.stage-status {
		font-size: 13px;
		font-weight: 700;
		color: #4c6542;
		min-height: 22px;
	}
	.cut-note {
		font-size: 12px;
		color: #66745e;
		line-height: 1.7;
		max-width: 350px;
	}
	.fine-note {
		font-size: 11px;
		line-height: 1.65;
		color: #8a927f;
		max-width: 350px;
	}
	.error,
	.warning {
		background: #fbefe5;
		border: 1px solid #e0cbb2;
		color: #7a4e30;
		border-radius: 12px;
		padding: 16px;
		font-size: 13px;
		line-height: 1.6;
		max-width: 420px;
	}

	.range-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 22px 0 8px;
	}
	.range-label output {
		font-size: 11px;
		color: #7b8c6b;
	}
	input[type='range'] {
		width: 100%;
		accent-color: #7a8d4d;
	}
	.frame-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.frame-options button {
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--cream);
		padding: 9px 3px;
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.frame-options small {
		display: block;
		font-size: 10px;
		color: var(--ink-light);
		margin-top: 2px;
	}
	.frame-options button:hover {
		border-color: var(--green);
	}
	.frame-options button:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 3px;
	}

	.actions {
		border-top: 1px solid #e3e7d9;
		margin-top: 24px;
		padding-top: 0;
	}
	.actions .btn {
		width: 100%;
		margin-top: 13px;
		font-size: 12px;
		min-height: 43px;
		justify-content: center;
	}
	.notice {
		font-size: 12px;
		line-height: 1.6;
		color: #4d7145;
	}
	.generator-credit {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px 20px;
		max-width: 1100px;
		text-align: center;
		margin: 0 auto 30px;
		padding: 0 25px;
	}
	.generator-credit a {
		color: #8c9683;
		font-size: 10px;
		text-decoration: none;
	}
	@media (min-width: 1150px) {
		.library {
			position: sticky;
			top: 25px;
		}
		.settings {
			position: sticky;
			top: 25px;
		}
	}
	@media (max-width: 1150px) {
		.workbench {
			grid-template-columns: 250px minmax(220px, 1fr);
			gap: 20px;
			padding: 24px 20px;
		}
		.library {
			grid-column: 1;
			grid-row: 1 / span 2;
		}
		.stage {
			grid-column: 2;
			grid-row: 1;
			position: static;
		}
		.settings {
			grid-column: 2;
			grid-row: 2;
		}
		.preview {
			min-height: 270px;
			max-height: 400px;
		}
		.heart-art {
			max-width: 400px;
		}
		.settings .actions {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 650px) {
		.workbench {
			display: flex;
			flex-direction: column;
			padding: 12px 14px;
			gap: 14px;
		}
		.stage {
			order: 0;
			width: 100%;
			padding-top: 14px;
		}
		.stage .eyebrow {
			display: none;
		}
		.preview {
			min-height: 0;
			height: 270px;
		}
		.heart-art {
			max-width: 285px;
		}
		.placeholder-heart {
			font-size: 200px;
		}
		.stage-status {
			font-size: 12px;
		}
		.fine-note {
			display: none;
		}
		.cut-note {
			font-size: 11px;
			margin: 7px 12px;
		}
		.library {
			order: 1;
			width: 100%;
			padding: 18px;
		}
		.settings {
			order: 2;
			width: 100%;
			padding: 18px;
		}
		.motifs {
			grid-template-columns: repeat(4, 1fr);
			max-height: 270px;
		}
		.panel h1 {
			font-size: 21px;
			margin: 17px 0;
		}
	}
</style>

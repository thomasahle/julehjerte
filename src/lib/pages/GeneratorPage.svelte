<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { GeometryCache, geometryKey } from '$lib/generator/cache';
	import { FIGURE_TEMPLATES, TEXT_TEMPLATES, templateVariants } from '$lib/generator/templates';
	import {
		motifGroups,
		motifLabel,
		motifSource,
		matchingMotifs,
		type CatalogItem,
		type MotifGroup
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
	import TemplatePreview from '$lib/components/TemplatePreview.svelte';
	import { lobesShareTemplate } from '$lib/utils/symmetry';
	import DesignStart, { type StartArt } from '$lib/components/DesignStart.svelte';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { href, editorHref, otherLanguage } from '$lib/i18n/routes';
	import { pageTitle } from '$lib/seo';
	import { computeHeartViewBoxFromOverlap, renderHeartSvgMarkup, renderPictureSvgMarkup } from '$lib/rendering/heartSvg';
	import { picture, type Picture } from '$lib/generator/picture';
	import { handoffToDraw } from '$lib/editor/handoff';
	import { saveUserDesign } from '$lib/stores/collection';
	import { defaults, readGeneratorState, normalizeText, fittedCells, TEXT_LINES, TEXT_LINE_LENGTH, type GeneratorState, frameGap, stripCount, stripPlace, stripSide, textRoom, ROOM_RANGE, CELL_FRAMES, largestScale, SPACED_STYLES, BOARD_STYLES } from '$lib/generator/state';
	import { clampPlace } from '$lib/generator/stripFigure';
	import { BOARD_STRIPS, boardStage, type BoardStyle } from '$lib/generator/boardMotif';
	import { isTextFigure } from '$lib/generator/textFigure';
	import {
		SHIPPED,
		familyName,
		fontSample,
		googleFontChoice,
		isGoogleFont,
		loadGoogleFont,
		loadPreview,
		matchingFamilies,
		previewFamily,
		type GoogleFamily
	} from '$lib/generator/googleFonts';
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
		['righteous', 'generatorFontRighteous'],
		['josefinsans', 'generatorFontJosefin'],
		['alfaslabone', 'generatorFontSlab'],
		['bungee', 'generatorFontBlock']
	] as const;
	/** The templates shown below the heart: one where the two lobes share it. */
	const SHARED_LOBES = ['left'] as const, BOTH_LOBES = ['left', 'right'] as const;

	let config = $state<GeneratorState>({ ...defaults });
	let mounted = $state(false),
		catalog = $state<CatalogItem[]>([]),
		query = $state(''),
		limit = $state(24),
		retry = $state(0);
	// The font search over Google Fonts, and the last family chosen there,
	// which keeps a button beside the fonts we ship.
	let fontQuery = $state(''),
		fontLimit = $state(8),
		googleIndex = $state<GoogleFamily[] | null>(null),
		indexError = $state(false),
		googleChoice = $state<string | null>(null),
		googleSample = $state<{ d: string; viewBox: string } | null>(null);
	const cache = new GeometryCache();
	type Failure = { error: string; character?: string };
	type Thumbnail = { result?: GeneratorResult; failure?: Failure; sketch?: Ring[] };
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
		circle: 'generatorCircle',
		strips: 'generatorTextStrips',
		layers: 'generatorLayers'
	};
	const cellNames: Record<GeneratorState['cells'], TranslationKey> = {
		square: 'generatorSquareCells',
		letters: 'generatorLetterCells'
	};
	const GROUP_TITLES: Record<MotifGroup, TranslationKey> = {
		jul: 'generatorChristmasChoices',
		dyr: 'generatorAnimals',
		form: 'generatorShapes'
	};
	/** Frames drawn around a round centre panel name the circle first. */
	const circled = (style: GeneratorState['style']) =>
		style === 'rays' || style === 'check' || style === 'sunburst' || style === 'board';

	const failures = new GeometryCache<Failure>();
	/** A frame's name as the picker shows it, the circle first. */
	const frameName = (style: GeneratorState['style']) =>
		circled(style) ? `${t('generatorCircle', lang)} · ${borderLabel(style)}` : borderLabel(style);
	/** What went wrong, for a figure in the frame it cannot be made in, or a
	 * text in a figure frame. */
	const errorText = (failure: Failure, style?: GeneratorState['style'], textFrame?: GeneratorState['textFrame']) => {
		if (style && failure.error !== 'empty') return t('generatorFrameError', lang, { frame: frameName(style) });
		if (isTextFigure(textFrame) && failure.error !== 'empty' && failure.error !== 'character')
			return t('generatorTextFrameError', lang, { frame: t(textFrameNames[textFrame], lang) });
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
	/** The heart's picture, drawn at once while its cuts are found (see
	 * `$lib/generator/picture`); frames without one keep the last heart. */
	let sketch = $state<Picture | null>(null);
	let preview = $derived(
		busy && sketch
			? renderPictureSvgMarkup(sketch.rings, colors, { idPrefix: 'generated-sketch' })
			: displayed
				? renderHeartSvgMarkup(displayed.design, colors, {
						idPrefix: 'generated-preview'
					})
				: ''
	);
	/** Before there is a text, or while the first picture loads, a plain heart
	 * stands in: the lobes and an empty middle where the weave will go. */
	let blankHeart = $derived(renderPictureSvgMarkup([], colors, { idPrefix: 'generated-blank' }));
	let emptyText = $derived(config.mode === 'text' && !config.text.trim());
	const EXAMPLE_TEXTS = ['ANNA', 'JUL', 'JULE\nMAND'];
	/** The figure in the checks moves up and down the heart's middle when
	 * dragged. A picture's square is 100 units wide, and so is every heart's
	 * in the same framing; on screen the middle is vertical. */
	let draggable = $derived(config.mode === 'figure' && config.style === 'strips');
	/** The strips the frame on a board offers, if it is one, and the strips of
	 * the heart shown for these settings. The letters in the checks offer the
	 * figure in the checks' strips. */
	let boardStrips = $derived(config.mode === 'figure' && config.style in BOARD_STRIPS ? BOARD_STRIPS[config.style as BoardStyle]
		: config.mode === 'text' && config.textFrame === 'strips' ? BOARD_STRIPS.strips : undefined);
	let shownBoard = $derived(!busy && result ? result.board ?? result.design.gridSize.x : undefined);
	/** The numbers of strips a frame on a board offers, as buttons. */
	const stripChoices = ({ min, max, step }: { min: number; max: number; step: number }) =>
		Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step);
	const PICTURE_SIDE = Number(computeHeartViewBoxFromOverlap({ left: 0, top: 0, width: 100, height: 100 }).viewBox.split(' ')[3]);
	let dragging = $state<{ pointer: number; x: number; y: number; place: number; side: number; unitsPerPx: number } | null>(null);
	function startDrag(event: PointerEvent) {
		if (!draggable || event.button !== 0 || !sketch?.bounds) return;
		const art = event.currentTarget as HTMLElement, box = art.getBoundingClientRect();
		dragging = { pointer: event.pointerId, x: event.clientX, y: event.clientY, place: shownPlace, side: config.side ?? 0, unitsPerPx: PICTURE_SIDE / box.height };
		art.setPointerCapture(event.pointerId);
	}
	/** Moves the figure in the checks as near `place` and `side` as it keeps
	 * its size, in quarter steps, so moving back finds the hearts already made. */
	function moveTo(place: number, side: number) {
		if (!sketch?.bounds) return;
		const [nextPlace, nextSide] = clampPlace(sketch.bounds, place, side, .25);
		if (nextPlace !== config.place || nextSide !== (config.side ?? 0)) [config.place, config.side] = [nextPlace, nextSide];
	}
	function drag(event: PointerEvent) {
		if (!dragging || event.pointerId !== dragging.pointer) return;
		// On screen the heart's middle is vertical, its width horizontal.
		moveTo(dragging.place + (event.clientY - dragging.y) * dragging.unitsPerPx, dragging.side + (event.clientX - dragging.x) * dragging.unitsPerPx);
	}
	function endDrag(event: PointerEvent) {
		if (dragging?.pointer === event.pointerId) dragging = null;
	}
	/** Where the figure in the checks is shown, and how far up and down it can
	 * move at its side. */
	let shownPlace = $derived(config.place ?? (busy ? sketch?.place : displayed?.place ?? sketch?.place) ?? 0);
	let placeRange = $derived.by<[number, number]>(() => {
		if (!sketch?.bounds) return [0, 0];
		const { sum, difference } = sketch.bounds, side = config.side ?? 0;
		return [Math.max(sum[0] - side, difference[0] + side), Math.min(sum[1] - side, difference[1] + side)]
			.map(n => Math.round(n * 100) / 100) as [number, number];
	});
	/** The arrow keys move the figure a unit, five with Shift. */
	function nudgePlace(event: KeyboardEvent) {
		const step = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[event.key];
		if (!draggable || !step || !sketch?.bounds) return;
		event.preventDefault();
		const by = event.shiftKey ? 5 : 1;
		moveTo(shownPlace + step[0] * by, (config.side ?? 0) + step[1] * by);
	}
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
	type Job = { request: GeneratorRequest; key: string; token: number; motif?: string };
	/** What the board circle's hearts said of each motif on each board: a size
	 * kept below the one asked for is the largest it takes (the touching
	 * circle, say, for one that cannot be divided), one kept above means it
	 * must be divided; and whether over the corner squares it sat on its
	 * enclosing circle. */
	const boardCircles = new Map<string, 'large' | number>();
	const boardEnclosed = new Map<string, boolean>();
	const boardWhole = new Map<string, boolean>();
	// Past the motif in four's reach a motif's circle is decided apart from
	// the sizes below (see `boardStage`).
	const onBoard = (motif: string, board = 5, scale = .7) => { const stage = boardStage(scale, board); return `${motif}|${board}${stage ? '|' + stage : ''}`; };
	function learn(job: Job, result: GeneratorResult) {
		if (!job.motif || job.request.mode !== 'figure' || job.request.style !== 'board') return;
		const key = onBoard(job.motif, job.request.board, job.request.scale);
		const asked = job.request.scale ?? .7, largest = boardCircles.get(key);
		if (result.scale !== undefined) boardCircles.set(key, result.scale < asked ? result.scale : 'large');
		else if (typeof largest === 'number' && asked > largest) boardCircles.delete(key);
		if ((job.request.scale ?? .7) > .85) boardEnclosed.set(key, !!result.enclosed);
		if ((job.request.scale ?? .7) > .7) boardWhole.set(key, !!result.whole);
	}
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
			if (data.result) {
				cache.set(job.key, data.result);
				learn(job, data.result);
			} else failures.set(job.key, data as Failure);
			if (job.token === revision) {
				busy = false;
				if (data.result) {
					result = data.result;
					displayed = data.result;
				} else {
					displayed = null;
					error = errorText(data as Failure, job.request.mode === 'figure' ? job.request.style : undefined, job.request.textFrame);
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
			// Geometry is colour independent; only the preview reads the header's colour preference.
			colors: DEFAULT_COLORS_HEX,
			text: snapshot.text,
			frame: snapshot.frame,
			frameSize: snapshot.frameSize,
			scale: snapshot.scale / 100,
			style: snapshot.style,
			textFrame: snapshot.textFrame,
			fittedCells: fittedCells(snapshot),
			gap: frameGap(snapshot),
			board: stripCount(snapshot),
			place: stripPlace(snapshot),
			side: stripSide(snapshot),
			room: textRoom(snapshot)
		};
		// A motif on a board keeps the choice its default size made.
		if (snapshot.mode === 'figure' && BOARD_STYLES.includes(snapshot.style))
			request.layout = cache.get(geometryKey({ ...snapshot, scale: defaults.scale }))?.layout;
		if (snapshot.mode === 'text')
			request.font = isGoogleFont(snapshot.font)
				? await loadGoogleFont(snapshot.font)
				: await asset<Font>(`fonts/${snapshot.font}.json`);
		else
			request.contours = (
				await asset<{ contours: Ring[] }>(`motifs/${snapshot.motif}.json`)
			).contours;
		return request;
	}
	const label = (item: CatalogItem) => motifLabel(item, lang);
	let matches = $derived(matchingMotifs(catalog, query));
	let groups = $derived(motifGroups(catalog));
	let fontMatches = $derived(googleIndex ? matchingFamilies(googleIndex, fontQuery) : []);
	/** A family found in the search chooses our own copy of the fonts we ship. */
	const familyChoice = (family: GoogleFamily) => SHIPPED[family[0]] ?? googleFontChoice(family);
	function loadIndex() {
		if (googleIndex) return;
		indexError = false;
		asset<GoogleFamily[]>('google-fonts.json')
			.then((index) => (googleIndex = index))
			.catch(() => (indexError = true));
	}

	$effect(() => {
		if (isGoogleFont(config.font)) googleChoice = config.font;
	});
	$effect(() => {
		if (googleChoice || fontQuery.trim()) untrack(loadIndex);
	});
	$effect(() => {
		const choice = googleChoice;
		if (!choice) return;
		let live = true;
		googleSample = null;
		loadGoogleFont(choice)
			.then((font) => {
				if (live) googleSample = fontSample(font) ?? null;
			})
			.catch(() => {
				/* The heart reports the font that cannot be fetched. */
			});
		return () => {
			live = false;
		};
	});
	// Each family found shows its name in its own letters.
	$effect(() => {
		for (const family of fontMatches.slice(0, fontLimit)) loadPreview(googleFontChoice(family));
	});

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
		sketch = null;
		notice = '';
		error = '';
		savedId = null;
		if (snapshot.mode === 'start' || snapshot.mode === 'text' && !snapshot.text.trim()) {
			displayed = null;
			busy = false;
			return;
		}
		const cached = cache.get(key), failed = cached ? undefined : failures.get(key);
		if (cached) {
			result = cached;
			displayed = cached;
			busy = false;
		} else if (failed) {
			displayed = null;
			error = errorText(failed, snapshot.mode === 'figure' ? snapshot.style : undefined, snapshot.mode === 'text' ? snapshot.textFrame : undefined);
			busy = false;
		} else busy = true;
		// The picture shows while the cuts are found, and tells a drag how far
		// the motif can go.
		requestFor(snapshot)
			.then((request) => {
				if (token !== revision) return;
				// What the default size's heart, once made, tells the picture.
				const made = cache.get(geometryKey({ ...snapshot, scale: defaults.scale, place: undefined, side: undefined }));
				const known = onBoard(snapshot.motif, stripCount(snapshot), request.scale);
				sketch = picture(request, { place: made?.place, board: made?.board ?? made?.design.gridSize.x, circle: boardCircles.get(known),
					enclosed: boardEnclosed.get(known), whole: boardWhole.get(known) }) ?? null;
				if (!cached && !failed) queueJob({ request, key, token, motif: snapshot.motif });
			})
			.catch(() => {
				if (token === revision && !cached && !failed) {
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
			// With no text yet, the frames show the sample text rather than nothing.
			text: config.text.trim() ? config.text : defaults.text,
			frame: defaults.frame,
			style: defaults.style,
			textFrame: defaults.textFrame,
			frameSize: defaults.frameSize,
			scale: defaults.scale,
			spacing: defaults.spacing,
			room: defaults.room,
			strips: defaults.strips,
			board: undefined,
			place: undefined,
			side: undefined
		})
	);
	// A place dragged to belongs to its motif and board: another starts at its own.
	let placeKey: string | null = null;
	$effect(() => {
		if (!mounted) return;
		const key = [config.mode, config.motif, config.style, config.strips].join('|');
		if (placeKey !== null && key !== placeKey) untrack(() => [config.place, config.side] = [undefined, undefined]);
		placeKey = key;
	});
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
		if (snapshot.mode === 'start' || !pending.length) return;
		let live = true;
		// Frames with a picture show it at once, needing no cuts, rather than
		// the last motif's heart; the hearts follow as they are made.
		requestFor(snapshot)
			.then((request) => {
				if (!live) return;
				const sketched = { ...thumbnails };
				for (const { id, state } of pending) {
					const rings = picture(variantRequest(request, state))?.rings;
					if (rings && !sketched[id]?.failure) sketched[id] = { sketch: rings };
				}
				thumbnails = sketched;
			})
			.catch(() => {
				/* Foreground reports asset errors. */
			});
		if (busy)
			return () => {
				live = false;
			};
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
					background!.postMessage(variantRequest(request, pending[index].state));
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
	/** The request for one frame's thumbnail, the page's request in that frame. */
	function variantRequest(request: GeneratorRequest, state: GeneratorState): GeneratorRequest {
		return {
			...request,
			frame: state.frame,
			style: state.style,
			textFrame: state.textFrame,
			fittedCells: fittedCells(state),
			gap: frameGap(state),
			board: stripCount(state),
			place: stripPlace(state),
			side: stripSide(state),
			room: textRoom(state)
		};
	}
	function chooseMode(mode: GeneratorState['mode']) {
		config.mode = mode;
		query = '';
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
	languageUrl={href('generator', otherLanguage(lang)) +
		(config.mode === 'start'
			? ''
			: '#make=' + encodeURIComponent(JSON.stringify(config)))}
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
					placeholder={t('generatorTextPlaceholder', lang)}
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
					{#each EXAMPLE_TEXTS as word (word)}<button
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
					{#if googleChoice}{@const choice = googleChoice}<button
							aria-pressed={config.font === choice}
							onclick={() => (config.font = choice)}
							>{#if googleSample}<svg
									viewBox={googleSample.viewBox}
									width="55"
									height="32"
									aria-hidden="true"
									><path d={googleSample.d} fill="#40573c" fill-rule="evenodd" /></svg
								>{:else}<span class="sample-wait" aria-hidden="true"></span>{/if}<span class="family"
								>{familyName(choice, googleIndex ?? [])}</span
							></button
						>{/if}
				</div>
				<label class="search font-search" for="font-search"
					><SearchIcon size={18} /><input
						id="font-search"
						type="search"
						placeholder={t('generatorFontSearch', lang)}
						aria-label={t('generatorFontSearch', lang)}
						bind:value={fontQuery}
						onfocus={loadIndex}
						oninput={() => (fontLimit = 8)}
					/></label
				>
				{#if fontQuery.trim()}
					{#if indexError}<p role="alert">{t('generatorLoadError', lang)}</p>
						<button class="btn btn-outline" onclick={loadIndex}>{t('generatorRetry', lang)}</button>{/if}
					<div class="font-results">
						{#each fontMatches.slice(0, fontLimit) as family (family[0])}<button
								aria-pressed={config.font === familyChoice(family)}
								onclick={() => (config.font = familyChoice(family))}
								style:font-family={`"${previewFamily(googleFontChoice(family))}", system-ui, sans-serif`}
								>{family[1]}</button
							>{/each}
					</div>
					{#if googleIndex && !fontMatches.length}<p class="search-hint">
							{t('generatorFontNoMatches', lang)}
						</p>{/if}
					{#if fontMatches.length > fontLimit}<button class="more" onclick={() => (fontLimit += 8)}
							>{t('generatorMoreFonts', lang)} ({fontMatches.length})</button
						>{/if}
					<p class="search-hint">{t('generatorFontSearchHint', lang)}</p>
				{/if}
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
				<div class="motif-list">
					{#if query.trim()}<div class="motifs">
							{#each matches.slice(0, limit) as item (item.id)}{@render motifButton(
									item
								)}{/each}
						</div>
						{#if catalog.length && !matches.length}<p>
								{t('generatorNoMatches', lang)}
							</p>{/if}
						{#if matches.length > limit}<button
								class="more"
								onclick={() => (limit += 24)}
								>{t('generatorMore', lang)} ({matches.length})</button
							>{/if}
					{:else}{#each groups as { group, items } (group)}<h2 class="motif-heading">
								{t(GROUP_TITLES[group], lang)}
							</h2>
							<div class="motifs">
								{#each items as item (item.id)}{@render motifButton(item)}{/each}
							</div>{/each}
						{#if catalog.length}<p class="search-hint">
								{t('generatorSearchMore', lang)}
							</p>{/if}
					{/if}
				</div>
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
				{#if preview && draggable}<div
						class="heart-art draggable"
						class:dragging={!!dragging}
						role="slider"
						tabindex="0"
						aria-orientation="vertical"
						aria-label={t('generatorPlaceLabel', lang)}
						aria-valuemin={placeRange[0]}
						aria-valuemax={placeRange[1]}
						aria-valuenow={shownPlace}
						onkeydown={nudgePlace}
						onpointerdown={startDrag}
						onpointermove={drag}
						onpointerup={endDrag}
						onpointercancel={endDrag}
					>
						{@html preview}
					</div>{:else if preview}<div
						class="heart-art"
						role="img"
						aria-label={t('generatorPreview', lang) +
							': ' +
							(displayed?.design.name ?? config.text)}
					>
						{@html preview}
					</div>{:else}<div class="heart-art blank" aria-hidden="true">
						{@html blankHeart}
					</div>{/if}
			</div>
			<div class="stage-status" role="status">
				{emptyText
					? t('generatorEmptyText', lang)
					: busy
						? t('generatorWorking', lang)
						: result
							? t('generatorReady', lang)
							: ''}
			</div>
			{#if emptyText}<div class="examples start-examples">
					{#each EXAMPLE_TEXTS as word (word)}<button
							onclick={() => (config.text = word)}>{word}</button
						>{/each}
				</div>{/if}
			{#if error}<div class="error" role="alert">{error}</div>{/if}
			{#if result?.hardToCut}<div class="warning" role="status">
					{hardToCutText(result.hardToCut.letters)}
				</div>{/if}
			{#if draggable && preview}<p class="drag-hint">
					{t('generatorDragFigure', lang)}{#if config.place !== undefined || config.side !== undefined}
						<button class="place-back" onclick={() => ([config.place, config.side] = [undefined, undefined])}>{t('generatorPlaceBack', lang)}</button>{/if}
				</p>{/if}
			<!-- The cutting templates of the heart shown, so the visitor can judge
			     how much cutting a design asks for, and simplify it if need be:
			     one when the two lobes share it. -->
			{#if displayed}{@const shared = lobesShareTemplate(displayed.design.fingers, displayed.design.gridSize)}
				<div class="templates" role="group" aria-label={t('generatorTemplates', lang)}>
					<span class="templates-label">{t('generatorTemplates', lang)}</span>
					<div class="template-row">
						{#each shared ? SHARED_LOBES : BOTH_LOBES as lobe (lobe)}
							<figure class="template">
								<TemplatePreview design={displayed.design} {lobe} size={220} marks={false} />
								<figcaption>{shared ? t('template', lang) : t(lobe === 'left' ? 'templateLeft' : 'templateRight', lang)}</figcaption>
							</figure>
						{/each}
					</div>
				</div>
				<p class="cut-note">
					{t('generatorPureWeave', lang)}
				</p>{/if}
			<p class="fine-note">{t('generatorFine', lang)}</p>
		</section>
		<section
			class="panel settings"
			aria-label={t('generatorPersonalise', lang)}
		>
			<h2>{t('generatorPersonalise', lang)}</h2>
			<!-- The strips of a frame on a board, as buttons: the figure's frames on a board, and the letters in the checks. -->
			{#snippet stripButtons()}
				{#if boardStrips}{@const asked = stripCount(config)}{@const strips = asked ?? shownBoard ?? boardStrips.initial}
					<span class="range-label" id="board-strips">{t('generatorStripCount', lang)}</span>
					<div class="strip-choices" role="group" aria-labelledby="board-strips">
						{#each stripChoices(boardStrips) as n (n)}
							<button
								type="button"
								aria-pressed={strips === n}
								onclick={() => {
									if (config.mode === 'figure' && config.style === 'strips') config.strips = n;
									else config.board = n;
								}}>{n} × {n}</button
							>
						{/each}
					</div>
					{#if asked !== undefined && shownBoard !== undefined && shownBoard !== asked}<p class="hint" role="status">
							{t('generatorStripsKept', lang, { asked: String(asked), kept: String(shownBoard) })}
						</p>{/if}
				{/if}
			{/snippet}
			{#if config.mode === 'figure'}
				<h3>{t('generatorChooseTemplate', lang)}</h3>
				<div class="frame-options">
					{#each FIGURE_TEMPLATES as choice (choice.id)}
						<button
							aria-label={frameName(choice.style)}
							aria-pressed={config.style === choice.style}
							title={thumbnails[choice.id]?.failure
								? t('generatorTemplateUnavailable', lang)
								: undefined}
							onclick={() => {
								// The small motifs and equal squares choose their own boards again.
								if (choice.style !== config.style) config.board = undefined;
								config.frame = choice.frame;
								config.style = choice.style;
								config.scale = Math.min(config.scale, largestScale(choice.style));
							}}
						>
							<!-- Until the thumbnail is ready, frames without a circle show a square. -->
							<GeneratorFrameIcon
								frame={circled(choice.style) || choice.style === 'layers' ? choice.frame : 'checkered'}
								design={thumbnails[choice.id]?.result?.design}
								sketch={thumbnails[choice.id]?.sketch}
								{colors}
								unavailable={!!thumbnails[choice.id]?.failure}
							/>
							{#if circled(choice.style)}
								{t('generatorCircle', lang)}<small>{borderLabel(choice.style)}</small>
							{:else}
								{borderLabel(choice.style)}
							{/if}
							{#if thumbnails[choice.id]?.failure}<small class="unavailable-note">{t('generatorFrameUnavailable', lang)}</small>{/if}
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
				{#if result?.scale !== undefined && Math.round(result.scale * 100) !== config.scale}<p class="hint" role="status">
						{t('generatorSizeKept', lang, { asked: String(config.scale), kept: String(Math.round(result.scale * 100)) })}
					</p>{/if}
				{@render stripButtons()}
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
							aria-pressed={config.textFrame === choice.textFrame && (!choice.cells || config.cells === choice.cells)}
							onclick={() => {
								// The letters in the checks choose their own board again.
								if (choice.textFrame !== config.textFrame) config.board = undefined;
								config.textFrame = choice.textFrame;
								if (choice.cells) config.cells = choice.cells;
							}}
						>
							<GeneratorFrameIcon
								frame={choice.textFrame === 'layers' ? 'circle' : choice.textFrame}
								design={thumbnails[choice.id]?.result?.design}
								sketch={thumbnails[choice.id]?.sketch}
								{colors}
								unavailable={!!thumbnails[choice.id]?.failure}
							/>{choice.cells ? t(cellNames[choice.cells], lang) : t(textFrameNames[choice.textFrame], lang)}
							{#if thumbnails[choice.id]?.failure}<small class="unavailable-note">{t('generatorTextUnavailable', lang)}</small>{/if}
						</button>
					{/each}
				</div>
				{#if CELL_FRAMES.includes(config.textFrame)}
					<label class="range-label" for="text-room"
						>{t('generatorTextSpacing', lang)}<output>{config.room}%</output></label
					><input
						id="text-room"
						type="range"
						min={ROOM_RANGE[0]}
						max={ROOM_RANGE[1]}
						step="1"
						bind:value={config.room}
					/>
				{/if}
				{#if config.textFrame === 'checkered'}<p class="hint">{t('generatorCheckeredHint', lang)}</p>{/if}
				{@render stripButtons()}
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

{#snippet motifButton(item: CatalogItem)}<button
		aria-pressed={config.motif === item.id}
		aria-label={label(item)}
		title={`${label(item)} · ${motifSource(item)}`}
		onclick={() => (config.motif = item.id)}
		><svg viewBox={`0 0 ${item.box} ${item.box}`} aria-hidden="true"
			>{@html item.art}</svg
		><span>{label(item)}</span></button
	>{/snippet}

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
	.panel label:not(.search),
	.panel .range-label {
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
	.motif-list {
		margin: 15px 0;
		max-height: 485px;
		overflow: auto;
		padding: 2px;
	}
	.motifs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 7px;
	}
	.panel .motif-heading {
		font-size: 12px;
		font-weight: 800;
		color: #495944;
		margin: 17px 0 9px;
	}
	.panel .motif-heading:first-child {
		margin-top: 0;
	}
	.search-hint {
		font-size: 11px;
		color: #6f7d68;
		margin: 14px 0 0;
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
	.fonts img,
	.fonts svg,
	.sample-wait {
		width: 55px;
		height: 32px;
		object-fit: contain;
	}
	.fonts .family {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.font-search {
		margin-top: 10px;
	}
	.font-results {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 8px;
	}
	.font-results button {
		border: 1px solid #dce2d1;
		background: white;
		border-radius: 10px;
		padding: 8px 12px;
		text-align: left;
		font-size: 19px;
		line-height: 1.25;
		color: #354c31;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.font-results button[aria-pressed='true'] {
		border-color: #6d8b56;
		background: #edf3e4;
		box-shadow: inset 0 0 0 1px #6d8b56;
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
	.heart-art.draggable {
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.heart-art.dragging {
		cursor: grabbing;
	}
	.drag-hint {
		font-size: 12px;
		color: #66745e;
	}
	.place-back {
		margin-left: 6px;
		padding: 0;
		border: 0;
		background: none;
		color: #4c6542;
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
	.heart-art.blank {
		opacity: 0.55;
	}
	.start-examples {
		justify-content: center;
		margin: 10px 0 0;
	}
	.stage-status {
		font-size: 13px;
		font-weight: 700;
		color: #4c6542;
		min-height: 22px;
	}
	.templates {
		width: 100%;
		max-width: 540px;
		margin: 18px 0 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.templates-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #66745e;
	}
	.template-row {
		display: flex;
		justify-content: center;
		gap: 12px;
		width: 100%;
	}
	.template {
		margin: 0;
		flex: 0 1 220px;
		min-width: 0;
		background: #fffdf8;
		border: 1px solid #e3e0d4;
		border-radius: 12px;
	}
	.template :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
	.template figcaption {
		font-size: 11px;
		color: #66745e;
		padding-bottom: 8px;
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
	.frame-options .unavailable-note {
		color: #9a6a52;
	}
	/* The strips per side, as the Escher tab offers its sizes. */
	.strip-choices {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	.strip-choices button {
		padding: 7px 0;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--cream);
		color: var(--ink);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.strip-choices button:hover {
		border-color: var(--green);
	}
	.strip-choices button:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.strip-choices button[aria-pressed='true'] {
		border-color: #6d8b56;
		background: #edf3e4;
		color: #314a2c;
		box-shadow: inset 0 0 0 1px #6d8b56;
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
		.stage-status {
			font-size: 12px;
		}
		.fine-note {
			display: none;
		}
		.templates {
			margin-top: 12px;
		}
		.template {
			flex-basis: 150px;
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
		}
		.motif-list {
			max-height: 270px;
		}
		.panel h1 {
			font-size: 21px;
			margin: 17px 0;
		}
	}
</style>

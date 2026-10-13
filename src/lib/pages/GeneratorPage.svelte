<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { GeometryCache, geometryKey } from '$lib/generator/cache';
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
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { href, editorHref, otherLanguage } from '$lib/i18n/routes';
	import { pageTitle } from '$lib/seo';
	import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';
	import { handoffToDraw } from '$lib/editor/handoff';
	import { saveUserDesign } from '$lib/stores/collection';
	import {
		defaults,
		readGeneratorState,
		type GeneratorState
	} from '$lib/generator/state';
	import type {
		GeneratorResult,
		GeneratorRequest
	} from '$lib/generator/generate';
	import type { Font, Ring } from '$lib/generator/geometry';
	import {
		ArrowRightIcon,
		DownloadIcon,
		PencilIcon,
		SaveIcon
	} from '$lib/components/icons';
	import { Search as SearchIcon } from '@lucide/svelte';
	let { lang }: { lang: Language } = $props();
	type CatalogItem = { id: string; name: string; art: string; box: number };
	const fonts = [
		['nunito', 'generatorFontNunito'],
		['breeserif', 'generatorFontBree'],
		['oswald', 'generatorFontOswald'],
		['kalam', 'generatorFontHandwriting'],
		['cinzel', 'generatorFontCinzel'],
		['righteous', 'generatorFontRighteous']
	] as const;
	const frames = [
		['circle', 'generatorCircle'],
		['diamond', 'generatorDiamond'],
		['hexagon', 'generatorHexagon'],
		['oval', 'generatorOval'],
		['rounded', 'generatorRounded'],
		['scalloped', 'generatorScalloped']
	] as const;
	const localNames: Record<string, [string, string]> = {
		star: ['Stjerne', 'star jul'],
		tree: ['Juletræ', 'christmas tree gran jul'],
		heart: ['Hjerte', 'heart kærlighed'],
		circle: ['Cirkel', 'circle form'],
		flower: ['Blomst', 'flower natur'],
		snow: ['Snefnug', 'snowflake jul vinter'],
		moon: ['Måne', 'moon nat'],
		house: ['Hus', 'house hjem'],
		angel: ['Engel', 'angel jul'],
		bell: ['Klokke', 'bell jul'],
		gift: ['Gave', 'gift jul'],
		diamond: ['Rude', 'diamond form'],
		'ph-cat': ['Kat', 'cat katte killing dyr'],
		'ph-dog': ['Hund', 'dog hunde dyr'],
		'ph-bird': ['Fugl', 'bird fugle dyr'],
		'ph-butterfly': ['Sommerfugl', 'butterfly dyr natur'],
		'ph-horse': ['Hest', 'horse pony dyr'],
		'ph-rabbit': ['Kanin', 'rabbit hare dyr'],
		'ph-fish': ['Fisk', 'fish hav dyr'],
		'ph-paw-print': ['Pote', 'paw hund kat dyr'],
		'ph-tree-evergreen': ['Grantræ', 'evergreen juletræ gran jul natur'],
		'ph-coffee': ['Kaffe', 'coffee kop hverdag'],
		'ph-bicycle': ['Cykel', 'bicycle cykler sport'],
		'ph-sailboat': ['Sejlbåd', 'sailboat båd ferie'],
		'ph-flower-tulip': ['Tulipan', 'tulip blomst natur'],
		'ph-crown': ['Krone', 'crown konge dronning'],
		'ph-snowflake': ['Snefnug', 'snowflake jul sne'],
		'ph-music-notes': ['Noder', 'music musik node'],
		'ph-sun': ['Sol', 'sun natur'],
		'ph-leaf': ['Blad', 'leaf blade natur']
	};
	let config = $state<GeneratorState>({ ...defaults });
	let mounted = $state(false),
		catalog = $state<CatalogItem[]>([]),
		query = $state(''),
		limit = $state(24),
		retry = $state(0);
	const cache = new GeometryCache();
	type Failure = { error: string; character?: string };
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
					colors: toHexColors(colors, DEFAULT_COLORS_HEX),
					templateWidthMm: config.paperWidth
				}
			: null;
	let workerPending = false;
	let worker: Worker | null = null,
		revision = 0,
		savedId: string | null = null;
	const requests = new Map<string, Promise<unknown>>();
	const asset = async <T,>(path: string): Promise<T> => {
		if (!requests.has(path))
			requests.set(
				path,
				fetch(`${base}/generator/${path}`)
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
	const label = (item: CatalogItem) =>
		lang === 'da'
			? (localNames[item.id]?.[0] ?? item.name)
			: item.id.replace(/^ph-/, '').replaceAll('-', ' ');
	const normal = (s: string) =>
		s
			.toLocaleLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	let matches = $derived(
		catalog.filter((item) =>
			normal(
				`${item.id} ${item.name} ${localNames[item.id]?.join(' ') ?? ''}`
			).includes(normal(query.trim()))
		)
	);
	onMount(() => {
		colors = getColors();
		const unsubscribe = subscribeColors((next) => {
			colors = next;
		});
		config = readGeneratorState(window.location.hash);
		const mode = new URLSearchParams(window.location.search).get('mode');
		if (mode === 'figure' || mode === 'text') config.mode = mode;
		mounted = true;
		return () => {
			unsubscribe();
			revision++;
			worker?.terminate();
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
		if (workerPending) {
			worker?.terminate();
			worker = null;
			workerPending = false;
		}
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
		const timer = setTimeout(async () => {
			try {
				const request: GeneratorRequest = {
					mode: snapshot.mode as 'figure' | 'text',
					name:
						snapshot.mode === 'text'
							? snapshot.text
							: (localNames[snapshot.motif]?.[lang === 'da' ? 0 : 1]
									?.split(' ')
									.slice(0, lang === 'da' ? 99 : 1)
									.join(' ') ?? snapshot.motif.replace(/^ph-/, '')),
					// Geometry is colour independent; only the preview reads the footer preference.
					colors: DEFAULT_COLORS_HEX,
					text: snapshot.text,
					frame: snapshot.frame,
					frameSize: snapshot.frameSize,
					scale: snapshot.scale / 100,
					style: snapshot.style,
					textFrame: snapshot.textFrame,
					paperWidth: 100
				};
				if (snapshot.mode === 'text')
					request.font = await asset<Font>(`fonts/${snapshot.font}.json`);
				else
					request.contours = (
						await asset<{ contours: Ring[] }>(`motifs/${snapshot.motif}.json`)
					).contours;
				if (token !== revision) return;
				worker ??= new Worker(
					new URL('../generator/worker.ts', import.meta.url),
					{ type: 'module' }
				);
				worker.onmessage = (e) => {
					if (token !== revision) return;
					busy = false;
					workerPending = false;
					if (e.data.result) {
						result = e.data.result;
						displayed = e.data.result;
						cache.set(key, e.data.result);
					} else {
						displayed = null;
						failures.set(key, e.data);
						error = errorText(e.data);
					}
				};
				worker.onerror = () => {
					if (token === revision) {
						busy = false;
						error = t('generatorLoadError', lang);
						displayed = null;
						worker?.terminate();
						worker = null;
						workerPending = false;
					}
				};
				workerPending = true;
				worker.postMessage(request);
			} catch {
				if (token === revision) {
					busy = false;
					error = t('generatorLoadError', lang);
					displayed = null;
				}
			}
		}, 60);
		return () => {
			clearTimeout(timer);
		};
	});
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
			const { downloadSizedPDF } = await import('$lib/pdf/template');
			await downloadSizedPDF(design, config.paperWidth, lang);
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
	<main id="main-content" class="start" tabindex="-1">
		<div class="eyebrow">{t('generatorTitle', lang)}</div>
		<h1>{t('generatorStart', lang)}</h1>
		<p class="lede">{t('generatorIntro', lang)}</p>
		<div class="start-grid">
			<button class="start-card featured" onclick={() => chooseMode('figure')}
				><div class="card-art figures" aria-hidden="true">
					★ <span>♥</span> ✦
				</div>
				<h2>{t('generatorFigure', lang)}</h2>
				<p>{t('generatorFigureHint', lang)}</p>
				<ArrowRightIcon /></button
			>
			<button class="start-card featured" onclick={() => chooseMode('text')}
				><div class="card-art lettering" aria-hidden="true">
					ANNA<span>♥</span>
				</div>
				<h2>{t('generatorText', lang)}</h2>
				<p>{t('generatorTextHint', lang)}</p>
				<ArrowRightIcon /></button
			>
			{#each [['generatorTemplate', 'generatorTemplateHint', 'home', '▧'], ['generatorPicture', 'generatorPictureHint', 'paint', '▨'], ['generatorPaint', 'generatorPaintHint', 'paint', '✎'], ['generatorDraw', 'generatorDrawHint', 'editor', '⌘']] as const as choice (choice[0])}
				<a class="start-card small" href={href(choice[2], lang)}
					><span class="small-art" aria-hidden="true">{choice[3]}</span>
					<h2>{t(choice[0], lang)}</h2>
					<p>{t(choice[1], lang)}</p>
					<ArrowRightIcon /></a
				>
			{/each}
		</div>
	</main>
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
				<label for="heart-text">{t('generatorName', lang)}</label><input
					id="heart-text"
					class="name-input"
					type="text"
					maxlength="10"
					bind:value={config.text}
					autocomplete="off"
					spellcheck="false"
				/>
				<p class="hint">{t('generatorNameHint', lang)}</p>
				<div class="examples">
					{#each ['ANNA', 'JUL', 'ÅSE'] as word (word)}<button
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
				<div class="motifs">
					{#each matches.slice(0, limit) as item (item.id)}<button
							aria-pressed={config.motif === item.id}
							aria-label={label(item)}
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
				<a
					class="credit"
					href={`${base}/generator/phosphor-LICENSE.txt`}
					target="_blank"
					rel="noopener">Phosphor · MIT</a
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
				<h3>{t('generatorFrame', lang)}</h3>
				<div class="frame-options">
					{#each frames as frame (frame[0])}
						<button
							aria-pressed={config.frame === frame[0]}
							onclick={() => (config.frame = frame[0])}
						>
							<GeneratorFrameIcon frame={frame[0]} />{t(frame[1], lang)}
						</button>
					{/each}
				</div>
				<label class="range-label" for="frame-size"
					>{t('generatorFrameSize', lang)}<output>{config.frameSize}%</output
					></label
				><input
					id="frame-size"
					type="range"
					min="50"
					max="80"
					step="1"
					bind:value={config.frameSize}
				/>
				<label class="range-label" for="motif-size"
					>{t('generatorSize', lang)}<output>{config.scale}%</output></label
				><input
					id="motif-size"
					type="range"
					min="45"
					max="85"
					step="1"
					bind:value={config.scale}
				/>
				<h3>{t('generatorBorder', lang)}</h3>
				<div class="segmented">
					{#each [['rays', 'generatorRays'], ['check', 'generatorCheck'], ['plain', 'generatorPlain']] as const as border (border[0])}<button
							aria-pressed={config.style === border[0]}
							onclick={() => (config.style = border[0])}
							>{t(border[1], lang)}</button
						>{/each}
				</div>
			{:else}
				<h3>{t('generatorTextFrame', lang)}</h3>
				<div class="frame-options">
					{#each [['woven', 'generatorDense'], ['air', 'generatorAir'], ...frames] as const as frame (frame[0])}
						<button
							aria-pressed={config.textFrame === frame[0]}
							onclick={() => (config.textFrame = frame[0])}
						>
							<GeneratorFrameIcon frame={frame[0]} lettering />{t(
								frame[1],
								lang
							)}
						</button>
					{/each}
				</div>
			{/if}
			<div class="actions">
				<label class="range-label" for="paper-width"
					>{t('generatorPaperWidth', lang)}<output
						>{config.paperWidth} mm</output
					></label
				><input
					id="paper-width"
					type="range"
					min="80"
					max="140"
					step="10"
					bind:value={config.paperWidth}
				/>
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
	.start {
		max-width: 1130px;
		margin: 0 auto;
		padding: 54px 28px 70px;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.13em;
		font-size: 11px;
		font-weight: 800;
		color: #6c8066;
	}
	.start > h1 {
		font-size: clamp(32px, 4vw, 48px);
		margin: 9px 0 8px;
		color: #263d30;
	}
	.lede {
		font-size: 17px;
		color: #657368;
		margin: 0 0 32px;
	}
	.start-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 18px;
	}
	.start-card {
		position: relative;
		border: 1px solid #dbe1d5;
		border-radius: 20px;
		background: #fffefa;
		padding: 23px;
		text-align: left;
		box-shadow: 0 5px 16px #293c2405;
		text-decoration: none;
		color: #304b37;
		transition:
			transform 0.15s,
			border-color 0.15s;
	}
	.start-card:hover {
		transform: translateY(-3px);
		border-color: #9aac8f;
	}
	.featured {
		grid-column: span 2;
	}
	.start-card h2 {
		font-size: 19px;
		margin: 10px 0;
	}
	.start-card p {
		font-size: 13px;
		line-height: 1.6;
		color: #748071;
		padding-right: 10px;
	}
	.start-card :global(> svg) {
		position: absolute;
		right: 20px;
		bottom: 23px;
		width: 20px;
	}
	.card-art {
		height: 135px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 13px;
		background: #edf1e5;
		font-size: 67px;
		color: #b72f2b;
		gap: 30px;
	}
	.figures span {
		font-size: 80px;
		color: #365943;
	}
	.lettering {
		font-family: Georgia, serif;
		letter-spacing: 0.03em;
		font-size: 49px;
		position: relative;
	}
	.lettering span {
		font-size: 22px;
		position: absolute;
		top: 12px;
		left: calc(50% - 11px);
	}
	.small-art {
		font-size: 32px;
	}
	.small h2 {
		font-size: 16px;
	}
	.small p {
		padding: 0;
	}
	.small :global(> svg) {
		bottom: 12px;
		width: 16px;
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
	.segmented {
		display: flex;
		gap: 6px;
	}
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
	.segmented button[aria-pressed='true'],
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
	.error {
		background: #fbefe5;
		border: 1px solid #e0cbb2;
		color: #7a4e30;
		border-radius: 12px;
		padding: 16px;
		font-size: 13px;
		line-height: 1.6;
		max-width: 420px;
	}
	.segmented button {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		border: 1px solid #dde2d2;
		border-radius: 9px;
		background: white;
		padding: 9px 3px;
		font-size: 11px;
		color: #6c7c5e;
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
		.start-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.featured {
			grid-column: span 1;
		}
		.small {
			grid-column: span 1;
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
		.start {
			padding: 30px 16px;
		}
		.start-grid {
			gap: 12px;
		}
		.start-card {
			padding: 16px;
		}
		.card-art {
			height: 108px;
			font-size: 39px;
			gap: 9px;
		}
		.figures span {
			font-size: 49px;
		}
		.lettering {
			font-size: 30px;
		}
		.start-card h2 {
			font-size: 17px;
		}
		.start-card p {
			font-size: 12px;
			padding: 0 0 7px;
		}
		.small h2 {
			font-size: 15px;
		}
		.small-art {
			font-size: 26px;
		}
		.start-card :global(> svg) {
			right: 13px;
			bottom: 13px;
			width: 15px;
		}
		.start-card.featured :global(> svg) {
			display: none;
		}
	}
</style>

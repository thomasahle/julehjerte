<!--
  The detail page's stage: one big view of the heart hanging on the fir, with the
  row of 104 px thumbnails under it that swap what the big view shows
  (docs/redesign/DESIGN.md §4).

  Views, in order: the visitor's own photo of the heart, if they have added one
  ($lib/myPhotos), which is then also what the stage shows first; the woven heart, a photo of the finished heart (only the seven
  gallery hearts that have one), the printable template(s) — one when the two
  lobes share a template, otherwise left and right — and the weaving film
  (WeaveFilm.svelte: a recording where the heart has one, otherwise worked out in
  the browser). The film's tile is a drawing, the same for every heart; the film
  itself is fetched when the tile is chosen.

  Until the visitor has added a photo, the row ends in a dashed tile that adds one
  (`ownPhotoId` says under which heart; without it there is no tile). It opens the
  hidden file input, so on a phone the browser offers the camera or the photo
  library. The photo's own view carries "Skift foto" and "Fjern". With one of the
  first few photos comes an offer, under the row, to mail it in for the site: a
  mail link cannot attach a file, so it only opens a mail with the address and the
  heart's name. A heart the site already has a photo of gets no offer.

  The thumbnails are real <button>s with aria-pressed, so the view can be swapped
  from the keyboard.

  Every PaperHeartSVG on the page needs its own id prefix (its clip path is named
  after it), hence `idPrefix`: the stage heart uses "stage-<id>" and the
  thumbnail "thumb-<id>".

  `image`, given for a gallery heart, is its square search picture
  ($lib/heartImage, static/og/hearts/<id>.png): the one real image file of the
  heart on the page, which search engines need (they skip inline SVG). It is
  laid over the "Hjerte" thumbnail's SVG, its heart box exactly on the SVG's,
  with its top band (the ribbon and the cleft it dips into) clipped off, so the
  thumbnail looks as it did. The PNG is red and white only: with the header's
  colourful mode or another paper pair on <html> it is hidden and the inline
  SVG, which follows the colours, shows alone. Until it has loaded the SVG under
  it shows, so nothing flashes.
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import PaperHeartSVG from '$lib/components/PaperHeartSVG.svelte';
	import TemplatePreview from '$lib/components/TemplatePreview.svelte';
	import WeaveFilm from '$lib/components/detail/WeaveFilm.svelte';
	import { t, type Language } from '$lib/i18n';
	import type { HeartDesign } from '$lib/types/heart';
	import { pairAttributes } from '$lib/utils/palette';
	import { heartImageFit, heartImageRibbonBand } from '$lib/heartImage';
	import { smallSrcset } from '$lib/smallImages';
	import { preloadWeaveFilm, type WeaveFilmEntry } from '$lib/weave/film';
	import { onMount } from 'svelte';
	import { CameraIcon, CloseIcon } from '$lib/components/icons';
	import { PHOTO_MAIL, PHOTO_MAIL_READY, loadMyPhotos, photoMailHref, removeMyPhoto, saveMyPhoto, shouldSuggestMail } from '$lib/myPhotos';

	type ViewId = 'mine' | 'heart' | 'photo' | 'left' | 'right' | 'film';

	interface Props {
		/** Null while a user/shared heart is still being read in the browser. */
		design: HeartDesign | null;
		/** Photo of the finished heart, if this gallery heart has one. */
		photo?: { src: string; width: number; height: number; alt: string } | null;
		/** The heart's recorded weaving film, if this gallery heart has one; other hearts get one worked out in the browser. */
		film?: (WeaveFilmEntry & { id: string }) | null;
		/** False when the lobes need one template each. */
		sharedTemplate?: boolean;
		lang: Language;
		/** Unique per page — see the note above. */
		idPrefix: string;
		/** A gallery heart's square picture — see the note above. */
		image?: { src: string; alt: string } | null;
		/** The visitor's own photo of the heart, kept in this browser ($lib/myPhotos). */
		myPhoto?: { src: string; alt: string } | null;
		/** The heart the visitor's photo is kept under; null where a photo cannot be added (a heart sent by link). */
		ownPhotoId?: string | null;
		/** The heart's name, for the subject of the mail that sends the photo in. */
		heartName?: string;
	}

	let { design, photo = null, film = null, sharedTemplate = true, lang, idPrefix, image = null, myPhoto = null, ownPhotoId = null, heartName = '' }: Props = $props();

	const fit = heartImageFit();
	const imageStyle = `width: ${fit.width}; margin-left: ${fit.left}; margin-top: ${fit.top}; clip-path: inset(${Number((heartImageRibbonBand() * 100).toFixed(3))}% 0 0 0);`;

	let views = $derived.by(() => {
		const list: { id: ViewId; label: string }[] = [];
		if (myPhoto) list.push({ id: 'mine', label: t('myPhoto', lang) });
		list.push({ id: 'heart', label: t('viewHeart', lang) });
		if (photo) list.push({ id: 'photo', label: t('photo', lang) });
		if (design) {
			list.push({
				id: 'left',
				label: sharedTemplate ? t('template', lang) : t('templateLeft', lang)
			});
			if (!sharedTemplate) list.push({ id: 'right', label: t('templateRight', lang) });
			list.push({ id: 'film', label: t('weaveView', lang) });
		}
		return list;
	});

	// The film's player and recording are fetched once the page has settled, so the film starts
	// at once when its tile is chosen; again for the next heart when the page goes on to one.
	$effect(() => {
		const filmId = film?.id ?? design?.id;
		if (!filmId) return;
		const entry = film;
		const fetchNow = () => preloadWeaveFilm(filmId, entry);
		if (typeof requestIdleCallback === 'function') {
			const waiting = requestIdleCallback(fetchNow, { timeout: 4000 });
			return () => cancelIdleCallback(waiting);
		}
		const waiting = setTimeout(fetchNow, 1500);
		return () => clearTimeout(waiting);
	});

	// The photo's smaller copies: the thumbnail and the stage each fetch the one that fits.
	let photoSrcset = $derived(photo ? smallSrcset(photo.src, photo.width) : undefined);

	/** Which thumbnail was clicked. What is *shown* is `shownView` below. */
	let view = $state<ViewId>('heart');

	// The visitor's photo is what they came back to see, and what they want to see the moment
	// they have added it: it takes the stage when it arrives (it is read after the page has
	// drawn) and when it is replaced.
	$effect(() => {
		if (myPhoto?.src) view = 'mine';
	});

	// A user heart's design only arrives after hydration, and a symmetric heart
	// drops the "right" view, so the clicked view can stop existing. Deriving the
	// fallback rather than writing `view` back keeps the click state pure.
	/** The heart whose film has been opened on this page: it is kept while other views are shown. */
	let filmOpened = $state<string | null>(null);

	let shownView = $derived(views.some((v) => v.id === view) ? view : 'heart');

	let photoInput = $state<HTMLInputElement | null>(null);
	let hydrated = $state(false);
	let photoBusy = $state(false);
	let photoFailed = $state(false);
	/** The heart the mail offer is shown for: it goes away on the next heart's page. */
	let suggestFor = $state<string | null>(null);
	/** The heart whose "Fjern" has been pressed once and waits for a yes. */
	let removingFor = $state<string | null>(null);

	onMount(() => {
		hydrated = true;
		void loadMyPhotos();
	});

	async function handlePhotoFile(event: Event) {
		const field = event.currentTarget as HTMLInputElement;
		const file = field.files?.[0];
		// Cleared so that choosing the same file again is still a change.
		field.value = '';
		const id = ownPhotoId;
		if (!file || !id) return;
		photoBusy = true;
		photoFailed = false;
		removingFor = null;
		try {
			await saveMyPhoto(id, file);
			suggestFor = PHOTO_MAIL_READY && shouldSuggestMail() ? id : null;
		} catch {
			photoFailed = true;
		} finally {
			photoBusy = false;
		}
	}

	async function handlePhotoRemove() {
		const id = ownPhotoId;
		if (!id) return;
		if (removingFor !== id) {
			removingFor = id;
			return;
		}
		removingFor = null;
		suggestFor = null;
		try {
			await removeMyPhoto(id);
		} catch {
			photoFailed = true;
		}
	}
</script>

<div class="stage">
	{#if !design}
		<p class="stage-loading">{t('loadingTemplate', lang)}</p>
	{:else if shownView === 'heart'}
		<!-- Positioned so the heart hangs from the big fir behind it. -->
		<div class="stage-hang">
			<HangingHeart {design} paper={PaperHeartSVG} size={340} ribbon={70} idPrefix="stage-{idPrefix}" />
		</div>
	{:else if shownView === 'mine' && myPhoto}
		<div class="stage-media">
			<img class="stage-photo" src={myPhoto.src} alt={myPhoto.alt} decoding="async" />
			{#if ownPhotoId}
				<div class="mine-tools">
					<button type="button" onclick={() => photoInput?.click()} disabled={photoBusy}>
						{t('madeItReplace', lang)}
					</button>
					<button type="button" onclick={handlePhotoRemove} disabled={photoBusy}>
						{removingFor === ownPhotoId ? t('madeItRemoveSure', lang) : t('madeItRemove', lang)}
					</button>
				</div>
			{/if}
		</div>
	{:else if shownView === 'photo' && photo}
		<div class="stage-media">
			<img
				class="stage-photo"
				src={photo.src}
				srcset={photoSrcset}
				sizes="(max-width: 599px) 90vw, 440px"
				width={photo.width}
				height={photo.height}
				loading="lazy"
				decoding="async"
				alt={photo.alt}
			/>
		</div>
	{:else if shownView === 'film'}
		<!-- The film itself is below: it stays when another view is chosen. -->
	{:else}
		<div class="stage-media">
			<div class="stage-template" {...pairAttributes(design.id)}>
				<TemplatePreview {design} lobe={shownView === 'right' ? 'right' : 'left'} size={380} paper shared={sharedTemplate} />
			</div>
		</div>
	{/if}
	{#if design && (shownView === 'film' || filmOpened === (film?.id ?? design.id))}
		<!-- Once opened the film is kept behind the other views, so coming back to it is instant.
		     Keyed: going on to another heart's page while the film is shown starts that heart's film. -->
		{#key film?.id ?? design.id}
			<WeaveFilm id={film?.id ?? design.id} entry={film} {design} {lang} shown={shownView === 'film'} />
		{/key}
	{/if}
</div>

{#if ownPhotoId}
	<input
		bind:this={photoInput}
		class="sr-only"
		type="file"
		accept="image/*"
		tabindex="-1"
		aria-hidden="true"
		onchange={handlePhotoFile}
	/>
{/if}

<div class="thumbs" class:is-many={views.length > 3}>
	{#each views as v (v.id)}
		{@const pair = v.id !== 'photo' && v.id !== 'mine' && design ? pairAttributes(design.id) : undefined}
		<button
			type="button"
			class="thumb-btn"
			class:is-active={shownView === v.id}
			aria-pressed={shownView === v.id}
			onclick={() => {
				view = v.id;
				if (v.id === 'film' && design) filmOpened = film?.id ?? design.id;
			}}
		>
			<!-- Decorative: the button is named by its label below. The heart's
			     thumbnail carries its colourful-mode pair, like the big heart above
			     it (HangingHeart), so the two show the same papers; so does the film's
			     tile, as the film itself is in the heart's papers. -->
			<span
				class="thumb"
				class:thumb-heart={v.id === 'heart' || v.id === 'left' || v.id === 'right'}
				class:thumb-film={v.id === 'film'}
				aria-hidden="true"
				data-pair={pair?.['data-pair']}
				style={pair?.style}
			>
				{#if v.id === 'heart' && design}
					<PaperHeartSVG
						readonly
						idPrefix="thumb-{idPrefix}"
						initialFingers={design.fingers}
						initialGridSize={design.gridSize}
						initialWeaveParity={design.weaveParity ?? 0}
						size={200}
					/>
					{#if image}
						<span class="thumb-picture">
							<img
								src={image.src}
								alt={image.alt}
								width="800"
								height="800"
								loading="lazy"
								decoding="async"
								style={imageStyle}
							/>
						</span>
					{/if}
				{:else if v.id === 'mine' && myPhoto}
					<img class="thumb-photo" src={myPhoto.src} alt="" decoding="async" />
				{:else if v.id === 'photo' && photo}
					<!-- Alt text for search engines: until the photo is chosen, this
					     is the only <img> of it on the page. -->
					<img
						class="thumb-photo"
						src={photo.src}
						srcset={photoSrcset}
						sizes="80px"
						alt={photo.alt}
						loading="lazy"
						decoding="async"
					/>
				{:else if v.id === 'film' && design}
					<!-- The finished heart lying on the cutting mat, as the film's last picture shows it:
					     the heart's own woven picture, leaned back, with its shadow, and a play mark in
					     the corner so the pattern stays in view. -->
					<span class="film-heart">
						<PaperHeartSVG
							readonly
							idPrefix="film-thumb-{idPrefix}"
							initialFingers={design.fingers}
							initialGridSize={design.gridSize}
							initialWeaveParity={design.weaveParity ?? 0}
							size={200}
						/>
					</span>
					<svg class="film-play" viewBox="0 0 30 30">
						<circle cx="15" cy="15" r="15" fill="#ffffff" />
						<path d="M11 8 L23 15 L11 22 Z" fill="#1c3329" />
					</svg>
				{:else if design}
					<TemplatePreview {design} lobe={v.id === 'right' ? 'right' : 'left'} size={200} marks={false} paper shared={sharedTemplate} />
				{/if}
			</span>
			<span class="thumb-label">{v.label}</span>
		</button>
	{/each}
	{#if ownPhotoId && !myPhoto}
		<button
			type="button"
			class="thumb-btn thumb-add"
			onclick={() => photoInput?.click()}
			disabled={!hydrated || photoBusy}
			title={t('madeItHint', lang)}
		>
			<span class="thumb" aria-hidden="true"><CameraIcon size={30} /></span>
			<span class="thumb-label">{t('addMyPhoto', lang)}</span>
		</button>
	{/if}
</div>

{#if photoFailed}
	<p class="photo-note photo-error" role="alert">{t('madeItFailed', lang)}</p>
{:else if myPhoto && !photo && ownPhotoId && suggestFor === ownPhotoId}
	<!-- Only where the site has no photo of the heart yet: that is what the offer is for. -->
	<div class="photo-note" role="status">
		<p>
			{t('madeItMail', lang)}
			<a href={photoMailHref(t('madeItMailSubject', lang, { name: heartName }))}>{PHOTO_MAIL}</a>
		</p>
		<button type="button" onclick={() => (suggestFor = null)} aria-label={t('close', lang)} title={t('close', lang)}>
			<CloseIcon size={16} />
		</button>
	</div>
{/if}

<style>
	/* Every big view starts at the stage's top edge, so the picture lines up with
	   the top of the info panel beside it, and the stage is only as tall as the
	   tallest of them: 410 for the hanging block (152 ribbon + 340 heart - 82
	   cleft overlap) and 406 for the template card. The sky above the heart is
	   the grid's own top padding, not slack inside the stage — slack here pushed
	   the thumbnails, the buttons and the "Flere <kategori>" row below the fold
	   at 1440x900. */
	.stage {
		position: relative;
		height: 420px;
	}

	.stage-hang {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		display: flex;
		justify-content: center;
	}

	/* Top-aligned, like the hanging heart: the photo and the template card are
	   shorter than the stage and would otherwise float away from the panel's
	   top edge. */
	.stage-media {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		box-sizing: border-box;
	}

	.stage-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		/* Sits directly on the scene's --sky, where --muted is only 4.02:1. */
		color: var(--muted-on-sky);
		font-size: 15px;
	}

	.stage-photo {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: 12px;
		box-shadow: 0 8px 20px var(--shadow-color);
	}

	/* No card: the piece is drawn as paper in its lobe's colour and lies on the sky, as the
	   heart hangs on it (TemplatePreview's `paper`). */
	.stage-template {
		width: min(100%, 420px);
		padding: 12px;
		box-sizing: border-box;
	}

	/* thumbnails */
	/* Always one row. The tiles shrink a little first (a long label then takes
	   two lines); when they cannot shrink further the row scrolls sideways.
	   The auto margins centre a row that fits and, unlike justify-content,
	   leave the first tile reachable in a row that scrolls. */
	.thumbs {
		display: flex;
		gap: 16px;
		flex-wrap: nowrap;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
	}

	.thumbs > :first-child {
		margin-left: auto;
	}

	.thumbs > :last-child {
		margin-right: auto;
	}

	.thumb-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		flex: 0 1 120px;
		min-width: 92px;
		padding: 0;
		margin: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.thumb {
		position: relative;
		display: block;
		width: 100%;
		max-width: 104px;
		aspect-ratio: 1;
		border-radius: 12px;
		background: var(--white);
		border: 1.5px solid var(--line);
		box-sizing: border-box;
		padding: 8px;
		overflow: hidden;
		transition: border-color 0.15s;
	}

	/* The heart tile is sky-coloured, as in the hero: on white the white lobe
	   would vanish and the tile show half a heart. The template tiles are too:
	   the piece is drawn as paper in its lobe's colour (TemplatePreview's `paper`). Photos
	   keep the white tile. */
	.thumb-heart {
		background: var(--sky);
	}

	/* The film's tile is the cutting mat the film is shot on, edge to edge. */
	.thumb-film {
		background: #1f4d3b;
		padding: 0;
	}

	/* The mat's ruled squares, faint, and the heart leaned back on it. */
	.thumb-film {
		background-image:
			linear-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.07) 1px, transparent 1px);
		background-size: 12.5% 12.5%;
	}

	.film-heart {
		position: absolute;
		inset: 9% 11% 13%;
		transform: perspective(260px) rotateX(32deg) rotateZ(-6deg);
		filter: drop-shadow(5px 7px 3px rgb(0 0 0 / 0.4));
	}

	.thumb .film-play {
		position: absolute;
		right: 6%;
		bottom: 6%;
		width: 28%;
		height: 28%;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
	}

	.thumb-btn.is-active .thumb {
		border-width: 2.5px;
		border-color: var(--red);
	}

	.thumb-btn:hover .thumb {
		border-color: var(--sage-dark);
	}

	.thumb-btn.is-active:hover .thumb {
		border-color: var(--red);
	}

	.thumb :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.thumb :global(.template-preview) {
		height: 100%;
		gap: 0;
	}

	/* The square picture over the heart thumbnail's SVG: the content box of the
	   tile (inside its 8px padding) is the heart's box, and the image's own
	   style puts its heart box there ($lib/heartImage). */
	.thumb-picture {
		position: absolute;
		inset: 8px;
		overflow: hidden;
	}

	.thumb-picture img {
		display: block;
		max-width: none;
		height: auto;
	}

	/* Red and white only: another pair on <html> (src/app.css, "Colourful
	   mode"; $lib/stores/colors PAPER_KIND_CLASSES) leaves the SVG alone. */
	:global(html.colorful) .thumb-picture,
	:global(html.paper-flipped) .thumb-picture,
	:global(html.paper-custom) .thumb-picture {
		display: none;
	}

	/* The tile that adds the visitor's own photo: an empty frame, so dashed. */
	.thumb-add .thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--green);
		background: rgb(255 255 255 / 0.55);
		color: var(--green);
	}

	/* A small glyph in the frame: the tile's other pictures fill it, this must not. */
	.thumb-add .thumb :global(svg) {
		flex: none;
		width: 30px;
		height: 30px;
	}

	.thumb-add:hover:not(:disabled) .thumb {
		background: var(--white);
	}

	.thumb-add:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* "Skift foto" and "Fjern", on the visitor's photo. */
	.mine-tools {
		position: absolute;
		left: 50%;
		bottom: 22px;
		translate: -50% 0;
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.92);
		box-shadow: 0 4px 12px var(--shadow-color);
		white-space: nowrap;
	}

	.mine-tools button {
		padding: 6px 14px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--green);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.mine-tools button:hover:not(:disabled) {
		background: var(--cream2);
	}

	/* Under the thumbnails: the offer to mail the photo in, or why it could not be saved. */
	.photo-note {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		width: fit-content;
		max-width: 100%;
		box-sizing: border-box;
		margin: 14px auto 0;
		padding: 10px 10px 10px 16px;
		border-radius: 12px;
		background: var(--white);
		box-shadow: 0 4px 14px var(--shadow-color);
		color: var(--green);
		font-size: 14px;
		line-height: 1.45;
	}

	.photo-note p {
		margin: 0;
	}

	.photo-note a {
		color: var(--red);
		font-weight: 600;
		white-space: nowrap;
	}

	.photo-note button {
		flex: none;
		display: inline-flex;
		padding: 4px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--green);
		cursor: pointer;
	}

	.photo-error {
		padding-right: 16px;
		color: var(--red);
	}

	.thumb-photo {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 6px;
	}

	.thumb-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--ink);
		text-align: center;
		background: rgb(255 255 255 / 0.8);
		border-radius: 999px;
		padding: 3px 10px;
		line-height: 1.2;
	}

	.thumb-btn.is-active .thumb-label {
		font-weight: 600;
		color: var(--deep);
	}

	@media (max-width: 599px) {
		/* A phone's heart is a little smaller, so the buttons and the first
		   lines about the heart are on the first screen. */
		.stage {
			height: 370px;
		}

		.stage-hang > :global(*) {
			max-width: 290px;
		}

		.thumbs {
			gap: 10px;
		}

		.thumb-btn {
			flex-basis: 96px;
			min-width: 0;
		}

		.thumb {
			max-width: 88px;
		}

		.thumb-label {
			font-size: 12px;
			padding: 3px 8px;
		}

		/* Four or five tiles still share the phone's width: they shrink together
		   down to 60px before the row scrolls. */
		.thumbs.is-many {
			gap: 8px;
		}

		.thumbs.is-many .thumb-btn {
			min-width: 60px;
		}

		.thumbs.is-many .thumb-label {
			border-radius: 10px;
			padding: 3px 6px;
		}
	}
</style>

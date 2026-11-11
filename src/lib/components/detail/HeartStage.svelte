<!--
  The detail page's stage: one big view of the heart hanging on the fir, with the
  row of 104 px thumbnails under it that swap what the big view shows
  (docs/redesign/DESIGN.md §4).

  Views, in order: the woven heart, a photo of the finished heart (only the seven
  gallery hearts that have one), the printable template(s) — one when the two
  lobes share a template, otherwise left and right — and the weaving film
  (WeaveFilm.svelte: a recording where the heart has one, otherwise worked out in
  the browser). The film's tile is a drawing, the same for every heart; the film
  itself is fetched when the tile is chosen.

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
	import type { WeaveFilmEntry } from '$lib/weave/film';

	type ViewId = 'heart' | 'photo' | 'left' | 'right' | 'film';

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
	}

	let { design, photo = null, film = null, sharedTemplate = true, lang, idPrefix, image = null }: Props = $props();

	const fit = heartImageFit();
	const imageStyle = `width: ${fit.width}; margin-left: ${fit.left}; margin-top: ${fit.top}; clip-path: inset(${Number((heartImageRibbonBand() * 100).toFixed(3))}% 0 0 0);`;

	let views = $derived.by(() => {
		const list: { id: ViewId; label: string }[] = [{ id: 'heart', label: t('viewHeart', lang) }];
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

	/** Which thumbnail was clicked. What is *shown* is `shownView` below. */
	let view = $state<ViewId>('heart');

	// A user heart's design only arrives after hydration, and a symmetric heart
	// drops the "right" view, so the clicked view can stop existing. Deriving the
	// fallback rather than writing `view` back keeps the click state pure.
	let shownView = $derived(views.some((v) => v.id === view) ? view : 'heart');
</script>

<div class="stage">
	{#if !design}
		<p class="stage-loading">{t('loadingTemplate', lang)}</p>
	{:else if shownView === 'heart'}
		<!-- Positioned so the heart hangs from the big fir behind it. -->
		<div class="stage-hang">
			<HangingHeart {design} paper={PaperHeartSVG} size={340} ribbon={70} idPrefix="stage-{idPrefix}" />
		</div>
	{:else if shownView === 'photo' && photo}
		<div class="stage-media">
			<img
				class="stage-photo"
				src={photo.src}
				width={photo.width}
				height={photo.height}
				loading="lazy"
				decoding="async"
				alt={photo.alt}
			/>
		</div>
	{:else if shownView === 'film'}
		<!-- Keyed: going on to another heart's page while the film is shown starts that heart's film. -->
		{#key film?.id ?? design.id}
			<WeaveFilm id={film?.id ?? design.id} entry={film} {design} {lang} />
		{/key}
	{:else}
		<div class="stage-media">
			<div class="stage-template">
				<TemplatePreview {design} lobe={shownView === 'right' ? 'right' : 'left'} size={380} />
			</div>
		</div>
	{/if}
</div>

<div class="thumbs" class:is-many={views.length > 3}>
	{#each views as v (v.id)}
		{@const pair =
			(v.id === 'heart' || v.id === 'film') && design ? pairAttributes(design.id) : undefined}
		<button
			type="button"
			class="thumb-btn"
			class:is-active={shownView === v.id}
			aria-pressed={shownView === v.id}
			onclick={() => (view = v.id)}
		>
			<!-- Decorative: the button is named by its label below. The heart's
			     thumbnail carries its colourful-mode pair, like the big heart above
			     it (HangingHeart), so the two show the same papers; so does the film's
			     tile, as the film itself is in the heart's papers. -->
			<span
				class="thumb"
				class:thumb-heart={v.id === 'heart'}
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
				{:else if v.id === 'photo' && photo}
					<!-- Alt text for search engines: until the photo is chosen, this
					     is the only <img> of it on the page. -->
					<img class="thumb-photo" src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
				{:else if v.id === 'film'}
					<!-- The two halves on the cutting mat, about to be woven, and a play mark. The heart
					     stands on its point, so each half is drawn in the square's own frame, turned 45°.
					     They are in the heart's papers, and each half's cuts are tinted with the other paper,
					     which shows on any pair. -->
					<svg viewBox="0 0 100 100">
						<g transform="translate(50 50) rotate(45)">
							<g transform="translate(-9 9)">
								<path d="M-17 -17 H17 V17 H-17 A17 17 0 0 1 -17 -17 Z" fill="var(--paper-left)" />
								<path class="film-cuts-left" d="M-21 -5.7 H17 M-21 5.7 H17" stroke-width="1.2" fill="none" />
							</g>
							<g transform="translate(9 -9)">
								<path d="M-17 17 V-17 A17 17 0 0 1 17 -17 V17 Z" fill="var(--paper-right)" />
								<path class="film-cuts-right" d="M-5.7 -21 V17 M5.7 -21 V17" stroke-width="1.2" fill="none" />
							</g>
						</g>
						<circle cx="50" cy="52" r="15" fill="#ffffff" />
						<path d="M45.5 44.5 L58 52 L45.5 59.5 Z" fill="#1c3329" />
					</svg>
				{:else if design}
					<TemplatePreview {design} lobe={v.id === 'right' ? 'right' : 'left'} size={200} marks={false} />
				{/if}
			</span>
			<span class="thumb-label">{v.label}</span>
		</button>
	{/each}
</div>

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

	.stage-template {
		width: min(100%, 420px);
		padding: 12px;
		box-sizing: border-box;
		border-radius: 14px;
		background: var(--white);
		border: 1px solid var(--line);
		box-shadow: 0 8px 20px var(--shadow-color);
	}

	/* thumbnails */
	.thumbs {
		display: flex;
		gap: 16px;
		justify-content: center;
		flex-wrap: wrap;
	}

	.thumb-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 120px;
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
		width: 104px;
		height: 104px;
		border-radius: 12px;
		background: var(--white);
		border: 1.5px solid var(--line);
		box-sizing: border-box;
		padding: 8px;
		overflow: hidden;
		transition: border-color 0.15s;
	}

	/* The heart tile is sky-coloured, as in the hero: on white the white lobe
	   would vanish and the tile show half a heart. Line art and photos keep
	   the white tile. */
	.thumb-heart {
		background: var(--sky);
	}

	/* The film's tile is the cutting mat the film is shot on, edge to edge. */
	.thumb-film {
		background: #1f4d3b;
		padding: 0;
	}

	.film-cuts-left {
		stroke: color-mix(in srgb, var(--paper-left) 70%, var(--paper-right));
	}

	.film-cuts-right {
		stroke: color-mix(in srgb, var(--paper-right) 70%, var(--paper-left));
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
		white-space: nowrap;
	}

	.thumb-btn.is-active .thumb-label {
		font-weight: 600;
		color: var(--deep);
	}

	@media (max-width: 599px) {
		.thumbs {
			gap: 10px;
		}

		.thumb-btn {
			width: 96px;
		}

		.thumb {
			width: 88px;
			height: 88px;
		}

		.thumb-label {
			font-size: 12px;
			padding: 3px 8px;
		}

		/* Four or five tiles still share one row: they shrink together, and a long
		   label takes two lines. */
		.thumbs.is-many {
			flex-wrap: nowrap;
			gap: 8px;
		}

		.thumbs.is-many .thumb-btn {
			flex: 0 1 96px;
			width: auto;
			min-width: 0;
		}

		.thumbs.is-many .thumb {
			width: 100%;
			max-width: 88px;
			height: auto;
			aspect-ratio: 1;
		}

		.thumbs.is-many .thumb-label {
			white-space: normal;
			border-radius: 10px;
			padding: 3px 6px;
		}
	}
</style>

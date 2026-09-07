<!--
  The detail page's stage: one big view of the heart hanging on the fir, with the
  row of 104 px thumbnails under it that swap what the big view shows
  (docs/redesign/DESIGN.md §4).

  Views, in order: the woven heart, a photo of the finished heart (only the seven
  gallery hearts that have one), and the printable template(s) — one when the two
  lobes share a template, otherwise left and right.

  The thumbnails are real <button>s with aria-pressed, so the view can be swapped
  from the keyboard.

  Every PaperHeartSVG on the page needs its own id prefix (its clip path is named
  after it), hence `idPrefix`: the stage heart uses "stage-<id>" and the
  thumbnail "thumb-<id>".
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import PaperHeartSVG from '$lib/components/PaperHeartSVG.svelte';
	import TemplatePreview from '$lib/components/TemplatePreview.svelte';
	import { t, type Language } from '$lib/i18n';
	import type { HeartDesign } from '$lib/types/heart';

	type ViewId = 'heart' | 'photo' | 'left' | 'right';

	interface Props {
		/** Null while a user/shared heart is still being read in the browser. */
		design: HeartDesign | null;
		/** Photo of the finished heart, if this gallery heart has one. */
		photo?: { src: string; width: number; height: number } | null;
		/** False when the lobes need one template each. */
		sharedTemplate?: boolean;
		lang: Language;
		/** Unique per page — see the note above. */
		idPrefix: string;
	}

	let { design, photo = null, sharedTemplate = true, lang, idPrefix }: Props = $props();

	let views = $derived.by(() => {
		const list: { id: ViewId; label: string }[] = [{ id: 'heart', label: t('viewHeart', lang) }];
		if (photo) list.push({ id: 'photo', label: t('photo', lang) });
		if (design) {
			list.push({
				id: 'left',
				label: sharedTemplate ? t('template', lang) : t('templateLeft', lang)
			});
			if (!sharedTemplate) list.push({ id: 'right', label: t('templateRight', lang) });
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
			<HangingHeart {design} size={340} ribbon={70} idPrefix="stage-{idPrefix}" />
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
				alt={t('photoAlt', lang)}
			/>
		</div>
	{:else}
		<div class="stage-media">
			<div class="stage-template">
				<TemplatePreview {design} lobe={shownView === 'right' ? 'right' : 'left'} size={380} />
			</div>
		</div>
	{/if}
</div>

<div class="thumbs">
	{#each views as v (v.id)}
		<button
			type="button"
			class="thumb-btn"
			class:is-active={shownView === v.id}
			aria-pressed={shownView === v.id}
			onclick={() => (view = v.id)}
		>
			<span class="thumb">
				{#if v.id === 'heart' && design}
					<PaperHeartSVG
						readonly
						idPrefix="thumb-{idPrefix}"
						initialFingers={design.fingers}
						initialGridSize={design.gridSize}
						initialWeaveParity={design.weaveParity ?? 0}
						size={200}
					/>
				{:else if v.id === 'photo' && photo}
					<img class="thumb-photo" src={photo.src} alt="" loading="lazy" decoding="async" />
				{:else if design}
					<TemplatePreview {design} lobe={v.id === 'right' ? 'right' : 'left'} size={200} />
				{/if}
			</span>
			<span class="thumb-label">{v.label}</span>
		</button>
	{/each}
</div>

<style>
	.stage {
		position: relative;
		height: 600px;
	}

	.stage-hang {
		position: absolute;
		left: 0;
		right: 0;
		top: 130px;
		display: flex;
		justify-content: center;
	}

	.stage-media {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 0;
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

	/* Below 1100 the columns stack, the big fir behind the stage is hidden and the
	   stage is 480 tall. The heart is then hung at 70 rather than 130 so the
	   block (152 ribbon + 340 heart - 82 cleft overlap = 410) ends exactly on the
	   stage's bottom edge and can never reach into the thumbnails, whatever the
	   design's own bounding box looks like. */
	@media (max-width: 1099px) {
		.stage {
			height: 480px;
		}

		.stage-hang {
			top: 70px;
		}
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
	}
</style>

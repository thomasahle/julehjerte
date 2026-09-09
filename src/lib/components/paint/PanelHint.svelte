<!--
  A panel heading with its one line of explanation behind an "i" — PAINT.md §2.

  Symmetri and Kanten each have a sentence that is worth reading once and never
  again, and at 300px each cost the column a line on every visit. They were moved
  into the heading's `title`, which bought the column its two lines and took the
  sentences away from everybody who is not holding a mouse: a `title` fires on
  neither touch nor keyboard focus. Hjælp still has both sentences, but that is a
  dialog you have to know to open.

  So the sentence comes back to the panel, behind a control that anyone can
  operate: lucide's `info` is itself a circled "i", so the glyph is the button —
  24px, which is also the smallest target WCAG 2.2 asks for. The paragraph stays
  in the DOM and is hidden, so `aria-controls` always names something real and
  `aria-expanded` says which way it stands.

  One component for both panels, because the two hints are the same thing and a
  second copy of this would drift.
-->
<script lang="ts">
	import { InfoIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';

	interface Props {
		/** The panel's own name, which is also the heading. */
		heading: string;
		/** The sentence the button reveals. */
		hint: string;
		lang: Language;
	}

	let { heading, hint, lang }: Props = $props();

	let open = $state(false);

	// Two of these stand in one column, so the paragraph each button controls
	// needs an id of its own rather than a name shared with the other panel's.
	const id = $props.id();
</script>

<div class="heading">
	<h2 class="panel-title">{heading}</h2>
	<!-- Named after its panel: a screen reader listing the page's buttons would
	     otherwise find two called "Forklaring" and no way to tell them apart. -->
	<button
		type="button"
		class="toggle"
		aria-expanded={open}
		aria-controls={id}
		aria-label={t('paintPanelHint', lang, { panel: heading })}
		onclick={() => (open = !open)}
	>
		<InfoIcon size={24} />
	</button>
</div>
<p class="hint" {id} hidden={!open}>{hint}</p>

<style>
	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}

	.toggle:hover,
	.toggle[aria-expanded='true'] {
		color: var(--green);
	}

	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
	}

	/* The panel is a flex column, so a hidden child would otherwise still be laid
	   out as a flex item and keep the column's gap around a paragraph nobody can
	   see. The attribute is what `aria-expanded` is about, so it decides. */
	.hint[hidden] {
		display: none;
	}
</style>

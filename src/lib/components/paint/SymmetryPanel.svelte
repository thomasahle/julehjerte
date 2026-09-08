<!--
  Mal's "Symmetri" panel (docs/redesign/PAINT.md §2).

  The three rows used to sit in "Find snit", on the reading that they are what the
  search is asked to hold. They are — but they are also live while painting: every
  stroke is mirrored the moment a row is on, long before anyone presses Find snit.
  A control that changes what the brush does belongs beside the brush, so the rows
  moved to the left column, under Værktøj, and the search reads them from the
  session as it always did.

  `SymmetryRows` is shared with Tegn and is not touched here. Standing the rows
  down is a plain `<fieldset disabled>`: it really disables every control inside,
  and it says so, without this panel having to reach into the shared component or
  borrow the "requires an equal grid" tooltip that Tegn's disabled row carries.
-->
<script lang="ts">
	import SymmetryRows from '$lib/components/editor/SymmetryRows.svelte';
	import { t, type Language } from '$lib/i18n';
	import type { SymmetrySettings } from '$lib/paint/symmetry';

	interface Props {
		value: SymmetrySettings;
		onChange: (next: SymmetrySettings) => void;
		/** What detection suggested, for the "fundet" pills. */
		found: SymmetrySettings | null;
		/** The engine is working, or the found heart is on screen: nothing to mirror. */
		disabled?: boolean;
		lang: Language;
	}

	let { value, onChange, found, disabled = false, lang }: Props = $props();
</script>

<section class="editor-panel">
	<h2 class="panel-title">{t('paintSymmetry', lang)}</h2>
	<fieldset class="rows" {disabled}>
		<p class="lead">{t('paintSymmetryHint', lang)}</p>
		<SymmetryRows {lang} {value} onChange={onChange} {found} />
	</fieldset>
</section>

<style>
	/* A fieldset for what it does, not for what it looks like: the browser's own
	   border, padding and margin all go, and the panel's own column takes over. */
	.rows {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	.rows:disabled {
		opacity: 0.45;
	}

	/* The rows were drawn for the 372px right column. This one is 300px, and
	   "Mellem lapper" with its "fundet" pill beside a three-segment control does
	   not fit on one line there — the "Anti" end ran off the panel. So the label
	   may wrap here and the control may not shrink. SymmetryRows is shared with
	   Tegn, where the wider column still puts every row on one line, so the fix
	   belongs to this panel rather than to the component. */
	.rows :global(.symmetry-label) {
		white-space: normal;
	}

	.rows :global([data-slot='toggle-group']) {
		flex: none;
	}

	.lead {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}
</style>

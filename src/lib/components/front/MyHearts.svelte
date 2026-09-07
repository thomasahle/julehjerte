<!--
  "Mine hjerter" — the hearts the visitor drew themselves, at the foot of the
  gallery (docs/redesign/DESIGN.md §3).

  Same row as a gallery category, with three differences: the heading stands
  alone (no count), the cards can be deleted, and an empty collection shows the
  "draw your first heart" panel instead of a grid.
-->
<script lang="ts">
	import CategorySection from './CategorySection.svelte';
	import MyHeartsEmpty from './MyHeartsEmpty.svelte';
	import { categoryTitle, MY_HEARTS_CATEGORY_ID } from '$lib/data/categories';
	import type { HeartDesign } from '$lib/types/heart';
	import type { Language } from '$lib/i18n';

	interface Props {
		lang: Language;
		hearts: HeartDesign[];
		selectedIds: Set<string>;
		onSelect: (design: HeartDesign) => void;
		onClick: (design: HeartDesign) => void;
		onDelete: (design: HeartDesign) => void;
	}

	let { lang, hearts, selectedIds, onSelect, onClick, onDelete }: Props = $props();
</script>

<CategorySection
	id={MY_HEARTS_CATEGORY_ID}
	title={categoryTitle(MY_HEARTS_CATEGORY_ID, lang)}
	{hearts}
	{lang}
	{selectedIds}
	{onSelect}
	{onClick}
	{onDelete}
	apart
>
	{#snippet empty()}
		<MyHeartsEmpty {lang} />
	{/snippet}
</CategorySection>

<!--
  The empty state of "Mine hjerter" — docs/redesign/DESIGN.md §3.

  A dashed box explaining that hearts drawn in the editor are kept in this
  browser, with a pencil tile and a way into the editor. It is what the
  prerendered HTML contains; hearts read from localStorage replace it on mount.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import { href as routeHref } from '$lib/i18n/routes';
	import { PencilIcon } from '$lib/components/icons';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();
</script>

<div class="mine-box">
	<span class="mine-icon" aria-hidden="true"><PencilIcon size={22} /></span>
	<span class="mine-text">{t('myHeartsEmpty', lang)}</span>
	<a class="btn btn-outline" href={routeHref('editor', lang)}>{t('createNewHeart', lang)}</a>
</div>

<style>
	.mine-box {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
		padding: 22px;
		border: 1.5px dashed var(--sage);
		border-radius: 12px;
		color: var(--muted);
		font-size: 15px;
	}

	.mine-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		flex: none;
		border-radius: 12px;
		background: var(--cream2);
		color: var(--green);
	}

	.mine-text {
		flex: 1;
		min-width: 220px;
	}

	@media (max-width: 599px) {
		.mine-box {
			gap: 14px;
			padding: 18px;
		}
	}
</style>

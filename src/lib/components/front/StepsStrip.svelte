<!--
  The three steps at the right end of the gallery toolbar — print, cut, weave
  (docs/redesign/DESIGN.md §3 "Gallery"). Each one links to the illustrated
  guide page.

  Layout lives with the toolbar: `margin-left: auto` pushes the strip right on
  wide screens, it takes its own line below 1200px and is hidden below 700px.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import { href as routeHref } from '$lib/i18n/routes';
	import { PrinterIcon, ScissorsIcon, WeaveIcon } from '$lib/components/icons';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	let guideHref = $derived(routeHref('howTo', lang));
</script>

<div class="tb-steps">
	<a class="step" href={guideHref}>
		<span class="step-ic"><PrinterIcon size={24} /></span>
		<span class="step-txt">
			<span class="t">{t('stepPrintTitle', lang)}</span>
			<span class="d">{t('stepPrintHint', lang)}</span>
		</span>
	</a>
	<a class="step" href={guideHref}>
		<span class="step-ic"><ScissorsIcon size={24} /></span>
		<span class="step-txt">
			<span class="t">{t('stepCutTitle', lang)}</span>
			<span class="d">{t('stepCutHint', lang)}</span>
		</span>
	</a>
	<a class="step" href={guideHref}>
		<span class="step-ic"><WeaveIcon size={24} /></span>
		<span class="step-txt">
			<span class="t">{t('stepWeaveTitle', lang)}</span>
			<span class="d">{t('stepWeaveHint', lang)}</span>
		</span>
	</a>
</div>

<style>
	.tb-steps {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 26px;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		text-decoration: none;
	}

	.step-ic {
		flex: none;
		display: inline-flex;
		color: var(--green);
	}

	.step-txt {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.step .t {
		font-size: 14px;
		font-weight: 600;
		color: var(--deep);
	}

	.step .d {
		font-size: 12px;
		color: var(--muted);
	}

	.step:hover .t {
		color: var(--red);
	}

	@media (max-width: 1199px) {
		.tb-steps {
			margin-left: 0;
			flex-basis: 100%;
		}
	}

	@media (max-width: 699px) {
		.tb-steps {
			display: none;
		}
	}
</style>

<script lang="ts">
	import { t, type Language } from '$lib/i18n';

	let { step, lang }: { step: number; lang: Language } = $props();
	// A classic 3×3 template: a square cut area and a semicircular cap.
	const outline = 'M0 144V48a48 48 0 0 1 96 0v96';
</script>

{#snippet template(x: number, y: number, scale = 1, fill = 'white', cuts = true)}
	<g transform="translate({x} {y}) scale({scale})">
		<path d={`${outline}Z`} {fill} fill-opacity="0.9" />
		<path d={outline} class="ink" />
		{#if cuts}<path d="M32 144V48M64 144V48" class="ink" />{/if}
		<path d="M0 144H96" class="fold" />
	</g>
{/snippet}

{#snippet tablet()}
	<!-- The sage rim is a case: any tape lands outside the dark screen bezel. -->
	<rect x="76" y="16" width="268" height="270" rx="22" fill="var(--sage)" />
	<rect x="88" y="25" width="244" height="250" rx="15" fill="var(--deep)" />
	<rect x="100" y="41" width="220" height="215" rx="5" fill="white" />
	<circle cx="210" cy="33" r="2.5" fill="var(--sage)" />
	<path d="M188 265h44" stroke="var(--sage)" stroke-width="3" stroke-linecap="round" />
{/snippet}

{#snippet pencil(x: number, y: number)}
	<g transform="translate({x} {y}) rotate(38)">
		<path d="M0 0-6-17V-90H6v73Z" fill="var(--gold)" stroke="var(--deep)" stroke-width="1.4" />
		<path d="M-6-17 0 0 6-17" fill="#f4dec0" stroke="var(--deep)" stroke-width="1.2" />
		<path d="M-2.3-6.5 0 0 2.3-6.5" fill="var(--deep)" />
		<path d="M0-20v-66" stroke="#a37d37" stroke-width="1.3" />
		<path d="M-6-89v-10a6 6 0 0 1 12 0v10" fill="var(--red)" stroke="var(--deep)" />
	</g>
{/snippet}

{#snippet scissors(x: number, y: number, angle = 0)}
	<g transform="translate({x} {y}) rotate({angle})" fill="none" stroke="var(--deep)" stroke-width="3" stroke-linecap="round">
		<path d="M-12 25 6-30M12 25-6-30" />
		<circle cx="-14" cy="31" r="9" fill="var(--page)" />
		<circle cx="14" cy="31" r="9" fill="var(--page)" />
		<circle r="3" fill="var(--gold)" stroke-width="1.5" />
	</g>
{/snippet}

<svg viewBox="0 0 420 310" aria-hidden="true" focusable="false">
	{#if step <= 4}
		{@render tablet()}
		{#if step === 1}
			<rect x="122" y="58" width="176" height="180" rx="2" fill="var(--page)" stroke="var(--line)" />
			<text x="210" y="81" class="label">PDF</text>
			{@render template(165, 93, 0.94)}
			<g transform="translate(336 208)">
				<circle r="31" fill="var(--green)" />
				<path d="M0-14V8m-9-9 9 9 9-9M-14 12v6h28v-6" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
			</g>
		{:else if step === 2}
			{@render template(148, 66, 1.2)}
			<!-- A physical ruler across the full width, not a PDF zoom percentage. -->
			<rect x="132" y="243" width="172" height="28" rx="3" fill="#f1dfb3" stroke="#947342" />
			{#each Array.from({ length: 13 }, (_, i) => i) as mark (mark)}
				<path d="M{148 + mark * 9.6} 243v{mark % 2 === 0 ? 12 : 6}" stroke="#725a38" />
			{/each}
			<path d="M148 228v9m0-4h115.2m0-5v9" class="measure" />
			<rect x="161" y="194" width="92" height="25" rx="12" fill="var(--cream2)" />
			<text x="207" y="212" class="label">{t('noPrinterSizeLabel', lang)}</text>
		{:else if step === 3}
			{@render template(154, 64, 1.2)}
			<path d="M70 45H350V257H70Z" fill="#fbfcf7" fill-opacity="0.52" stroke="var(--sage-dark)" stroke-width="1.5" />
			<path d="M350 234v23h-23Z" fill="white" stroke="var(--sage-dark)" stroke-width="1.2" />
			<!-- Both pieces bridge the tracing sheet and the protective case rim. -->
			<path d="M78 32h12v35H78ZM330 32h12v35h-12Z" fill="var(--gold)" fill-opacity="0.75" />
			<path d="M44 86h21l18-27" class="leader" />
			<text x="41" y="108" class="label">{t('noPrinterCoverLabel', lang)}</text>
		{:else}
			{@render template(154, 64, 1.2)}
			<rect x="70" y="45" width="280" height="212" fill="#fbfcf7" fill-opacity="0.72" stroke="var(--sage-dark)" stroke-width="1.5" />
			<path d="M78 32h12v35H78ZM330 32h12v35h-12Z" fill="var(--gold)" fill-opacity="0.75" />
			<g transform="translate(154 64) scale(1.2)">
				<path d={outline} class="ink" />
				<path d="M32 144V48M64 144V73" class="ink" />
				<path d="M0 144H96" class="fold" />
			</g>
			{@render pencil(231, 152)}
			<text x="293" y="239" class="label fold-label">{t('noPrinterFoldLabel', lang)}</text>
		{/if}
	{:else if step === 5}
		<rect x="28" y="20" width="364" height="267" rx="18" fill="var(--page)" stroke="var(--line)" />
		<path d="M94 40h232v212H94Z" fill="white" stroke="var(--line)" />
		{@render template(152, 64, 1.2)}
		<path d="M267.2 121.6v76" stroke="var(--red)" stroke-width="3" fill="none" />
		{@render scissors(271, 227, 12)}
		<text x="210" y="280" class="label">{t('noPrinterTableLabel', lang)}</text>
	{:else if step === 6}
		<!-- Two layers below the template; the fold runs along their joined bottom. -->
		<rect x="85" y="47" width="242" height="198" rx="2" fill="var(--red)" />
		<path d="M85 245h242v5H85Z" fill="#93212a" />
		{@render template(145, 65, 1.25, '#fffdf3')}
		<path d="M85 245h242" class="fold" />
		<g transform="translate(231 70) rotate(17)" fill="none" stroke="var(--deep)" stroke-width="2.5" stroke-linecap="round">
			<path d="M0 8v25a6 6 0 0 0 12 0V4a9 9 0 0 0-18 0v33a12 12 0 0 0 24 0V12" />
		</g>
		<path d="M281 274h28v-24" class="leader" />
		<text x="243" y="279" class="label fold-label">{t('noPrinterFoldLabel', lang)}</text>
	{:else}
		{@render template(50, 48, 1.1, 'var(--red)', false)}
		{@render template(264, 48, 1.1, 'white', false)}
		<path d="M85.2 206.4V100.8M120.4 206.4V100.8" stroke="white" stroke-width="2.8" />
		<path d="M299.2 206.4V100.8M334.4 206.4V100.8" class="ink" />
		{@render scissors(120.4, 237)}
		<path d="M189 215V150m-7 9 7-9 7 9" class="measure" />
		<text x="317" y="239" class="label">{t('noPrinterLayersLabel', lang)}</text>
		<!-- Side view of a folded strip: joined at the right, open at the left. -->
		<path d="M277 254h65a7 7 0 0 1 0 14h-65" fill="none" stroke="var(--sage-dark)" stroke-width="3" stroke-linecap="round" />
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.ink {
		fill: none;
		stroke: var(--deep);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.fold {
		fill: none;
		stroke: #326b87;
		stroke-width: 2;
		stroke-dasharray: 6 4;
	}
	.label {
		fill: var(--deep);
		font: 600 16px 'Helvetica Neue', Helvetica, Arial, sans-serif;
		text-anchor: middle;
	}
	.fold-label {
		fill: #326b87;
	}
	.leader {
		fill: none;
		stroke: var(--green);
		stroke-width: 1.6;
	}
	.measure {
		fill: none;
		stroke: #326b87;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>

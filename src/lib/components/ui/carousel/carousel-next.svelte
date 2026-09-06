<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import type { WithoutChildren } from "bits-ui";
	import { getEmblaContext } from "./context.js";
	import { cn } from "$lib/utils.js";
	import { Button, type Props } from "$lib/components/ui/button/index.js";
	import { page } from "$app/stores";
	import { base } from "$app/paths";
	import { langFromPathname, t } from "$lib/i18n";

	let {
		ref = $bindable(null),
		class: className,
		variant = "outline",
		size = "icon",
		...restProps
	}: WithoutChildren<Props> = $props();

	const lang = $derived(langFromPathname($page.url.pathname, base));

	const emblaCtx = getEmblaContext("<Carousel.Next/>");
</script>

<Button
	data-slot="carousel-next"
	{variant}
	{size}
	aria-disabled={!emblaCtx.canScrollNext}
	class={cn(
		"absolute size-8 rounded-full",
		emblaCtx.orientation === "horizontal"
			? "-end-12 top-1/2 -translate-y-1/2"
			: "start-1/2 -bottom-12 -translate-x-1/2 rotate-90",
		className
	)}
	onclick={emblaCtx.scrollNext}
	onkeydown={emblaCtx.handleKeyDown}
	bind:ref
	{...restProps}
>
	<ArrowRightIcon class="size-4" />
	<span class="sr-only">{t("nextSlide", lang)}</span>
</Button>

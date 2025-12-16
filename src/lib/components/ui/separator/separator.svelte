<script lang="ts">
	import { Separator as SeparatorPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		orientation = "horizontal",
		decorative = false,
		...restProps
	}: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
	bind:ref
	data-slot="separator"
	{orientation}
	{decorative}
	class={cn(
		"shrink-0 bg-border",
		orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
		className,
	)}
	{...restProps}
/>


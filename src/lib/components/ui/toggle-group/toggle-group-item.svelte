<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		class: className,
		...restProps
	}: WithoutChildrenOrChild<ToggleGroupPrimitive.ItemProps> = $props();
</script>

<ToggleGroupPrimitive.Item
	data-slot="toggle-group-item"
	class={cn(
		"ring-offset-background hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
		className
	)}
	{...restProps}
/>


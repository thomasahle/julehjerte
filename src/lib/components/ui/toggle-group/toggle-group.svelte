<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type ToggleGroupValue = string | string[];

	function normalizeSingle(v: ToggleGroupValue | undefined): string {
		return typeof v === "string" ? v : "";
	}

	function normalizeMultiple(v: ToggleGroupValue | undefined): string[] {
		return Array.isArray(v) ? v : [];
	}

	let {
		ref = $bindable(null),
		value = $bindable<ToggleGroupValue | undefined>(undefined),
		onValueChange,
		type,
		class: className,
		...restProps
	}: {
		ref?: HTMLElement | null;
		value?: ToggleGroupValue;
		type: "single" | "multiple";
		onValueChange?: (v: ToggleGroupValue) => void;
		class?: string;
	} & Record<string, unknown> = $props();
</script>

{#if type === "single"}
	<ToggleGroupPrimitive.Root
		bind:ref
		type="single"
		value={normalizeSingle(value)}
		onValueChange={(v) => {
			value = v;
			onValueChange?.(v);
		}}
		data-slot="toggle-group"
		class={cn(
			"bg-muted text-muted-foreground inline-flex items-center justify-center gap-1 rounded-md p-1",
			className
		)}
		{...restProps}
	/>
{:else}
	<ToggleGroupPrimitive.Root
		bind:ref
		type="multiple"
		value={normalizeMultiple(value)}
		onValueChange={(v) => {
			value = v;
			onValueChange?.(v);
		}}
		data-slot="toggle-group"
		class={cn(
			"bg-muted text-muted-foreground inline-flex items-center justify-center gap-1 rounded-md p-1",
			className
		)}
		{...restProps}
	/>
{/if}

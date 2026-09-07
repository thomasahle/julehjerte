<script lang="ts">
	import type { Snippet } from "svelte";
	import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	type ToggleGroupValue = string | string[];

	function normalizeSingle(v: ToggleGroupValue | undefined): string {
		return typeof v === "string" ? v : "";
	}

	function normalizeMultiple(v: ToggleGroupValue | undefined): string[] {
		return Array.isArray(v) ? v : [];
	}

	// bits-ui always gives the root role="group" and, for type="single", gives the
	// items role="radio" — an invalid ownership relationship, since a radio's
	// required context role is radiogroup. `role` overrides the root's role;
	// bits-ui merges restProps *under* its own props, so it has to be applied here,
	// on the element the child snippet hands back.
	let {
		ref = $bindable(null),
		value = $bindable<ToggleGroupValue | undefined>(undefined),
		onValueChange,
		type,
		class: className,
		role = undefined,
		children,
		...restProps
	}: {
		ref?: HTMLElement | null;
		value?: ToggleGroupValue;
		type: "single" | "multiple";
		onValueChange?: (v: ToggleGroupValue) => void;
		class?: string;
		role?: string;
		children?: Snippet;
	} & Record<string, unknown> = $props();

	let rootClass = $derived(
		cn(
			"bg-muted text-muted-foreground inline-flex items-center justify-center gap-1 rounded-md p-1",
			className
		)
	);
</script>

{#snippet root(props: Record<string, unknown>)}
	<div {...props} role={role ?? (props.role as string | undefined)}>
		{@render children?.()}
	</div>
{/snippet}

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
		class={rootClass}
		{...restProps}
	>
		{#snippet child({ props })}
			{@render root(props)}
		{/snippet}
	</ToggleGroupPrimitive.Root>
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
		class={rootClass}
		{...restProps}
	>
		{#snippet child({ props })}
			{@render root(props)}
		{/snippet}
	</ToggleGroupPrimitive.Root>
{/if}

<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";

	type ProviderProps = TooltipPrimitive.ProviderProps & {
		children?: import("svelte").Snippet;
	};

	let { children }: ProviderProps = $props();
</script>

<TooltipPrimitive.Provider {children} />

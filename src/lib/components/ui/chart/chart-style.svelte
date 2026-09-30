<script lang="ts">
	import type { ChartConfig } from './chart-utils.js';

	let { id, config }: { id: string; config: ChartConfig } = $props();

	const colorConfig = $derived(
		config ? Object.entries(config).filter(([, itemConfig]) => itemConfig.color) : null
	);

	const colorStyles = $derived.by(() => {
		if (!colorConfig || !colorConfig.length) return;
		const colors = colorConfig.map(([key, itemConfig]) => `\t--color-${key}: ${itemConfig.color};`);
		return `[data-chart=${id}] {\n${colors.join('\n')}\n}`;
	});
</script>

{#if colorStyles}
	{#key id}
		<svelte:element this={'style'}>
			{colorStyles}
		</svelte:element>
	{/key}
{/if}

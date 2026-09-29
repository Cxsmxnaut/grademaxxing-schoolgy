<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		icon?: Snippet;
		meta?: string | null;
	}

	let { title, icon, meta }: Props = $props();
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
	<div class="flex items-center gap-2">
		{#if icon}{@render icon()}{/if}
		<h3 class="text-sm font-semibold tracking-tight">{title}</h3>
	</div>
	{#if meta}
		<span class="text-muted-foreground font-mono text-[0.6875rem] tracking-wide uppercase">
			{meta}
		</span>
	{/if}
</div>

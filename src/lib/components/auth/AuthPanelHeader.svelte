<script lang="ts">
	import { brand } from '$lib/brand';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	interface Props {
		backHref?: string;
	}
	let { backHref = '/' }: Props = $props();
</script>

<header class="mb-8 flex items-center justify-between gap-3">
	<a
		href="/"
		class="font-display flex min-w-0 items-center gap-2.5 text-lg font-bold tracking-tight"
	>
		<img src="/favicon.svg" class="size-8 shrink-0" alt="" /><span class="truncate">{brand}</span>
	</a>
	<Button
		href={backHref}
		variant="outline"
		class="h-10 border-[#294258] bg-transparent px-3.5 text-sm text-[#91aac2] hover:bg-white/5 hover:text-[#e4eef8]"
		><ArrowLeftIcon /> Back</Button
	>
</header>

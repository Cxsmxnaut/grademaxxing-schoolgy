<script lang="ts">
	import { brand } from '$lib/brand';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	interface Props {
		backHref?: string;
	}
	let { backHref = '/' }: Props = $props();
</script>

<header class="mb-[1.609375rem] flex items-center justify-between gap-3">
	<a
		href="/"
		class="flex min-w-0 items-center gap-2.5 text-[1.1rem] font-bold tracking-tight"
		style="font-family: 'Space Grotesk Variable', sans-serif"
	>
		<img src="/favicon.svg" class="size-[1.875rem] shrink-0" alt="" /><span class="truncate"
			>{brand}</span
		>
	</a>
	<Button
		href={backHref}
		variant="outline"
		class="h-[2.1875rem] rounded-lg border-[#294258] bg-transparent px-3 text-[0.78125rem] leading-[1.172rem] text-[#91aac2] shadow-none hover:bg-white/5 hover:text-[#e4eef8]"
		><ArrowLeftIcon /> Back</Button
	>
</header>

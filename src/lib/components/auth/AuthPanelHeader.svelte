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
		class="flex min-w-0 items-center gap-[0.5625rem] text-[1.1875rem] leading-[1.5] font-bold tracking-[-0.01em]"
		style="font-family: 'Space Grotesk Variable', sans-serif"
	>
		<img src="/favicon.svg" class="size-[1.875rem] shrink-0" alt="" />
		<span class="truncate text-[#e4eef8]">{brand}</span>
	</a>
	<Button
		href={backHref}
		variant="outline"
		class="h-auto rounded-[0.4375rem] border-[rgba(228,238,248,0.16)] bg-transparent px-3 py-[0.4375rem] text-[0.78125rem] leading-[1.5] font-semibold text-[#8fa9c2] shadow-none hover:border-[#4db6f5] hover:bg-transparent hover:text-[#e4eef8]"
		><ArrowLeftIcon class="size-3.5" strokeWidth={1.5} /> Back</Button
	>
</header>

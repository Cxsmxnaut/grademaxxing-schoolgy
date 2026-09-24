<script lang="ts">
	import { brandName } from '$lib/brand';
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
		style="font-family: 'Space Grotesk', sans-serif"
	>
		<img src="/grademaxxing-growth-logo.png" class="size-[2.125rem] shrink-0" alt="" />
		<span class="text-foreground flex min-w-0 whitespace-nowrap">
			<span class="text-[1rem] sm:text-[1.1875rem]">{brandName}</span>
		</span>
	</a>
	<Button
		href={backHref}
		variant="outline"
		class="border-input text-muted-foreground hover:border-primary hover:text-foreground h-auto rounded-[0.4375rem] bg-transparent px-3 py-[0.4375rem] text-[0.78125rem] leading-[1.5] font-semibold shadow-none hover:bg-transparent"
		><ArrowLeftIcon class="size-3.5" strokeWidth={1.5} /> Back</Button
	>
</header>

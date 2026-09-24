<script lang="ts">
	import { brand } from '$lib/brand';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		promo?: boolean;
	}
	let { children, promo = false }: Props = $props();
</script>

<div
	class={[
		'bg-background text-foreground min-h-screen text-[0.90625rem] leading-[1.5] lg:grid',
		promo && 'lg:grid-cols-[46%_54%]'
	]}
	style="font-family: 'Instrument Sans', system-ui, sans-serif"
>
	{#if promo}
		<aside
			class="relative hidden min-h-screen overflow-hidden bg-[#10161b] text-[#f1f5f7] lg:flex lg:flex-col"
		>
			<div class="relative my-auto max-w-2xl px-12 py-14 xl:px-16">
				<img src="/grademaxxing-growth-mark.png" class="mb-8 size-20" alt="" />
				<h1
					class="max-w-2xl text-[2.7rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance"
					style="font-family: 'Space Grotesk', sans-serif"
				>
					Your grades are complicated enough.
				</h1>
				<ul class="mt-5 space-y-3.5 text-[0.9375rem] font-medium text-[#aab7c5]">
					<li class="flex items-center gap-3">
						<CalculatorIcon class="size-[1.1875rem] text-[#6ea8dc]" strokeWidth={1.5} /> What-if calculator
					</li>
					<li class="flex items-center gap-3">
						<ChartLineIcon class="size-[1.1875rem] text-[#6ea8dc]" strokeWidth={1.5} /> Grade trends and
						impact
					</li>
					<li class="flex items-center gap-3">
						<ShieldCheckIcon class="size-[1.1875rem] text-[#6ea8dc]" strokeWidth={1.5} /> Your login is
						encrypted on your device
					</li>
				</ul>
				<p
					class="mt-12 text-xs leading-[1.125rem] text-[#8195ab]"
					style="font-family: 'IBM Plex Mono', monospace"
				>
					Built for students who want the useful picture.<br />{brand}
				</p>
			</div>
		</aside>
	{/if}
	<main
		class="app-canvas flex min-h-screen items-start justify-center overflow-y-auto px-4 py-6 sm:px-8 lg:items-center lg:px-10 lg:py-0"
	>
		{@render children()}
	</main>
</div>

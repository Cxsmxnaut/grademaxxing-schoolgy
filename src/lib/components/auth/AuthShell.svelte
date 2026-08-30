<script lang="ts">
	import '@fontsource-variable/instrument-sans';
	import '@fontsource-variable/space-grotesk';
	import '@fontsource/ibm-plex-mono';
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
	class={['min-h-screen bg-[#081522] text-[#e4eef8] lg:grid', promo && 'lg:grid-cols-[46%_54%]']}
	style="font-family: 'Instrument Sans Variable', system-ui, sans-serif"
>
	{#if promo}
		<aside
			class="relative hidden min-h-screen overflow-hidden border-r border-white/[0.04] bg-[linear-gradient(to_bottom,#081522,#0e2c4d)] lg:flex lg:flex-col"
		>
			<div class="relative my-auto max-w-2xl px-12 py-14 xl:px-16">
				<img src="/favicon.svg" class="mb-8 size-18 drop-shadow-lg" alt="" />
				<h1
					class="max-w-2xl text-[2.7rem] leading-[1.15] font-bold tracking-[-0.045em] text-balance"
					style="font-family: 'Space Grotesk Variable', sans-serif"
				>
					Know where your grades are headed.
				</h1>
				<ul class="mt-5 space-y-3.5 text-[0.9375rem] font-medium text-[#91aac2]">
					<li class="flex items-center gap-4">
						<CalculatorIcon class="size-5 text-[#4db6f5]" /> What-if calculator
					</li>
					<li class="flex items-center gap-4">
						<ChartLineIcon class="size-5 text-[#4db6f5]" /> Grade trends and impact
					</li>
					<li class="flex items-center gap-4">
						<ShieldCheckIcon class="size-5 text-[#4db6f5]" /> Your login is never stored
					</li>
				</ul>
				<p
					class="mt-12 text-xs leading-[1.125rem] text-[#607c96]"
					style="font-family: 'IBM Plex Mono', monospace"
				>
					Built for students who want the full picture.<br />{brand}
				</p>
			</div>
		</aside>
	{/if}
	<main
		class="flex min-h-screen items-start justify-center overflow-y-auto px-4 py-6 sm:px-8 lg:items-center lg:px-10 lg:py-8"
	>
		{@render children()}
	</main>
</div>

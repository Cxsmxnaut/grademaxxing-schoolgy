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
	class={['min-h-screen bg-[#071522] text-[#e4eef8] lg:grid', promo && 'lg:grid-cols-[46%_54%]']}
>
	{#if promo}
		<aside
			class="relative hidden min-h-screen overflow-hidden border-r border-white/[0.04] bg-[linear-gradient(145deg,#071522_0%,#0a1e31_58%,#0d2b49_100%)] lg:flex lg:flex-col"
		>
			<div
				class="absolute -top-40 -left-40 size-[32rem] rounded-full bg-[#2eaef0]/8 blur-3xl"
			></div>
			<div
				class="absolute right-[-12rem] bottom-[-12rem] size-[32rem] rounded-full bg-[#167fce]/10 blur-3xl"
			></div>
			<div class="relative my-auto max-w-2xl px-12 py-14 xl:px-16">
				<img src="/favicon.svg" class="mb-10 size-16 drop-shadow-lg" alt="" />
				<h1 class="max-w-2xl text-5xl leading-[1.08] font-bold tracking-[-0.045em] text-balance">
					Know where your grades are headed.
				</h1>
				<ul class="mt-8 space-y-4 text-base font-medium text-[#91aac2]">
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
				<p class="mt-12 font-mono text-sm leading-6 text-[#607c96]">
					Built for students who want the full picture.<br />{brand}
				</p>
			</div>
		</aside>
	{/if}
	<main
		class="flex min-h-screen items-center justify-center overflow-y-auto px-4 py-8 sm:px-8 lg:px-10"
	>
		{@render children()}
	</main>
</div>

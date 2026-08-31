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
		'min-h-screen bg-[#081522] text-[0.90625rem] leading-[1.5] text-[#e4eef8] lg:grid',
		promo && 'lg:grid-cols-[46%_54%]'
	]}
	style="font-family: 'Instrument Sans', system-ui, sans-serif"
>
	{#if promo}
		<aside
			class="relative hidden min-h-screen overflow-hidden bg-[linear-gradient(to_bottom,#081522,#0e2c4d)] lg:flex lg:flex-col"
		>
			<div class="relative my-auto max-w-2xl px-12 py-14 xl:px-16">
				<img src="/favicon.svg" class="mb-8 size-18" alt="" />
				<h1
					class="max-w-2xl text-[2.7rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance"
					style="font-family: 'Space Grotesk', sans-serif"
				>
					Know where your grades are headed.
				</h1>
				<ul class="mt-5 space-y-3.5 text-[0.9375rem] font-medium text-[#8fa9c2]">
					<li class="flex items-center gap-3">
						<CalculatorIcon class="size-[1.1875rem] text-[#4db6f5]" strokeWidth={1.5} /> What-if calculator
					</li>
					<li class="flex items-center gap-3">
						<ChartLineIcon class="size-[1.1875rem] text-[#4db6f5]" strokeWidth={1.5} /> Grade trends and
						impact
					</li>
					<li class="flex items-center gap-3">
						<ShieldCheckIcon class="size-[1.1875rem] text-[#4db6f5]" strokeWidth={1.5} /> Your login is
						never stored
					</li>
				</ul>
				<p
					class="mt-12 text-xs leading-[1.125rem] text-[#5c7891]"
					style="font-family: 'IBM Plex Mono', monospace"
				>
					Built for students who want the full picture.<br />{brand}
				</p>
			</div>
		</aside>
	{/if}
	<main
		class="flex min-h-screen items-start justify-center overflow-y-auto bg-[#081522] px-4 py-6 sm:px-8 lg:items-center lg:p-10"
		style="background-image: radial-gradient(900px 520px at 85% -10%, rgba(91, 142, 245, 0.12), transparent 62%), radial-gradient(720px 440px at -12% 22%, rgba(91, 142, 245, 0.08), transparent 60%);"
	>
		{@render children()}
	</main>
</div>

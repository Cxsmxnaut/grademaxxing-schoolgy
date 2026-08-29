<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import Disclaimer from '$lib/components/Disclaimer.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import BellDotIcon from '@lucide/svelte/icons/bell-dot';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import FolderLockIcon from '@lucide/svelte/icons/folder-lock';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, toggleMode } from 'mode-watcher';

	if (browser && localStorage.getItem(LocalStorageKey.token) !== null) {
		if (!acc.studentAccount) loadStudentAccount();
		void goto('/dashboard');
	}

	const features = [
		{
			icon: CalculatorIcon,
			title: 'Plan before the grade lands',
			description:
				'Test assignment scores, finals, and category changes without touching your real gradebook.'
		},
		{
			icon: ChartLineIcon,
			title: 'Understand what changed',
			description:
				'See grade trends, assignment impact, category weights, and hidden gradebook totals.'
		},
		{
			icon: BellDotIcon,
			title: 'Keep school in one place',
			description:
				'Review grades, attendance, documents, calendar events, and StudentVUE mail together.'
		},
		{
			icon: FolderLockIcon,
			title: 'Private by design',
			description:
				'Your password opens a secure StudentVUE session and is never stored by Grademaxxing.'
		}
	];
</script>

<svelte:head>
	<title>{brand} — understand your grades</title>
	<meta
		name="description"
		content="Understand StudentVUE grades, plan future scores, and keep school information in one focused dashboard."
	/>
</svelte:head>

<div class="min-h-screen">
	<header class="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
		<a href="/" class="flex items-center gap-2 text-lg font-bold tracking-tight">
			<img src="/favicon.svg" class="size-7" alt="" />
			{brand}
		</a>
		<nav aria-label="Public navigation" class="flex items-center gap-1 sm:gap-2">
			<Button
				variant="ghost"
				size="icon"
				onclick={toggleMode}
				aria-label={mode.current === 'dark' ? 'Use light mode' : 'Use dark mode'}
			>
				{#if mode.current === 'dark'}<SunIcon />{:else}<MoonIcon />{/if}
			</Button>
			<Button href="/login" variant="ghost">Log in</Button>
			<Button href="/signup">Get started</Button>
		</nav>
	</header>

	<main>
		<section
			class="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pt-14 text-center sm:px-8 sm:pt-20"
		>
			<p class="text-primary mb-4 text-sm font-semibold tracking-wide uppercase">
				Built around StudentVUE
			</p>
			<h1
				class="max-w-4xl text-5xl leading-[0.98] font-bold tracking-[-0.045em] text-balance sm:text-7xl"
			>
				Know where your grades are headed.
			</h1>
			<p class="text-muted-foreground mt-6 max-w-2xl text-lg text-balance sm:text-xl">
				See the numbers that matter, understand every change, and plan your next move without
				fighting the school portal.
			</p>
			<div class="mt-8 flex flex-col gap-3 sm:flex-row">
				<Button href="/login" size="lg" class="min-w-44">
					Connect StudentVUE <ArrowRightIcon />
				</Button>
				<Button href="#how-it-helps" size="lg" variant="outline" class="min-w-44">
					See how it helps
				</Button>
			</div>
			<p class="text-muted-foreground mt-4 text-xs">
				No password storage. No changes to your official grades.
			</p>

			<div
				class="bg-secondary/70 mt-14 w-full max-w-5xl rounded-2xl border p-2 shadow-[var(--surface-shadow)] sm:p-3"
			>
				<div class="bg-card overflow-hidden rounded-xl border">
					<div class="bg-secondary flex h-9 items-center gap-1.5 border-b px-4">
						<span class="bg-destructive size-2.5 rounded-full"></span>
						<span class="bg-warning size-2.5 rounded-full"></span>
						<span class="bg-success size-2.5 rounded-full"></span>
						<span class="text-muted-foreground mx-auto rounded-md border px-8 py-0.5 text-[10px]"
							>grademaxxing.app</span
						>
					</div>
					<img
						src="/demo_light.png"
						class="block w-full dark:hidden"
						width="1484"
						height="1060"
						alt="Grademaxxing grade planning interface"
					/>
					<img
						src="/demo_dark.png"
						class="hidden w-full dark:block"
						width="1484"
						height="1060"
						alt="Grademaxxing grade planning interface in dark mode"
					/>
				</div>
			</div>
		</section>

		<section
			id="how-it-helps"
			class="mx-auto w-full max-w-6xl scroll-mt-8 px-5 py-20 sm:px-8 sm:py-28"
		>
			<div class="mb-10 max-w-2xl">
				<p class="text-primary text-sm font-semibold tracking-wide uppercase">
					Useful, not distracting
				</p>
				<h2 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Answers you can act on.</h2>
				<p class="text-muted-foreground mt-3 text-lg">
					Focused tools for understanding school—not points, streaks, ranks, or rewards.
				</p>
			</div>
			<div class="grid gap-4 md:grid-cols-2">
				{#each features as { icon: Icon, title, description } (title)}
					<article class="bg-card rounded-xl border p-6 shadow-sm">
						<div
							class="bg-accent text-accent-foreground mb-5 flex size-10 items-center justify-center rounded-lg"
						>
							<Icon class="size-5" />
						</div>
						<h3 class="text-xl font-semibold">{title}</h3>
						<p class="text-muted-foreground mt-2 leading-relaxed">{description}</p>
					</article>
				{/each}
			</div>
		</section>

		<section class="border-y">
			<div
				class="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-5 py-12 text-center sm:px-8 md:flex-row md:text-left"
			>
				<div>
					<h2 class="text-2xl font-bold">Ready to make your grades make sense?</h2>
					<p class="text-muted-foreground mt-1">Connect your district and open your dashboard.</p>
				</div>
				<Button href="/login" size="lg">Log in with StudentVUE <ArrowRightIcon /></Button>
			</div>
		</section>
	</main>

	<Disclaimer />
</div>

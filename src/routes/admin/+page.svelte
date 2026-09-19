<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { onMount } from 'svelte';

	type Summary = {
		uniqueStudents: number;
		activeStudentsLast30Days: number;
		newStudentsLast30Days: number;
		dailyNewStudents: Array<{ date: string; count: number }>;
	};
	let password = $state('');
	let summary = $state<Summary | undefined>();
	let loading = $state(true);
	let signingIn = $state(false);
	let message = $state<string | undefined>();

	async function loadSummary() {
		loading = true;
		message = undefined;
		const response = await fetch('/api/admin/usage', { cache: 'no-store' });
		if (response.ok) {
			summary = (await response.json()) as Summary;
		} else if (response.status !== 401) {
			message = (await response.json().catch(() => ({ message: 'Unable to load usage.' }))).message;
		}
		loading = false;
	}

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		if (!password || signingIn) return;
		signingIn = true;
		message = undefined;
		const response = await fetch('/api/admin/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password })
		});
		password = '';
		if (!response.ok) {
			message = (await response.json().catch(() => ({ message: 'Unable to sign in.' }))).message;
			signingIn = false;
			return;
		}
		signingIn = false;
		await loadSummary();
	}

	async function signOut() {
		await fetch('/api/admin/session', { method: 'DELETE' });
		summary = undefined;
		message = undefined;
	}

	function chartPoints(data: Summary['dailyNewStudents']) {
		const maximum = Math.max(...data.map(({ count }) => count), 1);
		return data
			.map(({ count }, index) => {
				const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
				const y = 92 - (count / maximum) * 76;
				return `${x},${y}`;
			})
			.join(' ');
	}

	function chartLabel(date: string) {
		if (!date) return '—';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${date}T00:00:00Z`));
	}

	onMount(loadSummary);
</script>

<svelte:head><title>Private usage dashboard</title></svelte:head>

<main class="mx-auto flex min-h-screen w-full max-w-xl items-center px-5 py-10">
	<section class="bg-card w-full rounded-2xl border p-6 shadow-sm sm:p-8">
		<p class="text-primary text-xs font-bold tracking-[0.16em] uppercase">Private administration</p>
		<h1 class="mt-2 text-2xl font-bold tracking-tight">Beta usage</h1>
		<p class="text-muted-foreground mt-2 text-sm leading-6">
			Counts are derived from protected identifiers. This dashboard never displays names, emails,
			grades, or login records.
		</p>

		{#if summary}
			<div class="mt-7 grid gap-3 sm:grid-cols-3">
				<div class="bg-muted/50 rounded-xl p-5">
					<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
						Unique students
					</p>
					<p class="mt-2 text-4xl font-bold tabular-nums">{summary.uniqueStudents}</p>
					<p class="text-muted-foreground mt-1 text-xs">All time</p>
				</div>
				<div class="bg-muted/50 rounded-xl p-5">
					<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
						Active students
					</p>
					<p class="mt-2 text-4xl font-bold tabular-nums">{summary.activeStudentsLast30Days}</p>
					<p class="text-muted-foreground mt-1 text-xs">Past 30 days</p>
				</div>
				<div class="bg-muted/50 rounded-xl p-5">
					<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
						New students
					</p>
					<p class="mt-2 text-4xl font-bold tabular-nums">{summary.newStudentsLast30Days}</p>
					<p class="text-muted-foreground mt-1 text-xs">Past 30 days</p>
				</div>
			</div>
			<section class="bg-muted/30 mt-6 rounded-xl p-5" aria-labelledby="growth-heading">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-primary text-xs font-bold tracking-[0.16em] uppercase">Growth</p>
						<h2 id="growth-heading" class="mt-1 text-lg font-bold">New students by day</h2>
					</div>
					<span class="text-muted-foreground text-xs">Last 30 days · UTC</span>
				</div>
				<div
					class="mt-5"
					role="img"
					aria-label="New unique students per day for the last thirty days"
				>
					<svg
						class="h-44 w-full overflow-visible"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
					>
						<line
							x1="0"
							x2="100"
							y1="92"
							y2="92"
							class="stroke-border"
							vector-effect="non-scaling-stroke"
						/>
						<polyline
							points={chartPoints(summary.dailyNewStudents)}
							fill="none"
							class="stroke-primary"
							stroke-width="2"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
					<div class="text-muted-foreground mt-1 flex justify-between text-xs">
						<span>{chartLabel(summary.dailyNewStudents[0]?.date ?? '')}</span>
						<span>{chartLabel(summary.dailyNewStudents.at(-1)?.date ?? '')}</span>
					</div>
				</div>
			</section>
			<div class="mt-6"><Button variant="outline" onclick={signOut}>Sign out</Button></div>
		{:else if !loading}
			<form class="mt-7 space-y-4" onsubmit={signIn}>
				<div>
					<label for="admin-password" class="mb-1.5 block text-sm font-medium"
						>Administrator password</label
					>
					<Input
						id="admin-password"
						type="password"
						bind:value={password}
						autocomplete="current-password"
						required
					/>
				</div>
				{#if message}<p class="text-destructive text-sm" role="alert">{message}</p>{/if}
				<Button type="submit" disabled={signingIn || !password}
					>{signingIn ? 'Signing in…' : 'Open dashboard'}</Button
				>
			</form>
		{/if}
	</section>
</main>

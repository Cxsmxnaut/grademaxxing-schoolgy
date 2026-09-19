<script lang="ts">
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import ArrowDownRightIcon from '@lucide/svelte/icons/arrow-down-right';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import Repeat2Icon from '@lucide/svelte/icons/repeat-2';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { onMount } from 'svelte';

	type RangeDays = 7 | 30 | 90;
	type DailyUsage = {
		date: string;
		newStudents: number;
		activeStudents: number;
		totalStudents: number;
	};
	type Summary = {
		generatedAt: string;
		rangeDays: RangeDays;
		uniqueStudents: number;
		activeStudents: number;
		previousActiveStudents: number;
		newStudents: number;
		previousNewStudents: number;
		returningStudents: number;
		activeToday: number;
		trackingStartedAt: string | null;
		lastActivityAt: string | null;
		dailyUsage: DailyUsage[];
	};
	type TrendKey = 'activeStudents' | 'newStudents';

	const ranges: RangeDays[] = [7, 30, 90];
	let password = $state('');
	let summary = $state<Summary>();
	let rangeDays = $state<RangeDays>(30);
	let trendKey = $state<TrendKey>('activeStudents');
	let loading = $state(true);
	let signingIn = $state(false);
	let message = $state<string>();
	let chartIndex = $state<number>();
	let activeChange = $derived(
		summary ? change(summary.activeStudents, summary.previousActiveStudents) : undefined
	);
	let newChange = $derived(
		summary ? change(summary.newStudents, summary.previousNewStudents) : undefined
	);
	let selectedDay = $derived(summary?.dailyUsage[chartIndex ?? summary.dailyUsage.length - 1]);
	let maximumNew = $derived(
		summary ? Math.max(...summary.dailyUsage.map((day) => day.newStudents), 1) : 1
	);
	let returningShare = $derived(
		summary ? percent(summary.returningStudents, summary.activeStudents) : 0
	);
	let maxActive = $derived(
		summary ? Math.max(...summary.dailyUsage.map((day) => day.activeStudents), 1) : 1
	);

	async function loadSummary(nextRange = rangeDays) {
		loading = true;
		message = undefined;
		const response = await fetch(`/api/admin/usage?range=${nextRange}`, { cache: 'no-store' });
		if (response.ok) {
			summary = (await response.json()) as Summary;
			rangeDays = nextRange;
			chartIndex = undefined;
		} else if (response.status === 401) {
			summary = undefined;
		} else {
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

	function chartCoordinates(data: DailyUsage[], key: TrendKey) {
		const maximum = Math.max(...data.map((item) => item[key]), 1);
		return data.map((item, index) => ({
			x: data.length === 1 ? 50 : 4 + (index / (data.length - 1)) * 92,
			y: 88 - (item[key] / maximum) * 72
		}));
	}

	function linePath(data: DailyUsage[], key: TrendKey) {
		return chartCoordinates(data, key)
			.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
			.join(' ');
	}

	function areaPath(data: DailyUsage[], key: TrendKey) {
		const points = chartCoordinates(data, key);
		if (!points.length) return '';
		return `${linePath(data, key)} L ${points.at(-1)?.x ?? 96} 92 L ${points[0]?.x ?? 4} 92 Z`;
	}

	function chartDate(date: string) {
		if (!date) return '—';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${date}T00:00:00Z`));
	}

	function dateTime(value: string | null) {
		if (!value) return 'No activity yet';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	function compactNumber(value: number) {
		return new Intl.NumberFormat(undefined, {
			notation: value >= 1000 ? 'compact' : 'standard'
		}).format(value);
	}

	function percent(value: number, total: number) {
		return total > 0 ? Math.round((value / total) * 100) : 0;
	}

	function change(current: number, previous: number) {
		if (previous === 0) return { value: current === 0 ? '0%' : 'New', positive: current > 0 };
		const delta = Math.round(((current - previous) / previous) * 100);
		return { value: `${Math.abs(delta)}%`, positive: delta >= 0 };
	}

	function heatLevel(value: number, maximum: number) {
		if (value === 0) return 0;
		return Math.max(1, Math.min(4, Math.ceil((value / Math.max(maximum, 1)) * 4)));
	}

	onMount(loadSummary);
</script>

<svelte:head>
	<title>Grademaxxing Intelligence</title>
	<meta name="description" content="Private aggregate product intelligence for Grademaxxing." />
</svelte:head>

{#if summary}
	<div class="admin-app">
		<div class="ambient ambient-one"></div>
		<div class="ambient ambient-two"></div>
		<aside class="sidebar">
			<div class="brand-lockup">
				<div class="brand-mark"><ChartLineIcon size={20} strokeWidth={2.4} /></div>
				<div>
					<strong>Grade<span>maxxing</span></strong>
					<small>Intelligence</small>
				</div>
			</div>

			<nav aria-label="Dashboard sections">
				<a class="active" href="#overview"><ActivityIcon size={17} />Overview</a>
				<a href="#acquisition"><UserPlusIcon size={17} />Acquisition</a>
				<a href="#engagement"><Repeat2Icon size={17} />Engagement</a>
				<a href="#coverage"><Clock3Icon size={17} />Data coverage</a>
			</nav>

			<div class="sidebar-spacer"></div>
			<div class="privacy-card">
				<ShieldCheckIcon size={18} />
				<div>
					<strong>Privacy protected</strong>
					<p>Aggregate signals only. No names, emails, grades, or IP addresses.</p>
				</div>
			</div>
			<button class="sign-out" onclick={signOut}><LogOutIcon size={16} />Sign out</button>
		</aside>

		<main class="workspace">
			<header class="topbar">
				<div>
					<p class="eyebrow">Product intelligence / Live</p>
					<h1>Command center</h1>
					<p class="subtitle">A real-time pulse on Grademaxxing adoption and engagement.</p>
				</div>
				<div class="topbar-actions">
					<div class="live-pill"><span></span>Production live</div>
					<button class="icon-button" aria-label="Refresh dashboard" onclick={() => loadSummary()}>
						<RefreshCwIcon class={loading ? 'spin' : ''} size={17} />
					</button>
				</div>
			</header>

			<section id="overview" aria-labelledby="overview-heading">
				<div class="section-heading compact-heading">
					<div>
						<p class="section-kicker">Overview</p>
						<h2 id="overview-heading">The numbers that matter</h2>
					</div>
					<div class="range-switcher" aria-label="Analytics date range">
						{#each ranges as option (option)}
							<button
								class:active={rangeDays === option}
								disabled={loading}
								onclick={() => loadSummary(option)}>{option}D</button
							>
						{/each}
					</div>
				</div>

				<div class="metric-grid">
					<article class="metric-card metric-primary">
						<div class="metric-icon"><UsersIcon size={19} /></div>
						<p>Total students</p>
						<strong>{compactNumber(summary.uniqueStudents)}</strong>
						<span class="metric-detail">All-time verified identities</span>
						<div class="mini-bars" aria-hidden="true">
							{#each summary.dailyUsage.slice(-12) as day (day.date)}
								<i
									style={`height:${Math.max(12, percent(day.totalStudents, summary.uniqueStudents))}%`}
								></i>
							{/each}
						</div>
					</article>

					<article class="metric-card">
						<div class="metric-topline">
							<div class="metric-icon cyan"><ActivityIcon size={19} /></div>
							<span class:negative={!activeChange?.positive} class="change-badge">
								{#if activeChange?.positive}<ArrowUpRightIcon size={13} />{:else}<ArrowDownRightIcon
										size={13}
									/>{/if}
								{activeChange?.value}
							</span>
						</div>
						<p>Active students</p>
						<strong>{compactNumber(summary.activeStudents)}</strong>
						<span class="metric-detail">Past {rangeDays} days</span>
					</article>

					<article class="metric-card">
						<div class="metric-topline">
							<div class="metric-icon violet"><UserPlusIcon size={19} /></div>
							<span class:negative={!newChange?.positive} class="change-badge">
								{#if newChange?.positive}<ArrowUpRightIcon size={13} />{:else}<ArrowDownRightIcon
										size={13}
									/>{/if}
								{newChange?.value}
							</span>
						</div>
						<p>New students</p>
						<strong>{compactNumber(summary.newStudents)}</strong>
						<span class="metric-detail">vs. {summary.previousNewStudents} prior period</span>
					</article>

					<article class="metric-card">
						<div class="metric-icon green"><Repeat2Icon size={19} /></div>
						<p>Returning students</p>
						<strong>{compactNumber(summary.returningStudents)}</strong>
						<span class="metric-detail"
							>{percent(summary.returningStudents, summary.activeStudents)}% of active students</span
						>
					</article>
				</div>
			</section>

			<section class="analytics-grid" aria-label="Usage trends">
				<article class="panel trend-panel">
					<div class="panel-heading">
						<div>
							<p class="section-kicker">Momentum</p>
							<h2>Daily product pulse</h2>
							<p>Unique student activity and acquisition over the selected window.</p>
						</div>
						<div class="metric-toggle">
							<button
								class:active={trendKey === 'activeStudents'}
								onclick={() => (trendKey = 'activeStudents')}
								><span class="dot cyan-dot"></span>Active</button
							>
							<button
								class:active={trendKey === 'newStudents'}
								onclick={() => (trendKey = 'newStudents')}
								><span class="dot violet-dot"></span>New</button
							>
						</div>
					</div>

					<div class="chart-readout">
						<strong>{selectedDay?.[trendKey] ?? 0}</strong>
						<span
							>{trendKey === 'activeStudents' ? 'active' : 'new'} · {selectedDay
								? chartDate(selectedDay.date)
								: '—'}</span
						>
					</div>
					<div class="area-chart">
						<svg
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							role="img"
							aria-label="Daily student usage trend"
						>
							<defs>
								<linearGradient id="area-active" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="var(--admin-cyan)" stop-opacity="0.38" />
									<stop offset="100%" stop-color="var(--admin-cyan)" stop-opacity="0" />
								</linearGradient>
								<linearGradient id="area-new" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="var(--admin-violet)" stop-opacity="0.38" />
									<stop offset="100%" stop-color="var(--admin-violet)" stop-opacity="0" />
								</linearGradient>
							</defs>
							{#each [20, 44, 68, 92] as y (y)}
								<line
									x1="4"
									x2="96"
									{y}
									y2={y}
									class="grid-line"
									vector-effect="non-scaling-stroke"
								/>
							{/each}
							<path
								d={areaPath(summary.dailyUsage, trendKey)}
								class:violet-area={trendKey === 'newStudents'}
								class="chart-area"
							/>
							<path
								d={linePath(summary.dailyUsage, trendKey)}
								class:violet-line={trendKey === 'newStudents'}
								class="chart-line"
								vector-effect="non-scaling-stroke"
							/>
							{#each chartCoordinates(summary.dailyUsage, trendKey) as point, index (index)}
								<circle
									cx={point.x}
									cy={point.y}
									r="1.4"
									class:visible-point={chartIndex === index ||
										index === summary.dailyUsage.length - 1}
									class="chart-point"
									vector-effect="non-scaling-stroke"
								/>
							{/each}
						</svg>
						<div class="chart-hit-zones" aria-hidden="true">
							{#each summary.dailyUsage as _, index (index)}
								<button
									title={`Inspect ${chartDate(summary.dailyUsage[index]?.date ?? '')}`}
									onmouseenter={() => (chartIndex = index)}
									onfocus={() => (chartIndex = index)}
									tabindex="-1"
								></button>
							{/each}
						</div>
					</div>
					<div class="chart-axis">
						<span>{chartDate(summary.dailyUsage[0]?.date ?? '')}</span>
						<span
							>{chartDate(
								summary.dailyUsage[Math.floor(summary.dailyUsage.length / 2)]?.date ?? ''
							)}</span
						>
						<span>{chartDate(summary.dailyUsage.at(-1)?.date ?? '')}</span>
					</div>
				</article>

				<article id="engagement" class="panel pulse-panel">
					<div class="panel-heading">
						<div>
							<p class="section-kicker">Right now</p>
							<h2>Engagement pulse</h2>
						</div>
						<span class="signal"><i></i>Live</span>
					</div>
					<div class="pulse-hero">
						<div class="orbital">
							<div class="orbital-ring"></div>
							<div class="orbital-core">
								<strong>{summary.activeToday}</strong><span>active today</span>
							</div>
						</div>
					</div>
					<div class="pulse-row">
						<div>
							<span>Window reach</span><strong
								>{percent(summary.activeStudents, summary.uniqueStudents)}%</strong
							>
						</div>
						<div class="progress">
							<i style={`width:${percent(summary.activeStudents, summary.uniqueStudents)}%`}></i>
						</div>
					</div>
					<div class="pulse-row">
						<div>
							<span>Return share</span><strong
								>{percent(summary.returningStudents, summary.activeStudents)}%</strong
							>
						</div>
						<div class="progress violet-progress">
							<i style={`width:${percent(summary.returningStudents, summary.activeStudents)}%`}></i>
						</div>
					</div>
				</article>
			</section>

			<section id="acquisition" class="lower-grid" aria-labelledby="acquisition-heading">
				<article class="panel acquisition-panel">
					<div class="panel-heading">
						<div>
							<p class="section-kicker">Acquisition</p>
							<h2 id="acquisition-heading">New student velocity</h2>
							<p>First-time students added each UTC day.</p>
						</div>
						<div class="big-stat">
							<strong>{summary.newStudents}</strong><span>this period</span>
						</div>
					</div>
					<div class="bar-chart" role="img" aria-label="New students per day">
						{#each summary.dailyUsage as day (day.date)}
							<div class="bar-column" title={`${chartDate(day.date)}: ${day.newStudents} new`}>
								<i
									style={`height:${Math.max(day.newStudents > 0 ? 8 : 2, percent(day.newStudents, maximumNew))}%`}
								></i>
							</div>
						{/each}
					</div>
					<div class="chart-axis">
						<span>{chartDate(summary.dailyUsage[0]?.date ?? '')}</span><span>Today</span>
					</div>
				</article>

				<article class="panel mix-panel">
					<p class="section-kicker">Audience mix</p>
					<h2>Active composition</h2>
					<div class="donut-wrap">
						<div class="donut" style={`--share:${returningShare * 3.6}deg`}>
							<div><strong>{returningShare}%</strong><span>returning</span></div>
						</div>
					</div>
					<div class="legend-list">
						<div>
							<span><i class="legend-violet"></i>Returning</span><strong
								>{summary.returningStudents}</strong
							>
						</div>
						<div>
							<span><i class="legend-cyan"></i>New in window</span><strong
								>{summary.newStudents}</strong
							>
						</div>
					</div>
				</article>
			</section>

			<section class="lower-grid final-grid">
				<article class="panel heatmap-panel">
					<div class="panel-heading">
						<div>
							<p class="section-kicker">Consistency</p>
							<h2>Activity intensity</h2>
							<p>Daily unique activity across the selected range.</p>
						</div>
					</div>
					<div class="heatmap" style={`--heat-columns:${Math.ceil(summary.dailyUsage.length / 7)}`}>
						{#each summary.dailyUsage as day (day.date)}
							<i
								class={`heat-${heatLevel(day.activeStudents, maxActive)}`}
								title={`${chartDate(day.date)}: ${day.activeStudents} active`}
							></i>
						{/each}
					</div>
					<div class="heat-legend">
						<span>Less</span>{#each [0, 1, 2, 3, 4] as level (level)}<i class={`heat-${level}`}
							></i>{/each}<span>More</span>
					</div>
				</article>

				<article id="coverage" class="panel coverage-panel">
					<p class="section-kicker">Data coverage</p>
					<h2>Telemetry status</h2>
					<div class="coverage-list">
						<div>
							<span><Clock3Icon size={15} />Tracking since</span><strong
								>{dateTime(summary.trackingStartedAt)}</strong
							>
						</div>
						<div>
							<span><ActivityIcon size={15} />Last activity</span><strong
								>{dateTime(summary.lastActivityAt)}</strong
							>
						</div>
						<div>
							<span><RefreshCwIcon size={15} />Last synced</span><strong
								>{dateTime(summary.generatedAt)}</strong
							>
						</div>
						<div>
							<span><LockKeyholeIcon size={15} />Identity model</span><strong>HMAC protected</strong
							>
						</div>
					</div>
				</article>
			</section>

			<footer>
				<span>Grademaxxing Intelligence</span><span>Aggregate product analytics · UTC</span>
			</footer>
		</main>
	</div>
{:else}
	<main class="login-shell">
		<div class="login-grid"></div>
		<div class="login-glow login-glow-one"></div>
		<div class="login-glow login-glow-two"></div>
		<section class="login-story">
			<div class="brand-lockup login-brand">
				<div class="brand-mark"><ChartLineIcon size={20} strokeWidth={2.4} /></div>
				<div><strong>Grade<span>maxxing</span></strong><small>Intelligence</small></div>
			</div>
			<div class="story-copy">
				<p class="eyebrow">Private command center</p>
				<h1>See the signal.<br /><em>Shape the product.</em></h1>
				<p>A live, privacy-preserving view of adoption, engagement, and growth.</p>
			</div>
			<div class="story-stats">
				<div><ActivityIcon size={17} /><span>Live activity</span></div>
				<div><ChartLineIcon size={17} /><span>Growth intelligence</span></div>
				<div><ShieldCheckIcon size={17} /><span>Protected identities</span></div>
			</div>
		</section>

		<section class="login-panel">
			<div class="login-card">
				<div class="lock-badge"><LockKeyholeIcon size={20} /></div>
				<p class="section-kicker">Administrator access</p>
				<h2>Enter command center</h2>
				<p class="login-description">Use the private administrator password to continue.</p>
				{#if loading}
					<div class="loading-state"><i></i><span>Checking secure session…</span></div>
				{:else}
					<form onsubmit={signIn}>
						<label for="admin-password">Administrator password</label>
						<div class="password-wrap">
							<LockKeyholeIcon size={17} /><input
								id="admin-password"
								type="password"
								bind:value={password}
								autocomplete="current-password"
								required
								placeholder="Enter your private password"
							/>
						</div>
						{#if message}<p class="error-message" role="alert">{message}</p>{/if}
						<button class="login-button" type="submit" disabled={signingIn || !password}>
							{signingIn ? 'Authenticating…' : 'Open dashboard'}<ArrowUpRightIcon size={17} />
						</button>
					</form>
				{/if}
				<div class="security-note">
					<ShieldCheckIcon size={15} /><span>8-hour secure session · HttpOnly protection</span>
				</div>
			</div>
		</section>
	</main>
{/if}

<style>
	:global(body) {
		margin: 0;
		background: #05070d;
	}
	:global(html) {
		scroll-behavior: smooth;
	}
	.admin-app,
	.login-shell {
		--admin-cyan: #58d6ff;
		--admin-violet: #8b7cff;
		--admin-green: #56e5a2;
		min-height: 100vh;
		color: #eef4ff;
		font-family: 'Instrument Sans', sans-serif;
		background: #070a12;
	}
	.admin-app {
		display: grid;
		grid-template-columns: 248px minmax(0, 1fr);
		position: relative;
		overflow: hidden;
	}
	.admin-app::before {
		content: '';
		position: fixed;
		inset: 0;
		pointer-events: none;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
		background-size: 44px 44px;
		mask-image: linear-gradient(to bottom, black, transparent 70%);
	}
	.ambient {
		position: fixed;
		width: 420px;
		height: 420px;
		border-radius: 999px;
		filter: blur(110px);
		opacity: 0.12;
		pointer-events: none;
	}
	.ambient-one {
		background: var(--admin-cyan);
		top: -180px;
		left: 16%;
	}
	.ambient-two {
		background: var(--admin-violet);
		right: -180px;
		top: 38%;
	}
	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		z-index: 2;
		display: flex;
		flex-direction: column;
		padding: 28px 20px 22px;
		border-right: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(7, 10, 18, 0.82);
		backdrop-filter: blur(24px);
	}
	.brand-lockup {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.brand-mark {
		width: 38px;
		height: 38px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		color: #071018;
		background: linear-gradient(135deg, var(--admin-cyan), #9ef3ff);
		box-shadow: 0 0 30px rgba(88, 214, 255, 0.2);
	}
	.brand-lockup strong {
		display: block;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 16px;
		letter-spacing: -0.03em;
	}
	.brand-lockup strong span {
		color: var(--admin-cyan);
	}
	.brand-lockup small {
		display: block;
		margin-top: 1px;
		color: #6f7a92;
		font:
			600 9px/1.2 'IBM Plex Mono',
			monospace;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	nav {
		display: grid;
		gap: 6px;
		margin-top: 52px;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 43px;
		padding: 0 13px;
		border-radius: 10px;
		color: #7e8aa2;
		text-decoration: none;
		font-size: 13px;
		font-weight: 600;
		transition: 0.2s ease;
	}
	nav a:hover,
	nav a.active {
		color: #eef4ff;
		background: rgba(255, 255, 255, 0.055);
	}
	nav a.active {
		box-shadow: inset 2px 0 0 var(--admin-cyan);
	}
	nav a.active :global(svg) {
		color: var(--admin-cyan);
	}
	.sidebar-spacer {
		flex: 1;
	}
	.privacy-card {
		display: flex;
		gap: 10px;
		padding: 13px;
		border: 1px solid rgba(86, 229, 162, 0.12);
		border-radius: 12px;
		color: var(--admin-green);
		background: rgba(86, 229, 162, 0.045);
	}
	.privacy-card strong {
		display: block;
		color: #c8f8df;
		font-size: 11px;
	}
	.privacy-card p {
		margin: 4px 0 0;
		color: #738b81;
		font-size: 9px;
		line-height: 1.45;
	}
	.sign-out {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-top: 12px;
		padding: 10px 12px;
		border: 0;
		color: #69758b;
		background: transparent;
		font:
			600 11px/1 'Instrument Sans',
			sans-serif;
		cursor: pointer;
	}
	.sign-out:hover {
		color: #eef4ff;
	}
	.workspace {
		position: relative;
		z-index: 1;
		width: min(1500px, 100%);
		margin: 0 auto;
		padding: 34px clamp(24px, 3.5vw, 58px) 28px;
	}
	.topbar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 42px;
	}
	.eyebrow,
	.section-kicker {
		margin: 0 0 8px;
		color: var(--admin-cyan);
		font:
			600 9px/1.2 'IBM Plex Mono',
			monospace;
		letter-spacing: 0.19em;
		text-transform: uppercase;
	}
	h1,
	h2 {
		font-family: 'Space Grotesk', sans-serif;
	}
	.topbar h1 {
		margin: 0;
		font-size: clamp(30px, 4vw, 43px);
		line-height: 1;
		letter-spacing: -0.045em;
	}
	.subtitle {
		margin: 10px 0 0;
		color: #77839a;
		font-size: 13px;
	}
	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.live-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 13px;
		border: 1px solid rgba(86, 229, 162, 0.14);
		border-radius: 999px;
		color: #a5b4a9;
		background: rgba(86, 229, 162, 0.04);
		font-size: 10px;
		font-weight: 700;
	}
	.live-pill span,
	.signal i {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--admin-green);
		box-shadow: 0 0 12px var(--admin-green);
	}
	.icon-button {
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		color: #8793a9;
		background: rgba(255, 255, 255, 0.035);
		cursor: pointer;
	}
	.icon-button:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.07);
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	.section-heading,
	.panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
	}
	.compact-heading {
		align-items: end;
		margin-bottom: 17px;
	}
	.section-heading h2,
	.panel-heading h2,
	.mix-panel h2,
	.coverage-panel h2 {
		margin: 0;
		font-size: 17px;
		letter-spacing: -0.025em;
	}
	.panel-heading p:not(.section-kicker) {
		margin: 6px 0 0;
		color: #68748a;
		font-size: 11px;
	}
	.range-switcher,
	.metric-toggle {
		display: flex;
		padding: 3px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.025);
	}
	.range-switcher button,
	.metric-toggle button {
		height: 28px;
		padding: 0 12px;
		border: 0;
		border-radius: 7px;
		color: #667188;
		background: transparent;
		font:
			700 9px/1 'IBM Plex Mono',
			monospace;
		cursor: pointer;
	}
	.range-switcher button.active,
	.metric-toggle button.active {
		color: #eaf4ff;
		background: rgba(255, 255, 255, 0.08);
		box-shadow: 0 1px 5px rgba(0, 0, 0, 0.18);
	}
	.metric-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	.metric-card,
	.panel {
		position: relative;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.075);
		background: linear-gradient(145deg, rgba(18, 24, 38, 0.92), rgba(11, 15, 25, 0.9));
		box-shadow: 0 18px 50px rgba(0, 0, 0, 0.16);
	}
	.metric-card {
		min-height: 176px;
		padding: 18px;
		border-radius: 15px;
	}
	.metric-card::after {
		content: '';
		position: absolute;
		width: 120px;
		height: 120px;
		border-radius: 999px;
		right: -55px;
		top: -65px;
		background: var(--admin-cyan);
		filter: blur(60px);
		opacity: 0.05;
	}
	.metric-primary {
		background: linear-gradient(145deg, rgba(21, 42, 58, 0.95), rgba(11, 18, 29, 0.94));
		border-color: rgba(88, 214, 255, 0.16);
	}
	.metric-icon {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		margin-bottom: 20px;
		border-radius: 10px;
		color: var(--admin-cyan);
		background: rgba(88, 214, 255, 0.09);
	}
	.metric-icon.cyan {
		margin: 0;
	}
	.metric-icon.violet {
		margin: 0;
		color: var(--admin-violet);
		background: rgba(139, 124, 255, 0.1);
	}
	.metric-icon.green {
		color: var(--admin-green);
		background: rgba(86, 229, 162, 0.09);
	}
	.metric-topline {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 20px;
	}
	.metric-card p {
		margin: 0;
		color: #718097;
		font-size: 10px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.metric-card > strong {
		display: block;
		margin-top: 7px;
		font:
			700 31px/1 'Space Grotesk',
			sans-serif;
		letter-spacing: -0.05em;
	}
	.metric-detail {
		display: block;
		margin-top: 7px;
		color: #657187;
		font-size: 10px;
	}
	.change-badge {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 5px 7px;
		border-radius: 999px;
		color: var(--admin-green);
		background: rgba(86, 229, 162, 0.08);
		font:
			700 9px/1 'IBM Plex Mono',
			monospace;
	}
	.change-badge.negative {
		color: #ff858e;
		background: rgba(255, 100, 112, 0.08);
	}
	.mini-bars {
		position: absolute;
		right: 15px;
		bottom: 17px;
		width: 84px;
		height: 38px;
		display: flex;
		align-items: end;
		gap: 3px;
		opacity: 0.48;
	}
	.mini-bars i {
		flex: 1;
		min-height: 4px;
		border-radius: 2px 2px 0 0;
		background: linear-gradient(to top, rgba(88, 214, 255, 0.2), var(--admin-cyan));
	}
	.analytics-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.75fr) minmax(270px, 0.75fr);
		gap: 12px;
		margin-top: 12px;
	}
	.panel {
		border-radius: 17px;
		padding: 22px;
	}
	.trend-panel {
		min-height: 430px;
	}
	.metric-toggle {
		align-self: flex-start;
	}
	.metric-toggle button {
		display: flex;
		align-items: center;
		gap: 6px;
		text-transform: none;
		font-family: 'Instrument Sans', sans-serif;
		font-size: 9px;
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 999px;
	}
	.cyan-dot {
		background: var(--admin-cyan);
	}
	.violet-dot {
		background: var(--admin-violet);
	}
	.chart-readout {
		display: flex;
		align-items: baseline;
		gap: 9px;
		margin-top: 26px;
	}
	.chart-readout strong {
		font:
			700 28px/1 'Space Grotesk',
			sans-serif;
	}
	.chart-readout span {
		color: #647087;
		font-size: 10px;
	}
	.area-chart {
		position: relative;
		height: 235px;
		margin-top: 5px;
	}
	.area-chart svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.grid-line {
		stroke: rgba(255, 255, 255, 0.055);
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}
	.chart-area {
		fill: url(#area-active);
		transition: 0.3s ease;
	}
	.chart-area.violet-area {
		fill: url(#area-new);
	}
	.chart-line {
		fill: none;
		stroke: var(--admin-cyan);
		stroke-width: 2;
		filter: drop-shadow(0 0 5px rgba(88, 214, 255, 0.34));
		transition: 0.3s ease;
	}
	.chart-line.violet-line {
		stroke: var(--admin-violet);
		filter: drop-shadow(0 0 5px rgba(139, 124, 255, 0.35));
	}
	.chart-point {
		fill: #071018;
		stroke: var(--admin-cyan);
		stroke-width: 1.5;
		opacity: 0;
	}
	.chart-point.visible-point {
		opacity: 1;
	}
	.chart-hit-zones {
		position: absolute;
		inset: 0 3%;
		display: flex;
	}
	.chart-hit-zones button {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		cursor: crosshair;
	}
	.chart-axis {
		display: flex;
		justify-content: space-between;
		color: #515c70;
		font:
			500 8px/1 'IBM Plex Mono',
			monospace;
	}
	.pulse-panel {
		min-height: 430px;
	}
	.signal {
		display: flex;
		align-items: center;
		gap: 7px;
		color: #6f7c8f;
		font:
			700 8px/1 'IBM Plex Mono',
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.pulse-hero {
		display: grid;
		place-items: center;
		min-height: 225px;
	}
	.orbital {
		position: relative;
		width: 152px;
		height: 152px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: radial-gradient(circle, rgba(88, 214, 255, 0.09), transparent 67%);
	}
	.orbital::before,
	.orbital::after,
	.orbital-ring {
		content: '';
		position: absolute;
		border-radius: 999px;
		border: 1px solid rgba(88, 214, 255, 0.12);
	}
	.orbital::before {
		inset: 0;
		border-style: dashed;
		animation: orbit 22s linear infinite;
	}
	.orbital::after {
		inset: 19px;
		border-color: rgba(139, 124, 255, 0.15);
	}
	.orbital-ring {
		inset: 39px;
		background: radial-gradient(circle, rgba(88, 214, 255, 0.14), rgba(88, 214, 255, 0.025));
		box-shadow: 0 0 40px rgba(88, 214, 255, 0.08);
	}
	.orbital-core {
		position: relative;
		z-index: 1;
		text-align: center;
	}
	.orbital-core strong {
		display: block;
		font:
			700 34px/1 'Space Grotesk',
			sans-serif;
	}
	.orbital-core span {
		display: block;
		margin-top: 7px;
		color: #6d7a90;
		font-size: 9px;
	}
	.pulse-row {
		margin-top: 15px;
	}
	.pulse-row > div:first-child {
		display: flex;
		justify-content: space-between;
		color: #77839a;
		font-size: 10px;
	}
	.pulse-row strong {
		color: #cdd8e9;
		font-family: 'IBM Plex Mono', monospace;
	}
	.progress {
		height: 4px;
		margin-top: 8px;
		overflow: hidden;
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.05);
	}
	.progress i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #1f839f, var(--admin-cyan));
	}
	.violet-progress i {
		background: linear-gradient(90deg, #51449f, var(--admin-violet));
	}
	.lower-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(270px, 0.9fr);
		gap: 12px;
		margin-top: 12px;
	}
	.acquisition-panel,
	.mix-panel {
		min-height: 320px;
	}
	.big-stat {
		text-align: right;
	}
	.big-stat strong {
		display: block;
		font:
			700 24px/1 'Space Grotesk',
			sans-serif;
	}
	.big-stat span {
		display: block;
		margin-top: 5px;
		color: #59657a;
		font-size: 8px;
		text-transform: uppercase;
	}
	.bar-chart {
		display: flex;
		align-items: end;
		gap: clamp(2px, 0.35vw, 5px);
		height: 178px;
		margin-top: 24px;
		padding-top: 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		background: repeating-linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.04) 0 1px,
			transparent 1px 44px
		);
	}
	.bar-column {
		flex: 1;
		height: 100%;
		display: flex;
		align-items: end;
		min-width: 1px;
	}
	.bar-column i {
		display: block;
		width: 100%;
		min-height: 2px;
		border-radius: 3px 3px 0 0;
		background: linear-gradient(to top, rgba(139, 124, 255, 0.25), var(--admin-violet));
		opacity: 0.82;
		transition: 0.2s ease;
	}
	.bar-column:hover i {
		opacity: 1;
		filter: brightness(1.2);
	}
	.mix-panel h2,
	.coverage-panel h2 {
		margin-top: 0;
	}
	.donut-wrap {
		display: grid;
		place-items: center;
		margin: 25px 0 20px;
	}
	.donut {
		--share: 0deg;
		width: 150px;
		height: 150px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: conic-gradient(
			var(--admin-violet) 0 var(--share),
			rgba(88, 214, 255, 0.24) var(--share) 360deg
		);
		box-shadow: 0 0 35px rgba(139, 124, 255, 0.08);
	}
	.donut::before {
		content: '';
		grid-area: 1/1;
		width: 112px;
		height: 112px;
		border-radius: 999px;
		background: #0d111c;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
	}
	.donut > div {
		grid-area: 1/1;
		z-index: 1;
		text-align: center;
	}
	.donut strong {
		display: block;
		font:
			700 25px/1 'Space Grotesk',
			sans-serif;
	}
	.donut span {
		color: #69758b;
		font-size: 9px;
	}
	.legend-list {
		display: grid;
		gap: 10px;
	}
	.legend-list > div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #77839a;
		font-size: 10px;
	}
	.legend-list span {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.legend-list i {
		width: 7px;
		height: 7px;
		border-radius: 2px;
	}
	.legend-violet {
		background: var(--admin-violet);
	}
	.legend-cyan {
		background: var(--admin-cyan);
		opacity: 0.5;
	}
	.legend-list strong {
		color: #dce6f5;
		font-family: 'IBM Plex Mono', monospace;
	}
	.final-grid {
		grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr);
	}
	.heatmap-panel,
	.coverage-panel {
		min-height: 245px;
	}
	.heatmap {
		--heat-columns: 5;
		display: grid;
		grid-auto-flow: column;
		grid-template-rows: repeat(7, 1fr);
		grid-template-columns: repeat(var(--heat-columns), 1fr);
		gap: 5px;
		height: 115px;
		margin-top: 24px;
	}
	.heatmap i,
	.heat-legend i {
		display: block;
		border-radius: 3px;
		background: #151b28;
	}
	.heatmap i {
		min-width: 5px;
	}
	.heat-1 {
		background: rgba(88, 214, 255, 0.2) !important;
	}
	.heat-2 {
		background: rgba(88, 214, 255, 0.42) !important;
	}
	.heat-3 {
		background: rgba(88, 214, 255, 0.68) !important;
	}
	.heat-4 {
		background: var(--admin-cyan) !important;
		box-shadow: 0 0 10px rgba(88, 214, 255, 0.2);
	}
	.heat-legend {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 5px;
		margin-top: 13px;
		color: #59657a;
		font-size: 8px;
	}
	.heat-legend i {
		width: 10px;
		height: 10px;
	}
	.coverage-list {
		display: grid;
		gap: 3px;
		margin-top: 18px;
	}
	.coverage-list > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 11px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.055);
	}
	.coverage-list > div:last-child {
		border: 0;
	}
	.coverage-list span {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #657187;
		font-size: 9px;
	}
	.coverage-list strong {
		color: #c9d4e5;
		font:
			600 9px/1.3 'IBM Plex Mono',
			monospace;
		text-align: right;
	}
	footer {
		display: flex;
		justify-content: space-between;
		margin-top: 24px;
		color: #414a5b;
		font:
			500 8px/1 'IBM Plex Mono',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.login-shell {
		position: relative;
		overflow: hidden;
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(420px, 0.85fr);
	}
	.login-grid {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.024) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.024) 1px, transparent 1px);
		background-size: 54px 54px;
		mask-image: radial-gradient(circle at 28% 46%, black, transparent 68%);
	}
	.login-glow {
		position: absolute;
		border-radius: 999px;
		filter: blur(120px);
		opacity: 0.14;
	}
	.login-glow-one {
		width: 520px;
		height: 520px;
		left: -80px;
		top: -140px;
		background: var(--admin-cyan);
	}
	.login-glow-two {
		width: 440px;
		height: 440px;
		left: 38%;
		bottom: -220px;
		background: var(--admin-violet);
	}
	.login-story,
	.login-panel {
		position: relative;
		z-index: 1;
	}
	.login-story {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		padding: 42px clamp(34px, 6vw, 92px);
	}
	.login-brand {
		align-self: flex-start;
	}
	.story-copy {
		margin: auto 0;
		max-width: 680px;
	}
	.story-copy h1 {
		margin: 0;
		font-size: clamp(48px, 6.8vw, 94px);
		line-height: 0.94;
		letter-spacing: -0.065em;
	}
	.story-copy h1 em {
		color: transparent;
		font-style: normal;
		background: linear-gradient(100deg, var(--admin-cyan), #b0a7ff);
		background-clip: text;
	}
	.story-copy > p:last-child {
		max-width: 480px;
		margin: 24px 0 0;
		color: #748198;
		font-size: 15px;
		line-height: 1.6;
	}
	.story-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.story-stats > div {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 11px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 999px;
		color: #77849a;
		background: rgba(255, 255, 255, 0.025);
		font-size: 9px;
	}
	.story-stats :global(svg) {
		color: var(--admin-cyan);
	}
	.login-panel {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding: 30px;
		border-left: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(10, 13, 22, 0.72);
		backdrop-filter: blur(22px);
	}
	.login-card {
		width: min(390px, 100%);
		padding: 34px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 20px;
		background: linear-gradient(150deg, rgba(22, 28, 43, 0.9), rgba(12, 16, 27, 0.94));
		box-shadow: 0 34px 90px rgba(0, 0, 0, 0.28);
	}
	.lock-badge {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		margin-bottom: 26px;
		border: 1px solid rgba(88, 214, 255, 0.15);
		border-radius: 13px;
		color: var(--admin-cyan);
		background: rgba(88, 214, 255, 0.06);
	}
	.login-card h2 {
		margin: 0;
		font-size: 27px;
		letter-spacing: -0.04em;
	}
	.login-description {
		margin: 9px 0 27px;
		color: #6c788e;
		font-size: 12px;
	}
	.login-card label {
		display: block;
		margin-bottom: 8px;
		color: #a8b4c8;
		font-size: 10px;
		font-weight: 650;
	}
	.password-wrap {
		height: 46px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 13px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 10px;
		color: #59667d;
		background: rgba(0, 0, 0, 0.16);
		transition: 0.2s ease;
	}
	.password-wrap:focus-within {
		border-color: rgba(88, 214, 255, 0.48);
		box-shadow: 0 0 0 3px rgba(88, 214, 255, 0.07);
		color: var(--admin-cyan);
	}
	.password-wrap input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		color: #edf5ff;
		background: transparent;
		font:
			500 12px/1 'Instrument Sans',
			sans-serif;
	}
	.password-wrap input::placeholder {
		color: #465165;
	}
	.login-button {
		width: 100%;
		height: 46px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		margin-top: 14px;
		border: 0;
		border-radius: 10px;
		color: #061017;
		background: linear-gradient(100deg, var(--admin-cyan), #82e6ff);
		box-shadow: 0 12px 30px rgba(88, 214, 255, 0.12);
		font:
			750 11px/1 'Instrument Sans',
			sans-serif;
		cursor: pointer;
	}
	.login-button:hover {
		filter: brightness(1.08);
		transform: translateY(-1px);
	}
	.login-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		transform: none;
	}
	.error-message {
		margin: 10px 0 0;
		color: #ff8c96;
		font-size: 10px;
	}
	.security-note {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		margin-top: 23px;
		color: #4f5a6d;
		font-size: 8px;
	}
	.security-note :global(svg) {
		color: var(--admin-green);
	}
	.loading-state {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 0;
		color: #748198;
		font-size: 10px;
	}
	.loading-state i {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(88, 214, 255, 0.18);
		border-top-color: var(--admin-cyan);
		border-radius: 999px;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes orbit {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1100px) {
		.metric-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.analytics-grid,
		.lower-grid {
			grid-template-columns: 1fr;
		}
		.pulse-panel {
			min-height: auto;
		}
		.final-grid {
			grid-template-columns: 1fr;
		}
		.login-shell {
			grid-template-columns: 1fr;
		}
		.login-story {
			min-height: 55vh;
		}
		.login-panel {
			min-height: 45vh;
			border-left: 0;
			border-top: 1px solid rgba(255, 255, 255, 0.06);
		}
		.story-copy {
			margin: 80px 0;
		}
	}
	@media (max-width: 760px) {
		.admin-app {
			display: block;
		}
		.sidebar {
			position: relative;
			width: 100%;
			height: auto;
			flex-direction: row;
			align-items: center;
			padding: 16px 18px;
			border-right: 0;
			border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		}
		.sidebar nav,
		.privacy-card,
		.sidebar-spacer {
			display: none;
		}
		.sidebar .sign-out {
			margin: 0 0 0 auto;
		}
		.workspace {
			padding: 26px 16px;
		}
		.topbar {
			margin-bottom: 30px;
		}
		.topbar .subtitle,
		.live-pill {
			display: none;
		}
		.metric-grid {
			grid-template-columns: 1fr 1fr;
		}
		.metric-card {
			min-height: 160px;
		}
		.panel {
			padding: 18px;
		}
		.trend-panel {
			min-height: 390px;
		}
		.area-chart {
			height: 205px;
		}
		.login-story {
			min-height: auto;
			padding: 28px 22px 70px;
		}
		.story-copy {
			margin: 90px 0 60px;
		}
		.story-copy h1 {
			font-size: 52px;
		}
		.login-panel {
			padding: 24px 16px 44px;
		}
		.login-card {
			padding: 26px;
		}
	}
	@media (max-width: 480px) {
		.metric-grid {
			grid-template-columns: 1fr;
		}
		.topbar h1 {
			font-size: 31px;
		}
		.topbar-actions {
			align-self: flex-start;
		}
		.compact-heading {
			align-items: start;
			flex-direction: column;
		}
		.panel-heading {
			flex-direction: column;
		}
		.metric-toggle {
			align-self: stretch;
		}
		.metric-toggle button {
			flex: 1;
		}
		.story-stats {
			display: none;
		}
		.story-copy h1 {
			font-size: 44px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		.orbital::before,
		.spin,
		.loading-state i {
			animation: none;
		}
		.login-button {
			transition: none;
		}
	}
</style>

<script lang="ts">
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import BellIcon from '@lucide/svelte/icons/bell';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { onMount } from 'svelte';
	import './admin.css';

	type RangeDays = 7 | 30 | 90;
	type DailyUsage = {
		date: string;
		newStudents: number;
		activeStudents: number;
		totalStudents: number;
	};
	type ProtectedUser = {
		studentKey: string;
		firstSeenAt: string;
		lastSeenAt: string;
		activeDays: number;
		activeInRange: boolean;
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
		returningStudentsInRange: number;
		activeToday: number;
		trackingStartedAt: string | null;
		dailyTrackingStartedAt: string | null;
		lastActivityAt: string | null;
		dailyUsage: DailyUsage[];
		users: ProtectedUser[];
	};

	const ranges: RangeDays[] = [7, 30, 90];
	let password = $state('');
	let summary = $state<Summary>();
	let rangeDays = $state<RangeDays>(30);
	let loading = $state(true);
	let signingIn = $state(false);
	let message = $state<string>();
	let selectedDayIndex = $state<number>();
	let userSearch = $state('');
	let copiedKey = $state<string>();

	let activeReach = $derived(summary ? percent(summary.activeStudents, summary.uniqueStudents) : 0);
	let returningShare = $derived(
		summary ? percent(summary.returningStudents, summary.uniqueStudents) : 0
	);
	let filteredUsers = $derived(
		summary?.users.filter((user) =>
			user.studentKey.toLowerCase().includes(userSearch.trim().toLowerCase())
		) ?? []
	);
	let peakDaily = $derived(
		summary ? Math.max(...summary.dailyUsage.map((day) => day.activeStudents), 0) : 0
	);
	let recentDays = $derived(
		summary ? [...summary.dailyUsage].reverse().slice(0, 5) : ([] as DailyUsage[])
	);
	let selectedDay = $derived(
		summary?.dailyUsage[selectedDayIndex ?? summary.dailyUsage.length - 1]
	);

	async function loadSummary(nextRange = rangeDays) {
		loading = true;
		message = undefined;
		const response = await fetch(`/api/admin/usage?range=${nextRange}`, { cache: 'no-store' });
		if (response.ok) {
			summary = (await response.json()) as Summary;
			rangeDays = nextRange;
			selectedDayIndex = undefined;
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

	function percent(value: number, total: number) {
		return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
	}

	function compactNumber(value: number) {
		return new Intl.NumberFormat(undefined, {
			notation: value >= 1000 ? 'compact' : 'standard',
			maximumFractionDigits: 1
		}).format(value);
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

	function calendarDate(value: string | null) {
		if (!value) return '—';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
	}

	async function copyProtectedKey(key: string) {
		await navigator.clipboard.writeText(key);
		copiedKey = key;
		window.setTimeout(() => {
			if (copiedKey === key) copiedKey = undefined;
		}, 1500);
	}

	function chartCoordinates(data: DailyUsage[]) {
		const maximum = Math.max(...data.map((item) => item.activeStudents), 1);
		return data.map((item, index) => ({
			x: data.length === 1 ? 50 : 4 + (index / (data.length - 1)) * 92,
			y: 84 - (item.activeStudents / maximum) * 62
		}));
	}

	function linePath(data: DailyUsage[]) {
		return chartCoordinates(data)
			.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
			.join(' ');
	}

	function dotLevel(day: DailyUsage, maximum: number) {
		if (day.activeStudents === 0) return 1;
		return Math.max(1, Math.min(6, Math.ceil((day.activeStudents / Math.max(maximum, 1)) * 6)));
	}

	function recentDayIndex(index: number) {
		const total = summary?.dailyUsage.length ?? 0;
		return total - Math.min(16, total) + index;
	}

	function greeting() {
		const hour = new Date().getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 18) return 'Good afternoon';
		return 'Good evening';
	}

	onMount(loadSummary);
</script>

<svelte:head>
	<title>Grademaxxing Admin</title>
	<meta name="description" content="Private aggregate product analytics for Grademaxxing." />
</svelte:head>

{#if summary}
	<div class="admin-stage">
		<div class="dashboard-shell">
			<header class="site-header">
				<a class="brand-button" href="#overview" aria-label="Grademaxxing admin home">
					<SparklesIcon size={21} strokeWidth={2.5} />
				</a>
				<nav aria-label="Dashboard sections">
					<a class="active" href="#overview">Dashboard</a>
					<a href="#growth">Growth</a>
					<a href="#engagement">Engagement</a>
					<a href="#coverage">Coverage</a>
				</nav>
				<div class="header-tools">
					<div class="search-pill" aria-hidden="true">
						<SearchIcon size={17} /><span>Search...</span>
					</div>
					<button class="round-tool" aria-label="Notifications"><BellIcon size={17} /></button>
					<button class="admin-avatar" aria-label="Administrator profile">CX</button>
				</div>
			</header>

			<div class="dashboard-body">
				<main class="main-column">
					<section class="welcome-row" id="overview">
						<div>
							<p class="breadcrumb"><span>Admin</span><i>›</i>Dashboard</p>
							<h1>{greeting()}, admin</h1>
						</div>
						<div class="welcome-actions">
							<button class="soft-button" onclick={() => loadSummary()} disabled={loading}>
								<RefreshCwIcon class={loading ? 'spin' : ''} size={16} />Refresh
							</button>
							<div class="range-picker">
								<CalendarDaysIcon size={16} />
								{#each ranges as option (option)}
									<button
										class:active={rangeDays === option}
										disabled={loading}
										onclick={() => loadSummary(option)}>{option}d</button
									>
								{/each}
							</div>
							<button class="green-button" onclick={() => window.print()}
								><PlusIcon size={16} />Add report</button
							>
						</div>
					</section>

					<div class="primary-grid">
						<section class="identity-column" aria-label="Analytics identity and privacy">
							<article class="identity-card">
								<div class="identity-orbit orbit-one"></div>
								<div class="identity-orbit orbit-two"></div>
								<div class="identity-monogram">G</div>
								<div class="verified-pill"><ShieldCheckIcon size={14} />Private by design</div>
								<div class="identity-caption">
									<div><strong>Grademaxxing</strong><span>Product analytics</span></div>
									<button aria-label="Privacy details"><LockKeyholeIcon size={17} /></button>
								</div>
							</article>

							<article class="small-card worktime-card">
								<p class="card-label">Active today</p>
								<div class="card-stat-row">
									<strong>{summary.activeToday} students</strong><span
										><ActivityIcon size={12} />Live</span
									>
								</div>
								<svg
									viewBox="0 0 100 80"
									preserveAspectRatio="none"
									aria-label="Daily activity line"
								>
									{#each [24, 50, 76] as y (y)}<line
											x1="0"
											x2="100"
											{y}
											y2={y}
											class="mini-grid"
										/>{/each}
									<path
										d={linePath(summary.dailyUsage)}
										class="mini-line"
										vector-effect="non-scaling-stroke"
									/>
								</svg>
								<div class="small-card-foot">
									<Clock3Icon size={13} />Last seen: {dateTime(summary.lastActivityAt)}
								</div>
							</article>
						</section>

						<section class="content-column">
							<article class="hero-card">
								<div class="hero-main">
									<div class="hero-number-row">
										<div class="hero-icon"><UsersIcon size={22} /></div>
										<strong>{compactNumber(summary.uniqueStudents)}</strong><span
											class="success-chip">+{summary.newStudents}</span
										>
									</div>
									<p>successful StudentVUE logins / all time</p>
									<div class="dot-wave" aria-label="Daily activity intensity">
										{#each summary.dailyUsage.slice(-30) as day (day.date)}
											<div
												class="dot-column"
												title={`${chartDate(day.date)}: ${day.activeStudents} active`}
											>
												{#each [6, 5, 4, 3, 2, 1] as level (level)}<i
														class:filled={level <= dotLevel(day, peakDaily)}
													></i>{/each}
											</div>
										{/each}
									</div>
									<div class="dot-legend">
										<span>Quiet</span><i></i><i></i><i></i><i></i><span>Busy</span>
									</div>
								</div>
								<div class="hero-side">
									<div class="reach-tile dark-tile">
										<div><ActivityIcon size={15} /><span>+{summary.activeToday} today</span></div>
										<strong>{activeReach}%</strong>
										<p>Active reach</p>
									</div>
									<div class="reach-tile light-tile">
										<div>
											<RefreshCwIcon size={15} /><span>{summary.returningStudents} users</span>
										</div>
										<strong>{returningShare}%</strong>
										<p>Returned on another day</p>
									</div>
								</div>
							</article>

							<div class="lower-cards">
								<article class="small-card team-card" id="growth">
									<div class="panel-title-row">
										<div>
											<p class="card-label">Total adoption</p>
											<h2>Track your growth</h2>
										</div>
										<button aria-label="View growth"><ChevronRightIcon size={18} /></button>
									</div>
									<div class="semi-gauge" style={`--reach:${Math.max(activeReach, 4) * 1.8}deg`}>
										<div><strong>{summary.activeStudents}</strong><span>active students</span></div>
									</div>
									<div class="legend-rows">
										<div>
											<span><i class="green-dot"></i>Active</span><strong
												>{summary.activeStudents}</strong
											>
										</div>
										<div>
											<span><i class="teal-dot"></i>Returned</span><strong
												>{summary.returningStudents}</strong
											>
										</div>
										<div>
											<span><i class="gray-dot"></i>New</span><strong>{summary.newStudents}</strong>
										</div>
									</div>
								</article>

								<article class="small-card talent-card" id="engagement">
									<div class="panel-title-row">
										<div>
											<p class="card-label">Engagement statistics</p>
											<h2>Daily activity</h2>
										</div>
										<button aria-label="View engagement"><ChevronRightIcon size={18} /></button>
									</div>
									<div class="activity-portraits">
										<div class="portrait-tile green-portrait">
											<UsersIcon size={26} /><span>Active</span>
										</div>
										<div class="portrait-tile cream-portrait">
											<UserPlusIcon size={26} /><span>New</span>
										</div>
										<div class="join-tile"><ActivityIcon size={22} /><span>Live pulse</span></div>
									</div>
									<div class="activity-scale-head">
										<strong>{selectedDay?.activeStudents ?? 0} active</strong><span
											>{selectedDay ? chartDate(selectedDay.date) : 'Today'}</span
										>
									</div>
									<div class="activity-bars">
										{#each summary.dailyUsage.slice(-16) as day, index (day.date)}
											<button
												class:active={selectedDayIndex === recentDayIndex(index)}
												style={`--bar-height:${Math.max(15, percent(day.activeStudents, peakDaily))}%`}
												onmouseenter={() => (selectedDayIndex = recentDayIndex(index))}
												onfocus={() => (selectedDayIndex = recentDayIndex(index))}
												aria-label={`${chartDate(day.date)}: ${day.activeStudents} active students`}
												><i></i></button
											>
										{/each}
									</div>
									<div class="bar-legend">
										<span><i></i>Recorded</span><span><i></i>No activity</span>
									</div>
								</article>
							</div>
						</section>
					</div>

					<section class="user-directory" aria-labelledby="protected-users-heading">
						<div class="directory-heading">
							<div>
								<p class="card-label">Privacy-safe user registry</p>
								<h2 id="protected-users-heading">Protected users</h2>
								<p>Every successful login, represented only by its one-way protected key.</p>
							</div>
							<label class="directory-search">
								<SearchIcon size={16} />
								<span class="sr-only">Search protected user keys</span>
								<input bind:value={userSearch} placeholder="Search protected key" />
							</label>
						</div>
						<div class="directory-facts">
							<div><strong>{summary.uniqueStudents}</strong><span>signed up</span></div>
							<div><strong>{summary.returningStudents}</strong><span>returned</span></div>
							<div>
								<strong>{summary.activeStudents}</strong><span>active in {rangeDays}d</span>
							</div>
							<div>
								<strong>{summary.returningStudentsInRange}</strong><span>older users back</span>
							</div>
						</div>
						<div class="directory-table-wrap">
							<table>
								<thead>
									<tr>
										<th>Protected key</th>
										<th>First seen</th>
										<th>Last seen</th>
										<th>Observed days</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									{#each filteredUsers as user (user.studentKey)}
										<tr>
											<td>
												<div class="protected-key">
													<code>{user.studentKey}</code>
													<button
														type="button"
														onclick={() => copyProtectedKey(user.studentKey)}
														aria-label="Copy protected user key"
													>
														{#if copiedKey === user.studentKey}<CheckIcon
																size={14}
															/>{:else}<CopyIcon size={14} />{/if}
													</button>
												</div>
											</td>
											<td>{calendarDate(user.firstSeenAt)}</td>
											<td>{dateTime(user.lastSeenAt)}</td>
											<td>{user.activeDays}</td>
											<td>
												<span class:returned={user.activeDays >= 2} class="user-status">
													{user.activeDays >= 2 ? 'Returned' : 'New'}
												</span>
											</td>
										</tr>
									{:else}
										<tr
											><td colspan="5" class="directory-empty"
												>No protected key matches that search.</td
											></tr
										>
									{/each}
								</tbody>
							</table>
						</div>
						<p class="directory-note">
							Daily return tracking is complete from {calendarDate(summary.dailyTrackingStartedAt)}.
							Earlier returns are shown only when the stored first and last observations prove
							activity on different days.
						</p>
					</section>
				</main>

				<aside class="activity-rail" id="coverage">
					<div class="rail-heading">
						<p>Latest signals</p>
						<h2>Recent activity</h2>
					</div>
					<div class="activity-list">
						{#each recentDays as day, index (day.date)}
							<div class="activity-item">
								<div class={`day-avatar avatar-${index % 4}`}><ActivityIcon size={16} /></div>
								<div class="activity-copy">
									<strong>{chartDate(day.date)}</strong><span
										>{day.activeStudents} active · {day.newStudents} new</span
									>
								</div>
								<span class:quiet={day.activeStudents === 0} class="status-pill"
									><i></i>{day.activeStudents === 0 ? 'Quiet' : 'Done'}</span
								>
							</div>
						{/each}
					</div>

					<article class="summary-card">
						<div class="summary-primary">
							<span>Total students</span><strong>{compactNumber(summary.uniqueStudents)}</strong>
						</div>
						<div class="summary-row selected">
							<span>Active window</span><strong>{summary.activeStudents}</strong>
						</div>
						<div class="summary-row">
							<span>New students</span><strong>{summary.newStudents}</strong>
						</div>
						<div class="summary-row muted">
							<span>Active today</span><strong>{summary.activeToday}</strong>
						</div>
						<div class="summary-total">
							<span>All-time return rate</span><strong>{returningShare}%</strong>
						</div>
						<div class="summary-footer">
							<div><CheckIcon size={16} /></div>
							<p><span>Last activity</span><strong>{dateTime(summary.lastActivityAt)}</strong></p>
						</div>
					</article>
					<div class="rail-bottom">
						<div><ShieldCheckIcon size={15} /><span>Aggregate data only</span></div>
						<button onclick={signOut}><LogOutIcon size={15} />Sign out</button>
					</div>
				</aside>
			</div>
		</div>
	</div>
{:else if !loading}
	<div class="login-stage">
		<div class="login-shell">
			<header class="login-header">
				<div class="brand-button"><SparklesIcon size={21} strokeWidth={2.5} /></div>
				<strong>Grademaxxing</strong><span>Private administration</span>
			</header>
			<div class="login-grid">
				<section class="login-showcase">
					<p class="breadcrumb"><span>Portal</span><i>›</i>Secure access</p>
					<h1>Your product pulse,<br />beautifully clear.</h1>
					<p>Private aggregate analytics for understanding Grademaxxing adoption and engagement.</p>
					<div class="showcase-card">
						<div class="showcase-orb"><ActivityIcon size={30} /></div>
						<div class="showcase-dots">
							{#each Array(32) as _, index (index)}<i class:bright={index % 3 !== 0}></i>{/each}
						</div>
						<div>
							<ShieldCheckIcon size={17} /><span>No names, emails, grades, or IP addresses</span>
						</div>
					</div>
				</section>
				<section class="login-panel">
					<div class="login-icon"><LockKeyholeIcon size={22} /></div>
					<p class="card-label">Administrator access</p>
					<h2>Welcome back</h2>
					<p>Enter the private dashboard password to continue.</p>
					<form onsubmit={signIn}>
						<label for="admin-password">Password</label>
						<input
							id="admin-password"
							type="password"
							bind:value={password}
							autocomplete="current-password"
							placeholder="Enter administrator password"
							required
						/>
						{#if message}<p class="login-error" role="alert">{message}</p>{/if}
						<button type="submit" disabled={signingIn || !password}
							>{signingIn ? 'Opening dashboard…' : 'Open dashboard'}<ChevronRightIcon
								size={17}
							/></button
						>
					</form>
					<div class="login-note">
						<ShieldCheckIcon size={15} />Protected by a signed, expiring session.
					</div>
				</section>
			</div>
		</div>
	</div>
{:else}
	<div class="loading-stage">
		<div>
			<div class="loading-mark"><SparklesIcon size={25} /></div>
			<p>Loading analytics…</p>
		</div>
	</div>
{/if}

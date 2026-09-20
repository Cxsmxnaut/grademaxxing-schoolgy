<script lang="ts">
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle-2';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { onMount } from 'svelte';
	import './admin.css';

	type RangeDays = 7 | 30 | 90;
	type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'resolved' | 'dismissed';
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
		lastActivityAt: string | null;
		dailyUsage: DailyUsage[];
		users: ProtectedUser[];
	};
	type FeedbackItem = {
		id: string;
		kind: 'Bug report' | 'Grade question' | 'Feature idea';
		message: string;
		pagePath: string;
		appVersion: string;
		status: FeedbackStatus;
		adminNote: string;
		createdAt: string;
		updatedAt: string;
	};

	const ranges: RangeDays[] = [7, 30, 90];
	const statuses: Array<{ value: FeedbackStatus; label: string }> = [
		{ value: 'new', label: 'New' },
		{ value: 'reviewing', label: 'Reviewing' },
		{ value: 'planned', label: 'Planned' },
		{ value: 'resolved', label: 'Resolved' },
		{ value: 'dismissed', label: 'Dismissed' }
	];
	let password = $state('');
	let summary = $state<Summary>();
	let feedback = $state<FeedbackItem[]>([]);
	let rangeDays = $state<RangeDays>(30);
	let authenticated = $state(false);
	let loading = $state(true);
	let signingIn = $state(false);
	let message = $state<string>();
	let view = $state<'overview' | 'feedback'>('overview');
	let feedbackFilter = $state<'all' | FeedbackStatus>('all');
	let feedbackSearch = $state('');
	let userSearch = $state('');
	let savingId = $state<string>();

	let openFeedback = $derived(
		feedback.filter((item) => !['resolved', 'dismissed'].includes(item.status)).length
	);
	let filteredFeedback = $derived(
		feedback.filter((item) => {
			const query = feedbackSearch.trim().toLowerCase();
			return (
				(feedbackFilter === 'all' || item.status === feedbackFilter) &&
				(!query ||
					item.message.toLowerCase().includes(query) ||
					item.kind.toLowerCase().includes(query) ||
					item.pagePath.toLowerCase().includes(query))
			);
		})
	);
	let filteredUsers = $derived(
		summary?.users.filter((user) =>
			user.studentKey.toLowerCase().includes(userSearch.trim().toLowerCase())
		) ?? []
	);
	let peakDaily = $derived(
		Math.max(...(summary?.dailyUsage.map((day) => day.activeStudents) ?? []), 1)
	);

	async function loadWorkspace(nextRange = rangeDays) {
		loading = true;
		message = undefined;
		const [usageResponse, feedbackResponse] = await Promise.all([
			fetch(`/api/admin/usage?range=${nextRange}`, { cache: 'no-store' }),
			fetch('/api/admin/feedback', { cache: 'no-store' })
		]);
		if (usageResponse.status === 401 || feedbackResponse.status === 401) {
			authenticated = false;
			summary = undefined;
			loading = false;
			return;
		}
		authenticated = true;
		if (usageResponse.ok) {
			summary = (await usageResponse.json()) as Summary;
			rangeDays = nextRange;
		} else message = await responseMessage(usageResponse, 'Unable to load usage analytics.');
		if (feedbackResponse.ok)
			feedback = ((await feedbackResponse.json()) as { items: FeedbackItem[] }).items;
		else message = await responseMessage(feedbackResponse, 'Unable to load feedback.');
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
			message = await responseMessage(response, 'Unable to sign in.');
			signingIn = false;
			return;
		}
		authenticated = true;
		signingIn = false;
		await loadWorkspace();
	}

	async function signOut() {
		await fetch('/api/admin/session', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' }
		});
		authenticated = false;
		summary = undefined;
		feedback = [];
	}

	async function saveFeedback(item: FeedbackItem, nextStatus = item.status) {
		savingId = item.id;
		message = undefined;
		const response = await fetch('/api/admin/feedback', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: item.id, status: nextStatus, adminNote: item.adminNote })
		});
		if (response.ok) {
			item.status = nextStatus;
			item.updatedAt = new Date().toISOString();
			feedback = [...feedback];
		} else message = await responseMessage(response, 'Unable to save feedback.');
		savingId = undefined;
	}

	function exportFeedback() {
		const blob = new Blob([JSON.stringify(feedback, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `grademaxxing-feedback-${new Date().toISOString().slice(0, 10)}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
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
	function shortDate(value: string) {
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
	}
	function delta(current: number, previous: number) {
		if (previous === 0) return current > 0 ? '+100%' : '0%';
		const change = Math.round(((current - previous) / previous) * 100);
		return `${change >= 0 ? '+' : ''}${change}%`;
	}
	async function responseMessage(response: Response, fallback: string) {
		return (
			((await response.json().catch(() => ({ message: fallback }))) as { message?: string })
				.message ?? fallback
		);
	}
	onMount(loadWorkspace);
</script>

<svelte:head
	><title>Grademaxxing Admin</title><meta
		name="description"
		content="Private Grademaxxing operations and feedback dashboard."
	/></svelte:head
>

{#if authenticated}
	<div class="admin-stage">
		<header class="admin-header">
			<a class="admin-brand" href="/admin" aria-label="Grademaxxing admin home"
				><span><SparklesIcon size={18} /></span>
				<div><strong>Grademaxxing</strong><small>Admin</small></div></a
			>
			<nav aria-label="Admin sections">
				<button class:active={view === 'overview'} onclick={() => (view = 'overview')}
					>Overview</button
				>
				<button class:active={view === 'feedback'} onclick={() => (view = 'feedback')}
					>Feedback {#if openFeedback}<span>{openFeedback}</span>{/if}</button
				>
			</nav>
			<div class="header-actions">
				<button
					class="icon-button"
					aria-label="Refresh dashboard"
					onclick={() => loadWorkspace()}
					disabled={loading}
					><RefreshCwIcon class={loading ? 'spin' : undefined} size={17} /></button
				><button class="signout-button" onclick={signOut}><LogOutIcon size={16} />Sign out</button>
			</div>
		</header>

		<main class="admin-main">
			{#if message}<div class="dashboard-alert" role="alert">{message}</div>{/if}
			{#if view === 'overview'}
				<section class="page-heading">
					<div>
						<p>Operations</p>
						<h1>Product overview</h1>
						<span>Real usage signals, without student records.</span>
					</div>
					<div class="range-picker" aria-label="Analytics range">
						{#each ranges as option (option)}<button
								class:active={rangeDays === option}
								onclick={() => loadWorkspace(option)}
								disabled={loading}>{option} days</button
							>{/each}
					</div>
				</section>

				<section class="metrics-grid" aria-label="Key metrics">
					<article>
						<span class="metric-icon violet"><UsersIcon /></span>
						<div>
							<p>Total students</p>
							<strong>{summary?.uniqueStudents ?? '—'}</strong><small>successful logins</small>
						</div>
					</article>
					<article>
						<span class="metric-icon blue"><ActivityIcon /></span>
						<div>
							<p>Active students</p>
							<strong>{summary?.activeStudents ?? '—'}</strong><small
								>{summary ? delta(summary.activeStudents, summary.previousActiveStudents) : '—'} vs prior
								period</small
							>
						</div>
					</article>
					<article>
						<span class="metric-icon green"><TrendingUpIcon /></span>
						<div>
							<p>New students</p>
							<strong>{summary?.newStudents ?? '—'}</strong><small
								>{summary ? delta(summary.newStudents, summary.previousNewStudents) : '—'} vs prior period</small
							>
						</div>
					</article>
					<button class="metric-card-button" onclick={() => (view = 'feedback')}
						><span class="metric-icon amber"><InboxIcon /></span>
						<div>
							<p>Open feedback</p>
							<strong>{openFeedback}</strong><small>needs attention →</small>
						</div></button
					>
				</section>

				<div class="overview-grid">
					<section class="panel activity-panel">
						<div class="panel-heading">
							<div>
								<p>Engagement</p>
								<h2>Daily active students</h2>
							</div>
							<span>Last activity {dateTime(summary?.lastActivityAt ?? null)}</span>
						</div>
						<div class="usage-chart" aria-label="Daily active student chart">
							{#each summary?.dailyUsage ?? [] as day (day.date)}<div
									class="usage-column"
									title={`${shortDate(day.date)}: ${day.activeStudents} active`}
								>
									<i style={`height:${Math.max(3, (day.activeStudents / peakDaily) * 100)}%`}
									></i>{#if (summary?.dailyUsage.length ?? 0) <= 14}<small
											>{shortDate(day.date)}</small
										>{/if}
								</div>{/each}
						</div>
					</section>
					<section class="panel pulse-panel">
						<div class="panel-heading">
							<div>
								<p>Today</p>
								<h2>Live pulse</h2>
							</div>
							<ActivityIcon size={18} />
						</div>
						<strong>{summary?.activeToday ?? 0}</strong><span>active today</span>
						<div><ShieldCheckIcon size={16} />Anonymous, privacy-safe tracking</div>
					</section>
				</div>

				<section class="panel users-panel">
					<div class="panel-heading">
						<div>
							<p>Users</p>
							<h2>Protected user registry</h2>
							<span>One-way keys only — no names, grades, emails, or IPs.</span>
						</div>
						<label class="search-field"
							><SearchIcon size={16} /><span class="sr-only">Search protected user keys</span><input
								bind:value={userSearch}
								placeholder="Search protected key"
							/></label
						>
					</div>
					<div class="table-wrap">
						<table>
							<thead
								><tr
									><th>Protected key</th><th>First seen</th><th>Last seen</th><th>Active days</th
									><th>Window</th></tr
								></thead
							><tbody
								>{#each filteredUsers as user (user.studentKey)}<tr
										><td><code>{user.studentKey}</code></td><td>{dateTime(user.firstSeenAt)}</td><td
											>{dateTime(user.lastSeenAt)}</td
										><td>{user.activeDays}</td><td
											><span class:online={user.activeInRange} class="state-pill"
												>{user.activeInRange ? 'Active' : 'Inactive'}</span
											></td
										></tr
									>{:else}<tr
										><td colspan="5" class="empty-cell">No matching protected users.</td></tr
									>{/each}</tbody
							>
						</table>
					</div>
				</section>
			{:else}
				<section class="page-heading">
					<div>
						<p>Customer voice</p>
						<h1>Feedback inbox</h1>
						<span>Review and triage private in-app feedback.</span>
					</div>
					<button class="primary-button" onclick={exportFeedback} disabled={!feedback.length}
						><DownloadIcon size={16} />Export JSON</button
					>
				</section>
				<section class="feedback-toolbar panel">
					<div class="filter-tabs" aria-label="Filter feedback">
						{#each [{ value: 'all', label: 'All' }, ...statuses] as option (option.value)}<button
								class:active={feedbackFilter === option.value}
								onclick={() => (feedbackFilter = option.value as typeof feedbackFilter)}
								>{option.label}<span
									>{option.value === 'all'
										? feedback.length
										: feedback.filter((item) => item.status === option.value).length}</span
								></button
							>{/each}
					</div>
					<label class="search-field"
						><SearchIcon size={16} /><span class="sr-only">Search feedback</span><input
							bind:value={feedbackSearch}
							placeholder="Search feedback"
						/></label
					>
				</section>
				<section class="feedback-list" aria-label="Feedback messages">
					{#each filteredFeedback as item (item.id)}
						<article class="feedback-card panel">
							<div class="feedback-topline">
								<div class="feedback-kind">
									<MessageSquareIcon size={16} />
									<div>
										<strong>{item.kind}</strong><span
											>{dateTime(item.createdAt)} · {item.pagePath} · {item.appVersion}</span
										>
									</div>
								</div>
								<select
									aria-label={`Status for ${item.kind}`}
									value={item.status}
									onchange={(event) =>
										saveFeedback(item, event.currentTarget.value as FeedbackStatus)}
									disabled={savingId === item.id}
									>{#each statuses as status (status.value)}<option value={status.value}
											>{status.label}</option
										>{/each}</select
								>
							</div>
							<p class="feedback-message">{item.message}</p>
							<div class="note-row">
								<label
									><span>Private admin note</span><textarea
										bind:value={item.adminNote}
										maxlength="1000"
										placeholder="Add context, a plan, or a follow-up note"
									></textarea></label
								><button
									class="secondary-button"
									onclick={() => saveFeedback(item)}
									disabled={savingId === item.id}
									>{savingId === item.id ? 'Saving…' : 'Save note'}</button
								>
							</div>
						</article>
					{:else}<div class="feedback-empty panel">
							<CheckCircleIcon size={28} />
							<h2>Nothing here</h2>
							<p>No feedback matches this filter.</p>
						</div>{/each}
				</section>
			{/if}
		</main>
	</div>
{:else if !loading}
	<div class="login-stage">
		<section class="login-card">
			<div class="login-brand">
				<span><SparklesIcon size={20} /></span><strong>Grademaxxing Admin</strong>
			</div>
			<div class="login-icon"><LockKeyholeIcon size={22} /></div>
			<p>Private operations</p>
			<h1>Welcome back</h1>
			<span>Sign in to view usage and manage product feedback.</span>
			<form onsubmit={signIn}>
				<label for="admin-password">Password</label><input
					id="admin-password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
				/>{#if message}<p class="login-error" role="alert">{message}</p>{/if}<button
					type="submit"
					disabled={signingIn || !password}>{signingIn ? 'Signing in…' : 'Open dashboard'}</button
				>
			</form>
			<small><ShieldCheckIcon size={14} />Signed, expiring administrator session</small>
		</section>
	</div>
{:else}
	<div class="loading-stage">
		<div>
			<SparklesIcon size={24} />
			<p>Loading dashboard…</p>
		</div>
	</div>
{/if}

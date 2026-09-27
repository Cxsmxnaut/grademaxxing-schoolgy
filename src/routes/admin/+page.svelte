<script lang="ts">
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle-2';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import LinkIcon from '@lucide/svelte/icons/link';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import UsersIcon from '@lucide/svelte/icons/users';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
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
		adminReply: string;
		repliedAt: string | null;
		createdAt: string;
		updatedAt: string;
		messages: Array<{
			id: string;
			sender: 'student' | 'admin';
			message: string;
			createdAt: string;
		}>;
	};
	type ReferralPartner = {
		id: string;
		code: string;
		firstName: string;
		lastName: string;
		email: string;
		createdAt: string;
		active: boolean;
		referrals: number;
		lastReferralAt: string | null;
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
	let view = $state<'overview' | 'feedback' | 'referrals'>('overview');
	let referralPartners = $state<ReferralPartner[]>([]);
	let referralFirstName = $state('');
	let referralLastName = $state('');
	let referralEmail = $state('');
	let creatingReferrer = $state(false);
	let loadingReferrals = $state(false);
	let referralMessage = $state<string>();
	let copiedReferralCode = $state<string>();
	let feedbackFilter = $state<'all' | FeedbackStatus>('all');
	let feedbackSearch = $state('');
	let selectedFeedbackId = $state<string>();
	let userSearch = $state('');
	let savingId = $state<string>();
	let replyDrafts = $state<Record<string, string>>({});

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
					item.messages.some((entry) => entry.message.toLowerCase().includes(query)) ||
					item.kind.toLowerCase().includes(query) ||
					item.pagePath.toLowerCase().includes(query))
			);
		})
	);
	let selectedFeedback = $derived(
		filteredFeedback.find((item) => item.id === selectedFeedbackId) ?? filteredFeedback[0]
	);
	let filteredUsers = $derived(
		summary?.users.filter((user) =>
			user.studentKey.toLowerCase().includes(userSearch.trim().toLowerCase())
		) ?? []
	);
	let peakDaily = $derived(
		Math.max(...(summary?.dailyUsage.map((day) => day.activeStudents) ?? []), 1)
	);
	let totalReferrals = $derived(
		referralPartners.reduce((sum, partner) => sum + partner.referrals, 0)
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
		if (feedbackResponse.ok) {
			feedback = ((await feedbackResponse.json()) as { items: FeedbackItem[] }).items;
			replyDrafts = Object.fromEntries(
				feedback.map((item) => [item.id, replyDrafts[item.id] ?? ''])
			);
			if (!selectedFeedbackId && feedback[0]) selectedFeedbackId = feedback[0].id;
		} else message = await responseMessage(feedbackResponse, 'Unable to load feedback.');
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

	async function openReferrals() {
		view = 'referrals';
		referralMessage = undefined;
		loadingReferrals = true;
		try {
			const response = await fetch('/api/admin/referrals', { cache: 'no-store' });
			if (response.ok)
				referralPartners = ((await response.json()) as { partners: ReferralPartner[] }).partners;
			else referralMessage = await responseMessage(response, 'Unable to load referrals.');
		} catch {
			referralMessage = 'Unable to load referrals while offline.';
		} finally {
			loadingReferrals = false;
		}
	}

	async function createReferrer(event: SubmitEvent) {
		event.preventDefault();
		if (creatingReferrer) return;
		creatingReferrer = true;
		referralMessage = undefined;
		try {
			const response = await fetch('/api/admin/referrals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					firstName: referralFirstName,
					lastName: referralLastName,
					email: referralEmail
				})
			});
			const result = await response.json().catch(() => ({ message: 'Unable to create referrer.' }));
			if (!response.ok) {
				referralMessage = result.message;
				return;
			}
			referralFirstName = '';
			referralLastName = '';
			referralEmail = '';
			await openReferrals();
			referralMessage = `${result.partner.firstName}'s referral link is ready.`;
		} catch {
			referralMessage = 'Unable to create a referral link while offline.';
		} finally {
			creatingReferrer = false;
		}
	}

	function referralUrl(code: string) {
		const origin =
			window.location.hostname === 'admin.grademaxxing.app'
				? 'https://grademaxxing.app'
				: window.location.origin;
		return `${origin}/refer/${code}`;
	}
	async function copyReferralLink(code: string) {
		try {
			await navigator.clipboard.writeText(referralUrl(code));
			copiedReferralCode = code;
			window.setTimeout(() => {
				if (copiedReferralCode === code) copiedReferralCode = undefined;
			}, 1500);
		} catch {
			referralMessage = 'Copy failed. Open the link in a new tab and copy it from the address bar.';
		}
	}

	async function saveFeedback(item: FeedbackItem, nextStatus = item.status) {
		savingId = item.id;
		message = undefined;
		const response = await fetch('/api/admin/feedback', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				id: item.id,
				status: nextStatus,
				adminNote: item.adminNote,
				adminReply: item.adminReply
			})
		}).catch(() => undefined);
		if (response?.ok) {
			item.status = nextStatus;
			item.updatedAt = new Date().toISOString();
			feedback = [...feedback];
		} else {
			message = response
				? await responseMessage(response, 'Unable to save feedback.')
				: 'You appear to be offline. Reconnect and try again.';
			feedback = [...feedback];
		}
		savingId = undefined;
	}

	async function sendReply(item: FeedbackItem) {
		const reply = (replyDrafts[item.id] ?? '').trim();
		if (!reply || savingId) return;
		savingId = item.id;
		message = undefined;
		const response = await fetch(`/api/admin/feedback/${encodeURIComponent(item.id)}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: reply })
		}).catch(() => undefined);
		if (response?.ok) {
			const sent = (await response.json()) as FeedbackItem['messages'][number];
			item.messages = [...item.messages, sent];
			item.repliedAt = sent.createdAt;
			item.updatedAt = sent.createdAt;
			if ((replyDrafts[item.id] ?? '').trim() === reply) replyDrafts[item.id] = '';
			feedback = [...feedback];
		} else {
			message = response
				? await responseMessage(response, 'Unable to send reply.')
				: 'You appear to be offline. Reconnect and try again.';
		}
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
				<button class:active={view === 'referrals'} onclick={openReferrals}>Referrals</button>
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
			{:else if view === 'referrals'}
				<section class="page-heading referral-heading">
					<div>
						<p>Growth</p>
						<h1>Referral leaderboard</h1>
						<span>Create private links and track verified, first-time students.</span>
					</div>
					<div class="verified-rule"><ShieldCheckIcon size={16} /> New users only</div>
				</section>
				<section class="referral-metrics" aria-label="Referral metrics">
					<article>
						<span class="metric-icon violet"><UsersIcon /></span>
						<div><span>Referrers</span><strong>{referralPartners.length}</strong></div>
					</article>
					<article>
						<span class="metric-icon green"><UserPlusIcon /></span>
						<div><span>Verified referrals</span><strong>{totalReferrals}</strong></div>
					</article>
					<article>
						<span class="metric-icon blue"><LinkIcon /></span>
						<div>
							<span>Active links</span><strong
								>{referralPartners.filter((partner) => partner.active).length}</strong
							>
						</div>
					</article>
				</section>
				<div class="referral-grid">
					<section class="panel referral-create">
						<div class="referral-card-heading">
							<div class="referral-icon"><UserPlusIcon size={20} /></div>
							<div>
								<p>New partner</p>
								<h2>Generate a referral link</h2>
							</div>
						</div>
						<p class="referral-explainer">
							Add someone you trust. Their name and email stay private in this dashboard.
						</p>
						<form onsubmit={createReferrer}>
							<label
								>First name<input
									bind:value={referralFirstName}
									required
									maxlength="80"
									placeholder="Maya"
								/></label
							>
							<label
								>Last name<input
									bind:value={referralLastName}
									required
									maxlength="80"
									placeholder="Chen"
								/></label
							>
							<label class="full"
								>Email address<input
									bind:value={referralEmail}
									type="email"
									required
									maxlength="254"
									placeholder="maya@example.com"
								/></label
							>
							<button class="primary-button full" disabled={creatingReferrer}
								><LinkIcon size={16} />{creatingReferrer ? 'Creating…' : 'Generate link'}</button
							>
						</form>
						{#if referralMessage}<p class="referral-message" role="status">
								{referralMessage}
							</p>{/if}
					</section>
					<section class="panel referral-leaderboard">
						<div class="panel-heading">
							<div>
								<p><TrophyIcon size={14} /> Ranked by verified new students</p>
								<h2>Leaderboard</h2>
							</div>
						</div>
						<div class="referral-rule">
							<ShieldCheckIcon size={17} />
							<span
								>A referral counts after a successful StudentVUE login only when its protected
								student key is not already in D1.</span
							>
						</div>
						<div class="table-wrap" aria-busy={loadingReferrals}>
							<table>
								<thead><tr><th>Rank</th><th>Referrer</th><th>New users</th><th>Link</th></tr></thead
								><tbody>
									{#if loadingReferrals}<tr
											><td colspan="4" class="empty-cell">Loading referrals…</td></tr
										>
									{:else}{#each referralPartners as partner, index (partner.id)}<tr
												><td
													><span class:top-rank={index < 3} class="rank-badge">{index + 1}</span
													></td
												><td
													><strong>{partner.firstName} {partner.lastName}</strong><small
														>{partner.email}</small
													><code>{partner.code}</code></td
												><td><strong>{partner.referrals}</strong></td><td
													><button
														class="copy-referral"
														onclick={() => copyReferralLink(partner.code)}
														>{copiedReferralCode === partner.code ? 'Copied' : 'Copy link'}
														<CopyIcon size={13} /></button
													></td
												></tr
											>
										{:else}<tr
												><td colspan="4" class="empty-cell"
													>No referrers yet. Generate the first link to get started.</td
												></tr
											>{/each}{/if}
								</tbody>
							</table>
						</div>
					</section>
				</div>
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
				<section class="feedback-inbox panel" aria-label="Feedback messages">
					<aside class="conversation-list" aria-label="Conversations">
						<div class="conversation-list-heading">
							<strong>Conversations</strong><span>{filteredFeedback.length}</span>
						</div>
						{#each filteredFeedback as item (item.id)}
							<button
								class="conversation-preview"
								class:active={selectedFeedback?.id === item.id}
								onclick={() => (selectedFeedbackId = item.id)}
								aria-pressed={selectedFeedback?.id === item.id}
							>
								<span class="conversation-avatar"><MessageSquareIcon size={16} /></span>
								<span class="conversation-copy">
									<span><strong>{item.kind}</strong><time>{dateTime(item.updatedAt)}</time></span>
									<small>{item.messages.at(-1)?.message ?? (item.adminReply || item.message)}</small
									>
									<i class={`status-dot ${item.status}`}></i><em
										>{statuses.find((status) => status.value === item.status)?.label}</em
									>
								</span>
							</button>
						{:else}
							<div class="feedback-empty compact">
								<CheckCircleIcon size={24} /><strong>Nothing here</strong>
								<p>No feedback matches this filter.</p>
							</div>
						{/each}
					</aside>

					{#if selectedFeedback}
						{@const item = selectedFeedback}
						<article class="conversation-panel">
							<header class="conversation-header">
								<div class="conversation-identity">
									<span class="conversation-avatar large"><MessageSquareIcon size={18} /></span>
									<div>
										<strong>{item.kind}</strong><span
											>Anonymous sender · {item.pagePath} · {item.appVersion}</span
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
							</header>

							<div class="conversation-messages">
								{#each item.messages as entry (entry.id)}
									<div
										class:outgoing={entry.sender === 'admin'}
										class:incoming={entry.sender === 'student'}
										class="message-group"
									>
										{#if entry.sender === 'student'}<span class="conversation-avatar"
												><MessageSquareIcon size={15} /></span
											>{/if}
										<div>
											<p class="message-bubble">{entry.message}</p>
											<small
												>{entry.sender === 'admin' ? 'You' : 'Sender'} · {dateTime(
													entry.createdAt
												)}</small
											>
										</div>
									</div>
								{/each}
							</div>

							<div class="conversation-composer">
								<label class="sr-only" for={`reply-${item.id}`}>Reply to {item.kind}</label>
								<textarea
									id={`reply-${item.id}`}
									aria-label={`Reply to ${item.kind}`}
									value={replyDrafts[item.id] ?? ''}
									oninput={(event) => (replyDrafts[item.id] = event.currentTarget.value)}
									maxlength="2000"
									placeholder="Type a reply…"
								></textarea>
								<button
									class="primary-button send-button"
									aria-label="Send reply"
									onclick={() => sendReply(item)}
									disabled={savingId === item.id || !(replyDrafts[item.id] ?? '').trim()}
								>
									<ReplyIcon size={16} />{savingId === item.id ? 'Sending…' : 'Send'}
								</button>
								<span
									>{item.repliedAt
										? `Visible to sender · last sent ${dateTime(item.repliedAt)}`
										: 'This reply appears privately in the sender’s feedback screen.'}</span
								>
							</div>

							<div class="note-row">
								<label
									><span>Private admin note</span><textarea
										aria-label="Private admin note"
										bind:value={item.adminNote}
										maxlength="1000"
										placeholder="Add context only admins can see"
									></textarea></label
								>
								<button
									class="secondary-button"
									onclick={() => saveFeedback(item)}
									disabled={savingId === item.id}
									>{savingId === item.id ? 'Saving…' : 'Save private note'}</button
								>
							</div>
						</article>
					{:else}
						<div class="conversation-blank">
							<MessageSquareIcon size={28} />
							<h2>Select a conversation</h2>
							<p>Choose feedback from the inbox to read and reply.</p>
						</div>
					{/if}
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

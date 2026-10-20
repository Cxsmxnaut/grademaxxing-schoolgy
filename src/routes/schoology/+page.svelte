<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		calculateGrade,
		simulateGrade,
		type CourseGradebook,
		type GradebookAssignment
	} from '$lib/grades/schoology';
	import SchoologyCapabilityEmpty from '$lib/components/SchoologyCapabilityEmpty.svelte';
	import type {
		GradebookSnapshot,
		RawRecord
	} from '../../../packages/schoology-connector/dist/types.js';
	type SchoologyDashboardData = {
		view: string;
		demo: boolean;
		districtName: string;
		gradebook: GradebookSnapshot | null;
		capabilities: Record<string, boolean | null>;
		providerError?: string;
		events?: RawRecord[];
		calendarAvailable?: boolean;
		calendarError?: string;
		documents?: { id: string; title: string; course: string; published: boolean }[];
		documentsAvailable?: boolean;
		documentsError?: string;
		messages?: RawRecord[];
		selectedMessage?: RawRecord | null;
		mailAvailable?: boolean;
		mailError?: string;
	};

	let { data } = $props<{ data: SchoologyDashboardData }>();
	let courseId = $state('');
	let periodId = $state('');
	let mode = $state<'weighted' | 'points' | 'equal-categories'>('weighted');
	let scoreEdits = $state<Record<string, string>>({});
	let loggingOut = $state(false);

	const courses = $derived<CourseGradebook[]>(data.gradebook?.courses ?? []);
	const course = $derived(
		courses.find((item: CourseGradebook) => item.id === courseId) ?? courses[0]
	);
	const periods = $derived<CourseGradebook['periods']>(course?.periods ?? []);
	const period = $derived(periods.find((item) => item.id === periodId) ?? periods[0]);
	const currentMode = $derived(course?.weightedCategories === false ? 'points' : mode);
	const options = $derived({
		mode: currentMode,
		missing: 'exclude' as const,
		unknownRules: 'reject' as const
	});
	const simulation = $derived.by(() => {
		if (!period || !course) return null;
		const edits = Object.entries(scoreEdits).flatMap(([key, text]) => {
			if (text.trim() === '') return [];
			const assignment = period.assignments.find(
				(item: GradebookAssignment) => `${item.type}:${item.id}` === key
			);
			if (!assignment) return [];
			const score = Number(text);
			if (!Number.isFinite(score) || score < 0) return [];
			return [{ kind: 'change' as const, id: assignment.id, type: assignment.type, score }];
		});
		return simulateGrade(period, course.categories, options, edits);
	});
	const estimate = $derived.by(() => {
		if (!period || !course) return null;
		return calculateGrade(period.assignments, course.categories, options);
	});
	const navigation = [
		{ id: 'grades', label: 'Gradebook' },
		{ id: 'calendar', label: 'Calendar' },
		{ id: 'documents', label: 'Documents' },
		{ id: 'mail', label: 'Mail' },
		{ id: 'profile', label: 'Profile' },
		{ id: 'attendance', label: 'Attendance' }
	];
	const activeView = $derived(data.view);

	function gradeLabel(value: string | number | null | undefined) {
		if (value === null || value === undefined || value === '') return 'Not published';
		if (typeof value === 'number') return `${Number(value.toFixed(2))}%`;
		return value;
	}

	function formatDate(value: unknown) {
		if ((typeof value !== 'string' && typeof value !== 'number') || !value)
			return 'Date not provided';
		const date = new Date(typeof value === 'number' ? value * 1000 : value.replace(' ', 'T'));
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
					date
				);
	}

	function changeCourse(event: Event) {
		courseId = (event.currentTarget as HTMLSelectElement).value;
		periodId = '';
		scoreEdits = {};
	}

	function changePeriod(event: Event) {
		periodId = (event.currentTarget as HTMLSelectElement).value;
		scoreEdits = {};
	}

	function editScore(assignmentKey: string, event: Event) {
		scoreEdits = {
			...scoreEdits,
			[assignmentKey]: (event.currentTarget as HTMLInputElement).value
		};
	}

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;
		await fetch('/api/schoology/session', { method: 'DELETE' }).catch(() => undefined);
		await goto('/schoology/login');
	}

	function displayName(courseItem: CourseGradebook) {
		return courseItem.title || courseItem.sectionTitle || 'Untitled course';
	}
</script>

<svelte:head>
	<title
		>{activeView === 'grades'
			? 'Gradebook'
			: navigation.find((item) => item.id === activeView)?.label} · Schoology · Grademaxxing</title
	>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="bg-background text-foreground min-h-svh">
	<aside
		class="border-border/70 bg-sidebar md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col md:border-r"
	>
		<div class="flex items-center gap-3 px-5 py-5">
			<img src="/grademaxxing-growth-mark.png" alt="" class="size-9" />
			<div>
				<div class="font-heading text-lg font-semibold">Grademaxxing</div>
				<div class="text-primary font-mono text-[10px] tracking-[.16em] uppercase">
					Schoology edition
				</div>
			</div>
		</div>
		<div class="bg-muted/70 mx-4 mb-4 rounded-lg px-3 py-2">
			<p class="truncate text-sm font-medium">
				{data.gradebook?.user.displayName ?? 'Schoology account'}
			</p>
			<p class="text-muted-foreground truncate text-xs">{data.districtName}</p>
		</div>
		<nav
			aria-label="Schoology navigation"
			class="grid grid-cols-3 gap-1 px-3 pb-3 md:flex md:flex-col"
		>
			{#each navigation as item (item.id)}
				<a
					href={item.id === 'grades' ? '/schoology' : `/schoology?view=${item.id}`}
					aria-current={activeView === item.id ? 'page' : undefined}
					class="hover:bg-muted aria-[current=page]:bg-primary/15 aria-[current=page]:text-primary rounded-md px-3 py-2 text-sm transition aria-[current=page]:font-semibold"
					>{item.label}</a
				>
			{/each}
		</nav>
		<div class="px-4 pb-4 md:hidden">
			<button
				class="border-border hover:bg-muted w-full rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50"
				onclick={logout}
				disabled={loggingOut}>{loggingOut ? 'Signing out…' : 'Log out'}</button
			>
		</div>
		<div class="mt-auto hidden p-4 md:block">
			<p class="text-muted-foreground mb-3 text-xs">Read-only Schoology API connection</p>
			<button
				class="border-border hover:bg-muted w-full rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50"
				onclick={logout}
				disabled={loggingOut}>{loggingOut ? 'Signing out…' : 'Log out'}</button
			>
		</div>
	</aside>

	<main class="min-w-0 px-4 py-5 sm:px-6 md:ml-64 md:px-9 md:py-8">
		<div class="mx-auto max-w-6xl">
			{#if data.demo}
				<div
					role="status"
					class="border-primary/30 bg-primary/10 mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
				>
					<span
						><strong>Fictional-data demo.</strong> Every student, course, score, event, document, and
						message shown here is invented.</span
					>
					<a href="/schoology/login" class="underline underline-offset-4">Connect a district</a>
				</div>
			{/if}
			{#if data.providerError}
				<section role="alert" class="border-destructive/40 bg-destructive/10 rounded-xl border p-6">
					<h1 class="font-heading text-2xl font-semibold">Schoology connection needs attention</h1>
					<p class="text-muted-foreground mt-2">{data.providerError}</p>
					<a
						class="bg-primary text-primary-foreground mt-4 inline-flex rounded-md px-4 py-2 text-sm font-semibold"
						href="/schoology/login">Reconnect</a
					>
				</section>
			{:else if activeView === 'grades'}
				<header class="mb-7 flex flex-wrap items-end justify-between gap-4">
					<div>
						<p class="text-primary font-mono text-xs tracking-[.16em] uppercase">Overview</p>
						<h1 class="font-heading mt-2 text-3xl font-semibold tracking-tight">Gradebook</h1>
						<p class="text-muted-foreground mt-2 text-sm">
							Official grades stay distinct from local estimates and what-if changes.
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<label class="sr-only" for="course-select">Course</label>
						<select
							id="course-select"
							class="border-input bg-background h-10 max-w-56 rounded-md border px-3 text-sm"
							value={course?.id ?? ''}
							onchange={changeCourse}
						>
							{#each courses as item (item.id)}<option value={item.id}>{displayName(item)}</option
								>{/each}
						</select>
						{#if periods.length > 1}
							<label class="sr-only" for="period-select">Grading period</label>
							<select
								id="period-select"
								class="border-input bg-background h-10 rounded-md border px-3 text-sm"
								value={period?.id ?? ''}
								onchange={changePeriod}
							>
								{#each periods as item (item.id)}<option value={item.id}>{item.title}</option
									>{/each}
							</select>
						{/if}
					</div>
				</header>

				{#if courses.length === 0}
					<div class="border-border bg-card rounded-xl border p-8">
						<h2 class="font-heading text-xl font-semibold">No enrolled courses were returned</h2>
						<p class="text-muted-foreground mt-2">
							Schoology returned an empty course list for this account.
						</p>
					</div>
				{:else if course && period}
					<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						<section
							class="border-border bg-card rounded-xl border p-5 sm:col-span-2 xl:col-span-1"
						>
							<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Official Schoology grade
							</p>
							<p class="font-heading mt-3 text-4xl font-semibold">
								{gradeLabel(period.officialGrade)}
							</p>
							<p class="text-muted-foreground mt-2 truncate text-sm">
								{displayName(course)} · {period.title}
							</p>
							<p class="text-muted-foreground mt-4 text-xs leading-5">
								This value comes from Schoology. Grademaxxing does not replace it with a
								calculation.
							</p>
						</section>
						<section class="border-border bg-card rounded-xl border p-5">
							<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Calculated estimate
							</p>
							<p class="font-heading mt-3 text-4xl font-semibold">
								{estimate?.percentage === null || estimate?.percentage === undefined
									? '—'
									: `${estimate.percentage.toFixed(1)}%`}
							</p>
							<p class="text-muted-foreground mt-2 text-sm">
								Based on the visible grades and selected rule.
							</p>
						</section>
						<section class="border-border bg-card rounded-xl border p-5">
							<p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Estimated score trend
							</p>
							<div
								class="mt-4 flex h-12 items-end gap-1"
								aria-label="Assignment score percentages in due-date order; this is not a historical course-grade trend"
							>
								{#each [...period.assignments]
									.filter((item) => item.score !== null && item.maxPoints && item.maxPoints > 0)
									.slice(-10) as item (item.type + item.id)}
									<div
										class="bg-chart-2/80 min-w-1 flex-1 rounded-t"
										style={`height:${Math.max(8, Math.min(100, ((item.score ?? 0) / (item.maxPoints ?? 1)) * 100))}%`}
										title={`${item.title ?? 'Assignment'}: ${Math.round(((item.score ?? 0) / (item.maxPoints ?? 1)) * 100)}%`}
									></div>
								{/each}
							</div>
							<p class="text-muted-foreground mt-3 text-xs">
								Visible assignment scores · not a historical overall-grade trend
							</p>
						</section>
					</div>

					<section class="border-border bg-card mt-5 rounded-xl border p-5">
						<div class="flex flex-wrap items-start justify-between gap-4">
							<div>
								<h2 class="font-heading text-xl font-semibold">What-if planner</h2>
								<p class="text-muted-foreground mt-1 text-sm">
									Change a score below to explore an estimate. The Schoology record is unchanged.
								</p>
							</div>
							{#if course.weightedCategories !== false}
								<label class="flex items-center gap-2 text-sm"
									><span>Calculation</span><select
										bind:value={mode}
										class="border-input bg-background h-9 rounded-md border px-2"
										><option value="weighted">Weighted categories</option><option value="points"
											>Total points</option
										><option value="equal-categories">Equal categories</option></select
									></label
								>
							{/if}
						</div>
						{#if course.weightedCategories === null}<p
								class="bg-warning/10 text-muted-foreground mt-4 rounded-md p-3 text-sm"
							>
								Schoology did not expose whether this course uses weighted categories. Choose the
								calculation mode explicitly.
							</p>{/if}
						{#if estimate?.warnings.length}
							<ul class="text-muted-foreground mt-4 space-y-1 text-xs">
								{#each estimate.warnings as warning (warning)}<li>• {warning}</li>{/each}
							</ul>
						{/if}
						<div class="mt-5 overflow-x-auto">
							<table class="w-full min-w-[600px] text-left text-sm">
								<thead class="border-border text-muted-foreground border-b text-xs"
									><tr
										><th class="pb-3 font-medium">Assignment</th><th class="pb-3 font-medium"
											>Category</th
										><th class="pb-3 font-medium">Official score</th><th class="pb-3 font-medium"
											>Possible</th
										><th class="pb-3 font-medium">What-if score</th></tr
									></thead
								>
								<tbody>
									{#each period.assignments as assignment (assignment.type + assignment.id)}
										<tr class="border-border/70 border-b last:border-0">
											<td class="py-3 pr-4"
												><div class="font-medium">{assignment.title ?? 'Untitled assignment'}</div>
												<div class="text-muted-foreground text-xs">{assignment.status}</div></td
											>
											<td class="text-muted-foreground py-3 pr-4"
												>{course.categories.find((item) => item.id === assignment.categoryId)
													?.title ?? 'Uncategorized'}</td
											>
											<td class="py-3 pr-4">{assignment.score ?? '—'}</td><td class="py-3 pr-4"
												>{assignment.maxPoints ?? '—'}</td
											>
											<td class="py-3"
												><input
													aria-label={`What-if score for ${assignment.title ?? 'assignment'}`}
													class="border-input bg-background h-9 w-24 rounded-md border px-2"
													type="number"
													min="0"
													max={assignment.maxPoints ?? undefined}
													step="any"
													value={scoreEdits[`${assignment.type}:${assignment.id}`] ?? ''}
													oninput={(event) =>
														editScore(`${assignment.type}:${assignment.id}`, event)}
													placeholder="—"
												/></td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<div
							class="border-border mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
						>
							<p class="text-muted-foreground text-sm">
								Projected local estimate <strong class="text-foreground ml-1"
									>{simulation?.projected.percentage === null ||
									simulation?.projected.percentage === undefined
										? 'Unavailable'
										: `${simulation.projected.percentage.toFixed(1)}%`}</strong
								>
							</p>
							<button
								class="border-border hover:bg-muted rounded-md border px-3 py-2 text-sm"
								onclick={() => (scoreEdits = {})}>Reset what-if changes</button
							>
						</div>
					</section>

					<div class="mt-5 grid gap-4 sm:grid-cols-2">
						<section class="border-border bg-card rounded-xl border p-5">
							<h2 class="font-heading text-lg font-semibold">GPA planner</h2>
							<p class="text-muted-foreground mt-2 text-sm leading-6">
								The Schoology API snapshot does not include transcript credits or a district GPA
								scale, so this edition does not infer a GPA. Official course grades remain available
								above.
							</p>
						</section>
						<section class="border-border bg-card rounded-xl border p-5">
							<h2 class="font-heading text-lg font-semibold">Grade trend</h2>
							<p class="text-muted-foreground mt-2 text-sm leading-6">
								Schoology does not provide historical gradebook snapshots through this integration.
								The bars above show current assignment scores only; they are not a reconstructed
								grade history.
							</p>
						</section>
					</div>
				{/if}
			{:else if activeView === 'calendar'}
				<header class="mb-6">
					<p class="text-primary font-mono text-xs tracking-[.16em] uppercase">School</p>
					<h1 class="font-heading mt-2 text-3xl font-semibold">Calendar</h1>
					<p class="text-muted-foreground mt-2 text-sm">
						Read-only events returned for this Schoology account.
					</p>
				</header>
				{#if data.calendarAvailable === false}<SchoologyCapabilityEmpty
						title="Calendar unavailable"
						message={data.calendarError ??
							'The district did not allow this account to read calendar events.'}
					/>
				{:else if (data.events ?? []).length === 0}<SchoologyCapabilityEmpty
						title="No calendar events returned"
						message="Schoology returned an empty event list for this account."
					/>
				{:else}<div class="space-y-3">
						{#each data.events as item (String(item.id ?? item.title))}<article
								class="border-border bg-card rounded-xl border p-5"
							>
								<p class="font-medium">{String(item.title ?? 'Untitled event')}</p>
								<p class="text-muted-foreground mt-2 text-sm">
									{formatDate(item.start ?? item.date)}
								</p>
							</article>{/each}
					</div>{/if}
			{:else if activeView === 'documents'}
				<header class="mb-6">
					<p class="text-primary font-mono text-xs tracking-[.16em] uppercase">School</p>
					<h1 class="font-heading mt-2 text-3xl font-semibold">Documents</h1>
					<p class="text-muted-foreground mt-2 text-sm">
						Course document metadata visible to this Schoology account.
					</p>
				</header>
				{#if data.documentsAvailable === false}<SchoologyCapabilityEmpty
						title="Documents unavailable"
						message={data.documentsError ??
							'The district did not allow this account to read course documents.'}
					/>
				{:else if (data.documents ?? []).length === 0}<SchoologyCapabilityEmpty
						title="No course documents returned"
						message="Schoology returned no visible documents in enrolled courses."
					/>
				{:else}<div class="space-y-3">
						{#each data.documents as item (item.id)}<article
								class="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5"
							>
								<div>
									<p class="font-medium">{item.title}</p>
									<p class="text-muted-foreground mt-1 text-sm">{item.course}</p>
								</div>
								<span class="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs"
									>Metadata only</span
								>
							</article>{/each}
					</div>
					<p class="text-muted-foreground mt-4 text-xs">
						File downloads are not enabled in this integration.
					</p>{/if}
			{:else if activeView === 'mail'}
				<header class="mb-6">
					<p class="text-primary font-mono text-xs tracking-[.16em] uppercase">School</p>
					<h1 class="font-heading mt-2 text-3xl font-semibold">Mail</h1>
					<p class="text-muted-foreground mt-2 text-sm">Read-only Schoology inbox.</p>
				</header>
				{#if data.mailAvailable === false}<SchoologyCapabilityEmpty
						title="Inbox unavailable"
						message={data.mailError ?? 'The district did not allow this account to read messages.'}
					/>
				{:else if (data.messages ?? []).length === 0}<SchoologyCapabilityEmpty
						title="Your inbox is empty"
						message="Schoology returned no messages in this account's inbox."
					/>
				{:else if data.selectedMessage}
					<article class="border-border bg-card rounded-xl border p-5 sm:p-7">
						<a href="/schoology?view=mail" class="text-primary text-sm underline underline-offset-4"
							>← Back to inbox</a
						>
						<h2 class="font-heading mt-5 text-2xl font-semibold">
							{String(data.selectedMessage.subject ?? 'No subject')}
						</h2>
						<p class="text-muted-foreground mt-2 text-xs">
							{formatDate(data.selectedMessage.last_updated)}
						</p>
						<div class="border-border mt-6 border-t pt-5 text-sm leading-7 whitespace-pre-wrap">
							{String(
								data.selectedMessage.message ??
									data.selectedMessage.body ??
									'No message body was returned.'
							)}
						</div>
						<p class="text-muted-foreground mt-5 text-xs">
							Opened with Schoology's keep-unread option; message status was not changed.
						</p>
					</article>
				{:else}<div class="space-y-3">
						{#each data.messages as item (String(item.id ?? item.subject))}<article
								class="border-border bg-card rounded-xl border p-5"
							>
								<div class="flex flex-wrap justify-between gap-2">
									<a
										class="text-primary font-medium underline-offset-4 hover:underline"
										href={`/schoology?view=mail&message=${encodeURIComponent(String(item.id ?? ''))}`}
										>{String(item.subject ?? 'No subject')}</a
									><span class="text-muted-foreground text-xs">{formatDate(item.last_updated)}</span
									>
								</div>
								<p class="text-muted-foreground mt-2 text-xs">Schoology message</p>
								<p class="text-muted-foreground mt-3 text-sm">
									{String(item.message ?? 'Open message to read its body.').slice(0, 220)}
								</p>
							</article>{/each}
					</div>{/if}
			{:else if activeView === 'profile'}
				<header class="mb-6">
					<p class="text-primary font-mono text-xs tracking-[.16em] uppercase">Account</p>
					<h1 class="font-heading mt-2 text-3xl font-semibold">Profile</h1>
					<p class="text-muted-foreground mt-2 text-sm">
						Schoology identity fields returned by the account API.
					</p>
				</header>
				<section class="border-border bg-card rounded-xl border p-6">
					<p class="text-muted-foreground text-xs">Display name</p>
					<p class="mt-1 text-xl font-semibold">
						{data.gradebook?.user.displayName ?? 'Unavailable'}
					</p>
					<p class="text-muted-foreground mt-5 text-xs">Schoology user ID</p>
					<p class="mt-1 font-mono text-sm">{data.gradebook?.user.id ?? 'Unavailable'}</p>
					<p class="text-muted-foreground mt-5 text-sm">
						Schoology profile photos and additional student information are not requested by this
						edition.
					</p>
				</section>
			{:else}
				<header class="mb-6">
					<p class="text-primary font-mono text-xs tracking-[.16em] uppercase">School</p>
					<h1 class="font-heading mt-2 text-3xl font-semibold">Attendance</h1>
				</header>
				<SchoologyCapabilityEmpty
					title="Attendance is unavailable in this edition"
					message="Schoology's documented attendance endpoint is scoped to a course and can return statuses for multiple enrollments. This edition does not request those broader records."
				/>
			{/if}

			<footer class="border-border text-muted-foreground mt-10 border-t pt-4 text-xs">
				Schoology data availability depends on district app approval, account role, and permissions.
				Official Schoology values remain the source of truth.
			</footer>
		</div>
	</main>
</div>

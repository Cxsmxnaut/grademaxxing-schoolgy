<script lang="ts">
	import { getRelativeTime, removeCourseType, shortDateFormatter } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		gradebookState,
		initializeGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import { getCourseGrade, getCourseUnseenAssignmentsCount } from '$lib/grades/course';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import type { AssignmentEntity, Course } from '$lib/types/Gradebook';
	import AlertTriangleIcon from '@lucide/svelte/icons/triangle-alert';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BookOpenCheckIcon from '@lucide/svelte/icons/book-open-check';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import ClockIcon from '@lucide/svelte/icons/clock-3';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import { onMount } from 'svelte';
	import { attendanceState, loadAttendance } from '../attendance/attendance.svelte';
	import { documentsState, loadDocuments } from '../documents/documents.svelte';
	import { loadMailData, mailDataState } from '../mail/mailData.svelte';
	import { loadStudentInfo, studentInfoState } from '../studentinfo/studentInfo.svelte';

	type CalendarEvent = Awaited<
		ReturnType<NonNullable<typeof acc.studentAccount>['calendar']>
	>['events'][number];
	type AssignmentActivity = {
		assignment: AssignmentEntity;
		course: Course;
		date: Date;
		isNew: boolean;
		isMissing: boolean;
	};

	let calendarEvents: CalendarEvent[] = $state([]);
	let calendarError = $state<string>();
	let calendarLoading = $state(false);
	let refreshing = $state(false);
	const todayLabel = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	}).format(new Date());

	const gradebook = $derived.by(() => {
		gradebookState.version;
		return getActiveGradebook();
	});
	const courses = $derived(gradebook?.Courses.Course ?? []);
	const gradedCourses = $derived(
		courses.flatMap((course) => {
			const grade = getCourseGrade(course);
			return grade ? [{ course, grade }] : [];
		})
	);
	const estimatedGpa = $derived.by(() => {
		const usable = gradedCourses
			.map(({ grade }) => letterGradePoints(grade.letter))
			.filter((point): point is number => point !== undefined);
		return usable.length
			? usable.reduce((sum, point) => sum + point, 0) / usable.length
			: undefined;
	});
	const courseAverage = $derived(
		gradedCourses.length
			? gradedCourses.reduce((sum, { grade }) => sum + grade.percentage, 0) / gradedCourses.length
			: undefined
	);
	const attentionCourses = $derived(
		gradedCourses
			.filter(({ grade }) => grade.percentage < 80)
			.toSorted((a, b) => a.grade.percentage - b.grade.percentage)
	);
	const newAssignmentCount = $derived(
		courses.reduce((total, course) => total + getCourseUnseenAssignmentsCount(course), 0)
	);
	const allAssignments = $derived.by(() =>
		courses
			.flatMap((course) =>
				(course.Marks?.Mark[0]?.Assignments?.Assignment ?? []).flatMap((assignment) => {
					const date = assignmentDate(assignment);
					if (!date) return [];
					return [
						{
							assignment,
							course,
							date,
							isNew: !seenAssignmentIDs.has(assignment._GradebookID),
							isMissing: isMissingAssignment(assignment)
						} satisfies AssignmentActivity
					];
				})
			)
			.toSorted((a, b) => b.date.getTime() - a.date.getTime())
	);
	const recentAssignments = $derived(
		allAssignments.filter(({ assignment }) => isGradedAssignment(assignment)).slice(0, 6)
	);
	const missingAssignments = $derived(allAssignments.filter((activity) => activity.isMissing));
	const lowScoreAssignments = $derived(
		allAssignments.filter((activity) => {
			const percent = assignmentPercent(activity.assignment);
			return !activity.isMissing && percent !== undefined && percent < 70;
		})
	);
	const upcomingEvents = $derived(
		calendarEvents
			.flatMap((event) => {
				const date = parseDate(event.date);
				return date && date.getTime() >= startOfToday() ? [{ event, date }] : [];
			})
			.toSorted((a, b) => a.date.getTime() - b.date.getTime())
			.slice(0, 5)
	);
	const attendanceEvents = $derived(
		attendanceState.data?.Absences.Absence?.flatMap((absence) => absence.Periods.Period ?? [])
			.length ?? 0
	);
	const unreadMessages = $derived(
		mailDataState.data?.InboxItemListings.MessageXML.filter(
			(message) => message._MailRead.toLowerCase() !== 'true'
		) ?? []
	);
	const documents = $derived(documentsState.data?.StudentDocumentDatas?.StudentDocumentData ?? []);
	const latestDocument = $derived(
		documents.toSorted((a, b) => dateValue(b._DocumentDate) - dateValue(a._DocumentDate))[0]
	);
	const firstName = $derived(
		studentInfoState.data?.FormattedName?.trim().split(/\s+/)[0] ?? 'there'
	);
	const attentionCount = $derived(
		missingAssignments.length +
			lowScoreAssignments.length +
			attentionCourses.length +
			attendanceEvents
	);
	const lastRefresh = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const index = catalog.overrideIndex ?? catalog.defaultIndex;
		return catalog.recordCache[index]?.lastRefresh;
	});

	onMount(() => {
		void initializeDashboard();
	});

	async function initializeDashboard() {
		if (!acc.studentAccount) return;
		await initializeGradebookCatalog();
		if (!getActiveGradebook()) return;
		await Promise.allSettled([
			loadStudentInfo(),
			loadAttendance(),
			loadMailData(),
			loadDocuments(),
			loadCalendar()
		]);
	}

	async function loadCalendar() {
		if (!acc.studentAccount || calendarLoading) return;
		calendarLoading = true;
		calendarError = undefined;
		const now = new Date();
		try {
			const result = await Promise.race([
				acc.studentAccount.calendar(now.getMonth() + 1, now.getFullYear()),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Calendar took too long to respond.')), 10_000)
				)
			]);
			calendarEvents = result.events;
		} catch (error) {
			calendarError = error instanceof Error ? error.message : 'Calendar could not be loaded.';
		} finally {
			calendarLoading = false;
		}
	}

	async function refreshDashboard() {
		if (refreshing) return;
		refreshing = true;
		await Promise.allSettled([
			gradebookState.gradebookCatalog
				? switchReportPeriod({
						overrideIndex: gradebookState.gradebookCatalog.overrideIndex,
						forceRefresh: true
					})
				: initializeGradebookCatalog()
		]);
		if (getActiveGradebook())
			await Promise.allSettled([
				loadAttendance(true),
				loadMailData(true),
				loadDocuments(true),
				loadStudentInfo(true),
				loadCalendar()
			]);
		refreshing = false;
	}

	function letterGradePoints(letter: string) {
		const normalized = letter.trim().toUpperCase();
		const base = ({ A: 4, B: 3, C: 2, D: 1, F: 0 } as Record<string, number>)[normalized[0] ?? ''];
		if (base === undefined || normalized[0] === 'F') return base;
		if (normalized.includes('+')) return Math.min(4, base + 0.3);
		if (normalized.includes('-')) return Math.max(0, base - 0.3);
		return base;
	}

	function assignmentDate(assignment: AssignmentEntity) {
		return parseDate(assignment._Date || assignment._DueDate);
	}
	function parseDate(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date;
	}
	function dateValue(value: string) {
		return parseDate(value)?.getTime() ?? 0;
	}
	function startOfToday() {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return today.getTime();
	}
	function isMissingAssignment(assignment: AssignmentEntity) {
		return /missing|not turned in|not submitted/i.test(
			`${assignment._DisplayScore} ${assignment._Notes}`
		);
	}
	function isGradedAssignment(assignment: AssignmentEntity) {
		return Boolean(
			assignment._DisplayScore &&
			!/not graded|not due|not for grading|points possible|n\/a/i.test(assignment._DisplayScore)
		);
	}
	function latestAssignment(course: Course) {
		return allAssignments.find(
			(activity) =>
				activity.course._CourseID === course._CourseID && isGradedAssignment(activity.assignment)
		);
	}
	function assignmentPercent(assignment: AssignmentEntity) {
		const earned = Number.parseFloat(assignment._ScoreCalValue ?? assignment._Point ?? '');
		const possible = Number.parseFloat(
			assignment._ScoreMaxValue ?? assignment._PointPossible ?? ''
		);
		return Number.isFinite(earned) && Number.isFinite(possible) && possible > 0
			? (earned / possible) * 100
			: undefined;
	}
	function gradeTone(percentage: number) {
		return percentage >= 90
			? 'text-success'
			: percentage >= 80
				? 'text-warning'
				: 'text-destructive';
	}
	function gradeDot(percentage: number) {
		return percentage >= 90 ? 'bg-success' : percentage >= 80 ? 'bg-warning' : 'bg-destructive';
	}
	function documentName() {
		return (
			latestDocument?._DocumentComment?.trim() ||
			latestDocument?._DocumentFileName ||
			latestDocument?._DocumentType ||
			'Newest document'
		);
	}
</script>

<svelte:head><title>Dashboard - {brand}</title></svelte:head>

<main class="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
	<header
		class="border-border/70 mb-6 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<p class="text-primary mb-1 text-xs font-bold tracking-[0.15em] uppercase">{todayLabel}</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
				Hey {firstName}, here’s the move.
			</h1>
			<p class="text-muted-foreground mt-1.5">See what changed and what needs your attention.</p>
		</div>
		<div class="flex items-center gap-3">
			{#if lastRefresh}<span class="text-muted-foreground hidden text-xs sm:inline"
					>Updated {getRelativeTime(new Date(lastRefresh))}</span
				>{/if}
			<Button variant="outline" onclick={() => void refreshDashboard()} disabled={refreshing}>
				<RefreshCwIcon class={refreshing ? 'animate-spin' : undefined} />
				{refreshing ? 'Refreshing' : 'Refresh'}
			</Button>
		</div>
	</header>

	{#if !gradebook && !gradebookState.loadingError}
		<div class="flex min-h-64 items-center justify-center gap-3" role="status">
			<Spinner class="size-6" /> Building your dashboard…
		</div>
	{:else}
		{#if gradebookState.loadingError && !gradebook}
			<div
				class="border-destructive/20 bg-destructive/8 my-5 flex items-center justify-between gap-4 rounded-xl border p-5"
			>
				<div>
					<p class="font-semibold">Grades could not be loaded</p>
					<p class="text-muted-foreground text-sm">
						Check your StudentVUE connection and try again.
					</p>
				</div>
				<Button variant="outline" onclick={() => void refreshDashboard()}>Try again</Button>
			</div>
		{/if}

		<section
			aria-label="Overview"
			data-testid="dashboard-overview"
			class="border-border bg-card grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-4"
		>
			<div class="px-5 py-5 sm:px-6">
				<p class="text-muted-foreground text-xs font-bold tracking-[0.13em] uppercase">
					GPA · unweighted
				</p>
				<div class="mt-2 flex items-baseline gap-2">
					<strong class="text-success font-mono text-4xl">{estimatedGpa?.toFixed(2) ?? '—'}</strong
					><span class="text-muted-foreground text-xs">estimated</span>
				</div>
			</div>
			<div class="border-border px-5 py-5 sm:border-l sm:px-6">
				<p class="text-muted-foreground text-xs font-bold tracking-[0.13em] uppercase">
					Course average
				</p>
				<strong class="mt-2 block font-mono text-4xl"
					>{courseAverage === undefined ? '—' : `${courseAverage.toFixed(1)}%`}</strong
				>
			</div>
			<div class="border-border px-5 py-5 sm:border-t sm:px-6 xl:border-t-0 xl:border-l">
				<p class="text-muted-foreground text-xs font-bold tracking-[0.13em] uppercase">
					Needs attention
				</p>
				<strong
					class="mt-2 block font-mono text-4xl {attentionCount
						? 'text-destructive'
						: 'text-success'}">{attentionCount}</strong
				>
			</div>
			<div class="border-border px-5 py-5 sm:border-t sm:border-l sm:px-6 xl:border-t-0">
				<p class="text-muted-foreground text-xs font-bold tracking-[0.13em] uppercase">
					New assignments
				</p>
				<strong class="mt-2 block font-mono text-4xl">{newAssignmentCount}</strong>
			</div>
		</section>

		<div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
			<div class="min-w-0 space-y-5">
				<section
					aria-labelledby="attention-heading"
					class="border-border/80 bg-card overflow-hidden rounded-2xl border px-5 py-5 sm:px-6"
				>
					<div class="mb-4 flex items-end justify-between gap-3">
						<div>
							<h2 id="attention-heading" class="text-xl font-bold">Needs attention</h2>
							<p class="text-muted-foreground text-sm">The most useful things to check first</p>
						</div>
						{#if attentionCount > 0}<span
								class="bg-destructive/10 text-destructive rounded-full px-2.5 py-1 text-xs font-bold"
								>{attentionCount} total</span
							>{/if}
					</div>
					{#if attentionCount === 0}
						<div class="bg-success/8 text-success flex items-center gap-3 rounded-xl px-4 py-4">
							<CheckCircleIcon class="size-6" />
							<div>
								<p class="font-semibold">Nothing urgent right now</p>
								<p class="text-foreground/60 text-sm">
									No missing work, low scores, low classes, or attendance incidents found.
								</p>
							</div>
						</div>
					{:else}
						<div>
							{#each missingAssignments.slice(0, 3) as activity (activity.assignment._GradebookID)}
								<a
									href="/grades/{encodeURIComponent(activity.course._CourseID)}"
									class="border-border/70 hover:bg-accent/50 flex items-center gap-3 border-b p-3.5 transition-colors last:border-b-0"
									><span
										class="bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-lg"
										><AlertTriangleIcon class="size-4" /></span
									>
									<div class="min-w-0 flex-1">
										<p class="truncate font-semibold">{activity.assignment._Measure}</p>
										<p class="text-muted-foreground truncate text-sm">
											Missing · {removeCourseType(activity.course._CourseName)}
										</p>
									</div>
									<ArrowRightIcon class="text-muted-foreground size-4" /></a
								>
							{/each}
							{#each lowScoreAssignments.slice(0, 3) as activity (activity.assignment._GradebookID)}
								<a
									href="/grades/{encodeURIComponent(activity.course._CourseID)}"
									class="border-border/70 hover:bg-accent/50 flex items-center gap-3 border-b p-3.5 transition-colors last:border-b-0"
									><span
										class="bg-warning/10 text-warning flex size-9 items-center justify-center rounded-lg"
										><TrendingUpIcon class="size-4" /></span
									>
									<div class="min-w-0 flex-1">
										<p class="truncate font-semibold">{activity.assignment._Measure}</p>
										<p class="text-muted-foreground truncate text-sm">
											Low score · {activity.assignment._DisplayScore} · {removeCourseType(
												activity.course._CourseName
											)}
										</p>
									</div>
									<ArrowRightIcon class="text-muted-foreground size-4" /></a
								>
							{/each}
							{#each attentionCourses.slice(0, 3) as { course, grade } (course._CourseID)}
								<a
									href="/grades/{encodeURIComponent(course._CourseID)}"
									class="border-border/70 hover:bg-accent/50 flex items-center gap-3 border-b p-3.5 transition-colors last:border-b-0"
									><span
										class="bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-lg"
										><TrendingUpIcon class="size-4" /></span
									>
									<div class="min-w-0 flex-1">
										<p class="truncate font-semibold">{removeCourseType(course._CourseName)}</p>
										<p class="text-muted-foreground text-sm">
											Currently {grade.letter} · {grade.percentage.toFixed(1)}%
										</p>
									</div>
									<ArrowRightIcon class="text-muted-foreground size-4" /></a
								>
							{/each}
							{#if attendanceEvents > 0}<a
									href="/attendance"
									class="border-border/70 hover:bg-accent/50 flex items-center gap-3 border-b p-3.5 transition-colors last:border-b-0"
									><span
										class="bg-warning/10 text-warning flex size-9 items-center justify-center rounded-lg"
										><BellIcon class="size-4" /></span
									>
									<div class="min-w-0 flex-1">
										<p class="font-semibold">Attendance record</p>
										<p class="text-muted-foreground text-sm">
											{attendanceEvents} recorded period event{attendanceEvents === 1 ? '' : 's'}
										</p>
									</div>
									<ArrowRightIcon class="text-muted-foreground size-4" /></a
								>{/if}
						</div>
					{/if}
				</section>

				<section
					aria-labelledby="courses-heading"
					class="border-border/80 bg-card overflow-hidden rounded-2xl border px-5 py-5 sm:px-6"
				>
					<div class="mb-3 flex items-end justify-between">
						<div>
							<h2 id="courses-heading" class="text-xl font-bold">Classes</h2>
							<p class="text-muted-foreground text-sm">Current grades and latest scores</p>
						</div>
						<a href="/grades" class="text-primary text-sm font-semibold">Open gradebook</a>
					</div>
					<div>
						{#each courses as course (course._CourseID)}
							{@const grade = getCourseGrade(course)}{@const latest = latestAssignment(course)}
							<a
								href="/grades/{encodeURIComponent(course._CourseID)}"
								class="border-border/70 hover:bg-accent/40 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-3.5 transition-colors last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_12rem_auto]"
							>
								<span
									class="{grade
										? gradeDot(grade.percentage)
										: 'bg-muted-foreground/30'} h-8 w-1 rounded-full"
								></span>
								<div class="min-w-0">
									<p class="truncate font-semibold">{removeCourseType(course._CourseName)}</p>
									<p class="text-muted-foreground text-xs">
										Period {course._Period}{course._Room ? ` · Room ${course._Room}` : ''}
									</p>
								</div>
								<div class="hidden min-w-0 sm:block">
									{#if latest}<p class="truncate text-sm">{latest.assignment._Measure}</p>
										<p class="text-muted-foreground truncate text-xs">
											{latest.assignment._DisplayScore}
										</p>{:else}<p class="text-muted-foreground text-sm">No graded work yet</p>{/if}
								</div>
								<div class="flex items-center gap-3">
									<div class="text-right">
										<strong class="text-lg {grade ? gradeTone(grade.percentage) : ''}"
											>{grade?.letter || '—'}</strong
										>
										<p class="text-muted-foreground text-xs">
											{grade ? `${grade.percentage.toFixed(1)}%` : 'Not graded'}
										</p>
									</div>
									<ArrowRightIcon class="text-muted-foreground size-4" />
								</div>
							</a>
						{/each}
					</div>
				</section>

				<section
					aria-labelledby="recent-heading"
					class="border-border/80 bg-card overflow-hidden rounded-2xl border px-5 py-5 sm:px-6"
				>
					<div class="mb-3">
						<h2 id="recent-heading" class="text-xl font-bold">Recent grades</h2>
						<p class="text-muted-foreground text-sm">Newest graded assignments from StudentVUE</p>
					</div>
					<div>
						{#each recentAssignments as activity (activity.assignment._GradebookID)}
							{@const percent = assignmentPercent(activity.assignment)}
							<a
								href="/grades/{encodeURIComponent(activity.course._CourseID)}"
								class="border-border/70 hover:bg-accent/40 flex items-center gap-3 border-b px-3 py-3 transition-colors last:border-b-0"
								><span
									class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
									><BookOpenCheckIcon class="size-4" /></span
								>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<p class="truncate font-semibold">{activity.assignment._Measure}</p>
										{#if activity.isNew}<span
												class="bg-success/10 text-success rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
												>New</span
											>{/if}
									</div>
									<p class="text-muted-foreground truncate text-sm">
										{removeCourseType(activity.course._CourseName)} · {shortDateFormatter.format(
											activity.date
										)}
									</p>
								</div>
								<div class="text-right">
									<strong class={percent === undefined ? '' : gradeTone(percent)}
										>{activity.assignment._DisplayScore}</strong
									>{#if percent !== undefined}<p class="text-muted-foreground text-xs">
											{percent.toFixed(0)}%
										</p>{/if}
								</div></a
							>
						{:else}<p class="text-muted-foreground py-8 text-center">
								No recent graded assignments.
							</p>{/each}
					</div>
				</section>
			</div>

			<aside class="min-w-0 space-y-5">
				<section
					aria-labelledby="upcoming-heading"
					class="border-border/80 bg-card rounded-2xl border p-5"
				>
					<div class="mb-4 flex items-center gap-2">
						<CalendarDaysIcon class="text-primary size-5" />
						<h2 id="upcoming-heading" class="text-lg font-bold">Coming up</h2>
					</div>
					{#if calendarLoading && calendarEvents.length === 0}<div class="flex justify-center py-8">
							<Spinner />
						</div>
					{:else if calendarError}<div class="text-muted-foreground py-6 text-center">
							<p class="text-sm">Calendar unavailable.</p>
							<Button class="mt-3" variant="outline" onclick={() => void loadCalendar()}
								>Try again</Button
							>
						</div>
					{:else if upcomingEvents.length === 0}<p class="text-muted-foreground py-6 text-sm">
							Nothing else scheduled this month.
						</p>
					{:else}<div class="space-y-4">
							{#each upcomingEvents as { event, date } (event.id)}<div class="flex gap-3">
									<div
										class="border-border bg-card flex size-11 shrink-0 flex-col items-center justify-center rounded-lg border leading-none"
									>
										<span class="text-muted-foreground text-[10px] font-bold uppercase"
											>{date.toLocaleDateString('en-US', { month: 'short' })}</span
										><strong class="mt-1">{date.getDate()}</strong>
									</div>
									<div class="min-w-0 pt-0.5">
										<p class="truncate text-sm font-semibold">{event.title || event.type}</p>
										<p class="text-muted-foreground truncate text-xs">
											{event.time || event.description || 'School event'}
										</p>
									</div>
								</div>{/each}
						</div>{/if}
				</section>

				<section
					aria-labelledby="updates-heading"
					class="border-border/80 bg-card rounded-2xl border p-5"
				>
					<h2 id="updates-heading" class="mb-4 text-lg font-bold">School updates</h2>
					<div class="space-y-2">
						<a
							href="/mail"
							class="border-border bg-card hover:bg-accent flex items-center gap-3 rounded-xl border p-4 transition-colors"
							><span
								class="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg"
								><InboxIcon class="size-4" /></span
							>
							<div class="min-w-0 flex-1">
								<p class="font-semibold">Mail</p>
								<p class="text-muted-foreground text-sm">
									{mailDataState.data
										? `${unreadMessages.length} unread`
										: mailDataState.error
											? 'Unavailable'
											: 'Loading…'}
								</p>
							</div>
							<ArrowRightIcon class="text-muted-foreground size-4" /></a
						>
						<a
							href="/attendance"
							class="border-border bg-card hover:bg-accent flex items-center gap-3 rounded-xl border p-4 transition-colors"
							><span
								class="bg-warning/10 text-warning flex size-9 items-center justify-center rounded-lg"
								><ClockIcon class="size-4" /></span
							>
							<div class="min-w-0 flex-1">
								<p class="font-semibold">Attendance</p>
								<p class="text-muted-foreground text-sm">
									{attendanceState.data
										? `${attendanceEvents} period event${attendanceEvents === 1 ? '' : 's'}`
										: attendanceState.error
											? 'Unavailable'
											: 'Loading…'}
								</p>
							</div>
							<ArrowRightIcon class="text-muted-foreground size-4" /></a
						>
						<a
							href="/documents"
							class="border-border bg-card hover:bg-accent flex items-center gap-3 rounded-xl border p-4 transition-colors"
							><span
								class="bg-success/10 text-success flex size-9 items-center justify-center rounded-lg"
								><FileTextIcon class="size-4" /></span
							>
							<div class="min-w-0 flex-1">
								<p class="font-semibold">Newest document</p>
								<p class="text-muted-foreground truncate text-sm">
									{documentsState.data
										? latestDocument
											? documentName()
											: 'No documents yet'
										: documentsState.error
											? 'Unavailable'
											: 'Loading…'}
								</p>
							</div>
							<ArrowRightIcon class="text-muted-foreground size-4" /></a
						>
					</div>
				</section>

				<section>
					<div class="bg-muted/45 rounded-xl p-4">
						<p class="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
							Current term
						</p>
						<p class="mt-1 font-semibold">
							{gradebook?.ReportingPeriod._GradePeriod ?? 'Current grading period'}
						</p>
						<p class="text-muted-foreground mt-1 text-sm">
							{gradedCourses.length} of {courses.length} classes currently graded
						</p>
					</div>
				</section>
			</aside>
		</div>
	{/if}
</main>

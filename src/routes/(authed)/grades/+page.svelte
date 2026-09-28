<script lang="ts">
	import { removeCourseType } from '$lib/grades/course-name';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import {
		getReportPeriodName,
		gradebookState,
		initializeGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import {
		clearCourseUnseenAssignments,
		getCourseGrade,
		getCourseUnseenAssignmentsCount,
		isGradedAssignment
	} from '$lib/grades/course';
	import { saveSeenAssignmentsToLocalStorage } from '$lib/grades/seenAssignments';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
	import { recordCourseGradeScaleObservation } from '$lib/grades/grade-scale';
	import { parseGradebookXML } from '$lib/synergy';
	import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { onMount } from 'svelte';
	import CourseButton from './CourseButton.svelte';
	import ReportPeriodSwitcher from './ReportPeriodSwitcher.svelte';

	let currentGradeLevel = $state<number | undefined>(undefined);
	let refreshing = $state(false);

	onMount(() => {
		const account = acc.studentAccount;
		if (!account) return;
		void initializeGradebookCatalog();
		void account
			.studentInfo()
			.then((profile) => {
				currentGradeLevel = profile.Grade ?? undefined;
			})
			.catch(() => {
				// GPA remains a clearly labeled current-gradebook estimate when the profile is unavailable.
				currentGradeLevel = undefined;
			});
	});

	const gradebookCatalog = $derived.by(() => {
		gradebookState.version;
		return gradebookState.gradebookCatalog;
	});
	const gradebook = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const record = catalog.recordCache[catalog.overrideIndex ?? catalog.defaultIndex];
		return record ? parseGradebookXML(record.xml) : undefined;
	});
	const activeReportPeriod = $derived(gradebook?.ReportingPeriod);
	const activeReportPeriodIndex = $derived(
		gradebookCatalog ? (gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex) : undefined
	);
	const courses = $derived(gradebook?.Courses.Course ?? []);
	$effect(() => {
		for (const course of courses) {
			const mark = course.Marks?.Mark[0];
			const percentage = Number.parseFloat(mark?._CalculatedScoreRaw ?? '');
			recordCourseGradeScaleObservation(
				course._CourseID,
				Number.isFinite(percentage) ? percentage : undefined,
				mark?._CalculatedScoreString
			);
		}
	});
	const hasNoGrades = $derived(
		courses
			.map((course) => course.Marks?.Mark[0]?._CalculatedScoreString ?? 'N/A')
			.every((score) => score === 'N/A')
	);
	const totalUnseenAssignments = $derived(
		courses.reduce((total, course) => total + getCourseUnseenAssignmentsCount(course), 0)
	);
	const gpas = $derived(calculateCourseGpas(courses, currentGradeLevel));
	const gpaProgress = $derived(
		gpas.unweighted === undefined ? 0 : Math.min(Math.max((gpas.unweighted / 4) * 100, 0), 100)
	);
	const recentAssignments = $derived(
		courses
			.flatMap((course) =>
				(course.Marks?.Mark[0]?.Assignments?.Assignment ?? []).map((assignment) => ({
					assignment,
					course,
					date: assignmentDate(assignment)
				}))
			)
			.filter((item) => isGradedAssignment(item.assignment))
			.toSorted((a, b) => b.date.getTime() - a.date.getTime())
			.slice(0, 8)
	);

	function assignmentDate(assignment: AssignmentEntity) {
		const date = new Date(assignment._DueDate || assignment._Date);
		return Number.isNaN(date.getTime()) ? new Date(0) : date;
	}

	function assignmentPercentage(assignment: AssignmentEntity) {
		const earned = Number.parseFloat(assignment._Point ?? assignment._ScoreCalValue ?? '');
		const possible = Number.parseFloat(
			assignment._PointPossible ?? assignment._ScoreMaxValue ?? ''
		);
		return Number.isFinite(earned) && Number.isFinite(possible) && possible > 0
			? (earned / possible) * 100
			: undefined;
	}

	function assignmentScore(assignment: AssignmentEntity) {
		const percentage = assignmentPercentage(assignment);
		if (percentage !== undefined)
			return `${percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
		return assignment._DisplayScore || assignment._Point || assignment._ScoreCalValue || 'Graded';
	}

	function percentageTone(percentage: number) {
		if (percentage >= 90) return 'score-strong';
		if (percentage >= 80) return 'score-watch';
		return 'score-risk';
	}

	function formatAssignmentDate(date: Date) {
		return date.getTime()
			? date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
			: 'Date unavailable';
	}

	async function changeReportPeriod(index: number) {
		try {
			await switchReportPeriod({ overrideIndex: index, delta: true });
		} catch {
			// The shared loading state surfaces the request failure.
		}
	}

	async function refreshGrades() {
		if (refreshing || activeReportPeriodIndex === undefined) return;
		refreshing = true;
		try {
			await switchReportPeriod({
				overrideIndex: activeReportPeriodIndex,
				forceRefresh: true,
				silent: true
			});
		} catch {
			// The shared gradebook loading state reports refresh failures.
		} finally {
			refreshing = false;
		}
	}

	function markAllAssignmentsSeen() {
		courses.forEach(clearCourseUnseenAssignments);
		saveSeenAssignmentsToLocalStorage(seenAssignmentIDs);
	}
</script>

<svelte:head><title>Gradebook - {brand}</title></svelte:head>

<AppPageShell>
	{#if activeReportPeriod && activeReportPeriodIndex !== undefined && gradebook}
		<div class="gradebook-page">
			<header class="gradebook-header">
				<div class="min-w-0">
					<h1
						class="font-heading text-2xl leading-[1.2] font-bold tracking-[-0.035em] sm:text-[1.875rem]"
					>
						Gradebook
					</h1>
					<p class="text-muted-foreground mt-1 text-sm">{activeReportPeriod._GradePeriod} grades</p>
				</div>
				<div class="gradebook-controls">
					<Button
						href="/gpa-calculator"
						variant="outline"
						class="h-[2.375rem] w-full gap-2 whitespace-nowrap sm:w-auto"
						><CalculatorIcon class="size-[0.9375rem]" /> GPA calculator</Button
					>
					<div class="min-w-0">
						<span class="sr-only">Report period</span>
						<ReportPeriodSwitcher
							activeIndex={activeReportPeriodIndex}
							reportPeriods={gradebookCatalog?.canonicalReportPeriodEntries ??
								gradebook.ReportingPeriods.ReportPeriod}
							switchReportPeriod={changeReportPeriod}
							disabled={gradebookCatalog?.loadingIndex !== undefined}
						/>
					</div>
				</div>
			</header>

			<section class="gpa-overview" aria-label="GPA summary" data-testid="gpa-overview">
				<div
					class="gpa-ring"
					role="img"
					aria-label="Unweighted GPA {formatGpa(gpas.unweighted)} out of 4.00"
					style:--gpa-progress="{gpaProgress}%"
				>
					<div class="gpa-ring-inner">
						<strong>{formatGpa(gpas.unweighted)}</strong>
						<span>GPA</span>
					</div>
				</div>
				<div class="gpa-value-card gpa-unweighted">
					<p>Unweighted</p>
					<strong>{formatGpa(gpas.unweighted)}</strong>
				</div>
				<div class="gpa-value-card">
					<p>Weighted</p>
					<strong>{formatGpa(gpas.weighted)}</strong>
				</div>
			</section>

			<div class="gradebook-note" role="note">
				<span class="note-icon"><LightbulbIcon aria-hidden="true" /></span>
				<p>No pep talk. Just the school data you actually need.</p>
				<button
					type="button"
					class="refresh-grades"
					class:is-refreshing={refreshing}
					aria-label="Refresh grades"
					title="Refresh grades"
					disabled={refreshing}
					onclick={() => void refreshGrades()}
				>
					<RefreshCwIcon aria-hidden="true" />
				</button>
			</div>

			{#if hasNoGrades}
				<Alert.Root class="no-grade-alert">
					<CircleXIcon />No grades in {activeReportPeriod._GradePeriod} yet. Either the portal is early
					or the semester is.
					{#if activeReportPeriodIndex > 0}
						<Button
							onclick={() => void changeReportPeriod(activeReportPeriodIndex - 1)}
							variant="outline">View {getReportPeriodName(activeReportPeriodIndex - 1)}</Button
						>
					{/if}
				</Alert.Root>
			{/if}

			<div class="dashboard-columns">
				<section class="course-section" aria-labelledby="your-classes-heading">
					<header class="section-heading">
						<h2 id="your-classes-heading">Your classes</h2>
						{#if courses.length > 0 && totalUnseenAssignments > 0}
							<Button
								variant="outline"
								size="sm"
								onclick={markAllAssignmentsSeen}
								class="mark-seen-button">Mark {totalUnseenAssignments} new as seen</Button
							>
						{/if}
					</header>

					<ol class="course-grid" aria-label="Courses">
						{#each courses as course (course._CourseID)}
							<li>
								<CourseButton
									courseId={course._CourseID}
									name={removeCourseType(course._CourseName)}
									period={course._Period}
									room={course._Room}
									teacher={course._Staff}
									unseenAssignmentsCount={getCourseUnseenAssignmentsCount(course)}
									grade={getCourseGrade(course)}
								/>
							</li>
						{/each}
					</ol>
				</section>

				<aside class="recent-column" aria-labelledby="recently-graded-heading">
					<header class="section-heading recent-heading">
						<h2 id="recently-graded-heading">Recently graded</h2>
					</header>
					<section class="recent-panel" aria-label="Recently graded assignments">
						<header class="recent-panel-header">
							<h3>Latest scores</h3>
							<span class="recent-count">
								{recentAssignments.length}
								{recentAssignments.length === 1 ? 'assignment' : 'assignments'}
							</span>
						</header>
						{#if recentAssignments.length}
							<ol class="recent-list">
								{#each recentAssignments as item (`${item.course._CourseID}-${item.assignment._GradebookID}`)}
									{@const percentage = assignmentPercentage(item.assignment)}
									<li class="recent-item">
										<div class="recent-item-line">
											<p title={item.assignment._Measure}>{item.assignment._Measure}</p>
											<span
												class={percentage !== undefined
													? percentageTone(percentage)
													: 'score-neutral'}>{assignmentScore(item.assignment)}</span
											>
										</div>
										<p class="recent-item-meta">
											{removeCourseType(item.course._CourseName)} · {formatAssignmentDate(
												item.date
											)}
										</p>
									</li>
								{/each}
							</ol>
						{:else}
							<p class="recent-empty">
								No graded assignments yet. Upcoming work will appear after a score is posted.
							</p>
						{/if}
					</section>
				</aside>
			</div>
		</div>
	{/if}
</AppPageShell>

<style>
	.gradebook-page {
		max-width: 80rem;
		margin-inline: auto;
	}

	.gradebook-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.gradebook-header h1 {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.gradebook-controls {
		display: grid;
		grid-template-columns: auto minmax(10rem, 1fr);
		align-items: center;
		gap: 0.75rem;
		min-width: min(100%, 24rem);
	}

	.gpa-overview {
		display: grid;
		grid-template-columns: 10rem repeat(2, minmax(0, 1fr));
		align-items: center;
		gap: 1rem;
		margin-top: 1.25rem;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 1.5rem;
		background:
			linear-gradient(125deg, color-mix(in oklab, var(--primary) 7%, transparent), transparent 60%),
			var(--card);
		box-shadow: 0 8px 28px rgb(0 0 0 / 8%);
	}

	.gpa-ring {
		position: relative;
		display: grid;
		width: 9rem;
		aspect-ratio: 1;
		place-items: center;
		border-radius: 50%;
		background: conic-gradient(
			from -90deg,
			var(--grade-strong) 0 var(--gpa-progress),
			var(--secondary) var(--gpa-progress) 100%
		);
	}

	.gpa-ring-inner {
		display: flex;
		width: calc(100% - 1.125rem);
		aspect-ratio: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--card);
	}

	.gpa-ring-inner strong {
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: -0.045em;
		line-height: 1.05;
	}

	.gpa-ring-inner span {
		margin-top: 0.35rem;
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.625rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.gpa-value-card {
		display: flex;
		min-height: 8.25rem;
		flex-direction: column;
		justify-content: center;
		gap: 0.65rem;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--border);
		border-radius: 1.25rem;
		background: var(--background);
	}

	.gpa-value-card p {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.gpa-value-card strong {
		font-family: var(--font-heading);
		font-size: clamp(1.75rem, 3vw, 2.375rem);
		font-weight: 700;
		letter-spacing: -0.045em;
		line-height: 1;
	}

	.gpa-unweighted strong {
		color: var(--grade-strong);
	}

	.gradebook-note {
		display: flex;
		min-height: 4rem;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
		padding: 0.7rem 1rem;
		border: 1px solid color-mix(in oklab, var(--primary) 22%, var(--border));
		border-radius: 1.1rem;
		background: linear-gradient(
			100deg,
			color-mix(in oklab, var(--grade-strong) 9%, var(--card)),
			var(--card) 75%
		);
	}

	.note-icon {
		display: grid;
		width: 2.5rem;
		height: 2.5rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.8rem;
		background: color-mix(in oklab, var(--primary) 12%, transparent);
		color: var(--primary);
	}

	.note-icon :global(svg) {
		width: 1.2rem;
		height: 1.2rem;
	}

	.gradebook-note p {
		flex: 1 1 auto;
		color: var(--muted-foreground);
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.45;
	}

	.refresh-grades {
		display: grid;
		width: 2.5rem;
		height: 2.5rem;
		flex: 0 0 auto;
		place-items: center;
		border: 0;
		border-radius: 0.75rem;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	.refresh-grades:hover:not(:disabled) {
		background: color-mix(in oklab, var(--primary) 12%, transparent);
		color: var(--primary);
	}

	.refresh-grades:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.refresh-grades:disabled {
		cursor: wait;
	}

	.refresh-grades :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.refresh-grades.is-refreshing :global(svg) {
		animation: spin 1s linear infinite;
	}

	.no-grade-alert {
		margin-top: 1rem;
	}

	.dashboard-columns {
		display: grid;
		gap: 1.5rem;
		margin-top: 1.25rem;
	}

	.course-section,
	.recent-column {
		min-width: 0;
	}

	.section-heading {
		display: flex;
		min-height: 1.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.section-heading h2 {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.17em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	.mark-seen-button {
		min-height: 1.875rem;
		font-size: 0.6875rem;
	}

	.course-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.875rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.course-grid li {
		min-width: 0;
	}

	.recent-panel {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 1.25rem;
		background: var(--card);
		box-shadow: 0 8px 28px rgb(0 0 0 / 7%);
	}

	.recent-panel-header {
		display: flex;
		min-height: 4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1.1rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in oklab, var(--secondary) 55%, var(--card));
	}

	.recent-panel-header h3 {
		font-family: var(--font-heading);
		font-size: 0.9375rem;
		font-weight: 700;
		letter-spacing: -0.015em;
	}

	.recent-count {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.recent-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.recent-item {
		min-width: 0;
		padding: 0.8rem 1.1rem;
		border-bottom: 1px solid var(--border);
	}

	.recent-item:last-child {
		border-bottom: 0;
	}

	.recent-item-line {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.recent-item-line p {
		min-width: 0;
		overflow: hidden;
		font-size: 0.8125rem;
		font-weight: 650;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.recent-item-line > span {
		flex: 0 0 auto;
		font-family: var(--font-technical);
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.35;
		white-space: nowrap;
	}

	.score-strong {
		color: var(--grade-strong);
	}

	.score-watch {
		color: var(--grade-watch);
	}

	.score-risk {
		color: var(--grade-risk);
	}

	.score-neutral {
		color: var(--foreground);
	}

	.recent-item-meta {
		margin-top: 0.22rem;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		line-height: 1.3;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.recent-empty {
		padding: 1.5rem 1.1rem;
		color: var(--muted-foreground);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	@media (min-width: 62rem) {
		.course-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 76rem) {
		.dashboard-columns {
			grid-template-columns: minmax(0, 1.8fr) minmax(17rem, 0.75fr);
			align-items: start;
		}
	}

	@media (max-width: 69.99rem) {
		.gradebook-header {
			display: block;
			padding-bottom: 1.25rem;
		}

		.gradebook-controls {
			margin-top: 1.25rem;
		}
	}

	@media (max-width: 48rem) {
		.gradebook-controls {
			min-width: 0;
		}

		.gpa-overview {
			grid-template-columns: 6rem minmax(0, 1fr);
			gap: 0.65rem;
			margin-top: 1rem;
			padding: 0.875rem;
			border-radius: 1.25rem;
		}

		.gpa-ring {
			grid-row: span 2;
			width: 5.75rem;
		}

		.gpa-ring-inner {
			width: calc(100% - 0.875rem);
		}

		.gpa-ring-inner strong {
			font-size: 1.375rem;
		}

		.gpa-ring-inner span {
			margin-top: 0.15rem;
			font-size: 0.5rem;
		}

		.gpa-value-card {
			min-height: 5rem;
			gap: 0.35rem;
			padding: 0.65rem 0.85rem;
			border-radius: 0.9rem;
		}

		.gpa-value-card p {
			font-size: 0.5625rem;
			letter-spacing: 0.12em;
		}

		.gpa-value-card strong {
			font-size: 1.375rem;
		}

		.gradebook-note {
			min-height: 3.5rem;
			gap: 0.65rem;
			margin-top: 0.75rem;
			padding: 0.5rem 0.625rem;
			border-radius: 0.9rem;
		}

		.note-icon,
		.refresh-grades {
			width: 2.125rem;
			height: 2.125rem;
		}

		.gradebook-note p {
			font-size: 0.75rem;
		}

		.dashboard-columns {
			gap: 1.25rem;
			margin-top: 1rem;
		}
	}

	@media (max-width: 22.5rem) {
		.gradebook-controls {
			grid-template-columns: minmax(0, 1fr);
		}

		.gpa-overview {
			grid-template-columns: 4.75rem minmax(0, 1fr);
			padding: 0.65rem;
		}

		.gpa-ring {
			width: 4.625rem;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.refresh-grades.is-refreshing :global(svg) {
			animation-duration: 3s;
		}
	}
</style>

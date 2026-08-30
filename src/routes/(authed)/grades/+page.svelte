<script lang="ts">
	import { removeCourseType } from '$lib';
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
		getCourseUnseenAssignmentsCount
	} from '$lib/grades/course';
	import { calculateCourseGpas } from '$lib/grades/gpa';
	import { parseGradebookXML } from '$lib/synergy';
	import type { AssignmentEntity } from '$lib/types/Gradebook';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import { onMount } from 'svelte';
	import CourseButton from './CourseButton.svelte';
	import ReportPeriodSwitcher from './ReportPeriodSwitcher.svelte';

	onMount(() => {
		if (acc.studentAccount) void initializeGradebookCatalog();
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
	const hasNoGrades = $derived(
		courses
			.map((course) => course.Marks?.Mark[0]?._CalculatedScoreString ?? 'N/A')
			.every((score) => score === 'N/A')
	);
	const totalUnseenAssignments = $derived(
		courses.reduce((total, course) => total + getCourseUnseenAssignmentsCount(course), 0)
	);
	const gpas = $derived(calculateCourseGpas(courses));
	const recentAssignments = $derived(
		courses
			.flatMap((course) =>
				(course.Marks?.Mark[0]?.Assignments?.Assignment ?? []).map((assignment) => ({
					assignment,
					course,
					date: assignmentDate(assignment)
				}))
			)
			.filter(
				(item) => item.assignment._Score !== undefined || item.assignment._Point !== undefined
			)
			.toSorted((a, b) => b.date.getTime() - a.date.getTime())
			.slice(0, 8)
	);
	const gradedCourses = $derived(
		courses.flatMap((course) => {
			const grade = getCourseGrade(course);
			return grade ? [{ course, grade }] : [];
		})
	);
	const strongestCourse = $derived(
		gradedCourses.toSorted((a, b) => b.grade.percentage - a.grade.percentage)[0]
	);
	const needsAttention = $derived(
		gradedCourses.toSorted((a, b) => a.grade.percentage - b.grade.percentage)[0]
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
	function percentageTone(percentage: number) {
		if (percentage >= 90) return 'text-grade-strong';
		if (percentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	}
	async function changeReportPeriod(index: number) {
		try {
			await switchReportPeriod({ overrideIndex: index });
		} catch {
			// The shared loading state surfaces the request failure.
		}
	}
</script>

<svelte:head><title>Gradebook - {brand}</title></svelte:head>

<AppPageShell>
	{#if activeReportPeriod && activeReportPeriodIndex !== undefined && gradebook}
		<div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<h1 class="font-heading text-[1.875rem] leading-tight font-bold tracking-[-0.035em]">
				Gradebook
			</h1>
			<div class="grid grid-cols-1 gap-2 sm:flex">
				<Button href="/gpa-calculator" class="h-10 rounded-lg px-4"
					><CalculatorIcon class="size-4" /> GPA calculator</Button
				>
				<ReportPeriodSwitcher
					activeName={activeReportPeriod._GradePeriod}
					activeIndex={activeReportPeriodIndex}
					reportPeriods={gradebookCatalog?.canonicalReportPeriodEntries ??
						gradebook.ReportingPeriods.ReportPeriod}
					switchReportPeriod={changeReportPeriod}
					hasReportPeriodCached={(index) => gradebookCatalog?.recordCache[index] !== undefined}
					disabled={gradebookCatalog?.loadingIndex !== undefined}
					defaultIndex={gradebookCatalog?.defaultIndex}
				/>
			</div>
		</div>

		<div class="grid items-start gap-[22px] xl:grid-cols-[minmax(0,770px)_320px]">
			<div class="min-w-0 space-y-6">
				<details class="border-border/80 bg-card group rounded-xl border shadow-sm sm:hidden">
					<summary
						class="flex h-11 cursor-pointer list-none items-center justify-between px-4 font-semibold"
					>
						<span>Estimated GPA</span>
						<span class="text-muted-foreground flex items-center gap-2 font-mono"
							>{gpas.unweighted?.toFixed(2) ?? '—'}
							<ChevronDownIcon class="size-4 transition-transform group-open:rotate-180" /></span
						>
					</summary>
					<div class="border-border/70 grid grid-cols-2 border-t">
						<div class="p-4">
							<p class="metric-label">Unweighted</p>
							<p class="mt-1 font-mono text-2xl font-bold">{gpas.unweighted?.toFixed(2) ?? '—'}</p>
						</div>
						<div class="border-border/70 border-l p-4">
							<p class="metric-label">Weighted</p>
							<p class="mt-1 font-mono text-2xl font-bold">{gpas.weighted?.toFixed(2) ?? '—'}</p>
						</div>
					</div>
				</details>

				<section
					class="border-border/80 bg-card hidden h-28 grid-cols-3 overflow-hidden rounded-xl border shadow-sm sm:grid"
					aria-label="Grade summary"
				>
					<div class="flex flex-col justify-center px-5">
						<p class="metric-label">GPA · Unweighted</p>
						<div class="mt-2 flex items-end gap-3">
							<strong class="text-grade-strong font-mono text-[2rem] leading-none"
								>{gpas.unweighted?.toFixed(2) ?? '—'}</strong
							><span class="text-muted-foreground font-mono text-xs"
								>{gpas.graded.length} graded courses</span
							>
						</div>
					</div>
					<div class="border-border/70 flex flex-col justify-center border-x px-5">
						<p class="metric-label">GPA · Weighted</p>
						<strong class="mt-2 font-mono text-[2rem] leading-none"
							>{gpas.weighted?.toFixed(2) ?? '—'}</strong
						>
					</div>
					<div class="flex flex-col justify-center px-5">
						<p class="metric-label">Classes</p>
						<strong class="mt-2 font-mono text-[2rem] leading-none">{courses.length}</strong>
					</div>
				</section>

				{#if hasNoGrades}
					<Alert.Root
						><CircleXIcon />No grades have been posted in {activeReportPeriod._GradePeriod}.{#if activeReportPeriodIndex > 0}<Button
								onclick={() => void changeReportPeriod(activeReportPeriodIndex - 1)}
								variant="outline">View {getReportPeriodName(activeReportPeriodIndex - 1)}</Button
							>{/if}</Alert.Root
					>
				{/if}

				<ol class="space-y-3">
					{#each courses as course (course._CourseID)}
						<li>
							<CourseButton
								courseId={course._CourseID}
								name={removeCourseType(course._CourseName)}
								period={course._Period}
								room={course._Room}
								teacher={course._Staff}
								teacherEmail={course._StaffEMail}
								unseenAssignmentsCount={getCourseUnseenAssignmentsCount(course)}
								grade={getCourseGrade(course)}
							/>
						</li>
					{/each}
				</ol>

				{#if courses.length > 0 && totalUnseenAssignments > 0}<div class="flex justify-center">
						<Button variant="outline" onclick={() => courses.forEach(clearCourseUnseenAssignments)}
							>Mark {totalUnseenAssignments} new assignment{totalUnseenAssignments === 1 ? '' : 's'} as
							seen</Button
						>
					</div>{/if}
			</div>

			<aside class="hidden space-y-3 xl:block" aria-label="Gradebook details">
				<section class="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
					<h2 class="border-border/70 border-b px-5 py-4 font-bold">Grade snapshot</h2>
					<div class="grid grid-cols-2 divide-x">
						<div class="min-w-0 p-4">
							<p class="metric-label">Strongest</p>
							<p class="mt-2 truncate font-semibold">
								{strongestCourse
									? removeCourseType(strongestCourse.course._CourseName)
									: 'No grades yet'}
							</p>
							{#if strongestCourse}<p class="text-grade-strong mt-1 font-mono text-lg font-bold">
									{strongestCourse.grade.percentage.toFixed(1)}%
								</p>{/if}
						</div>
						<div class="min-w-0 p-4">
							<p class="metric-label">Watch</p>
							<p class="mt-2 truncate font-semibold">
								{needsAttention
									? removeCourseType(needsAttention.course._CourseName)
									: 'No grades yet'}
							</p>
							{#if needsAttention}<p
									class="{percentageTone(
										needsAttention.grade.percentage
									)} mt-1 font-mono text-lg font-bold"
								>
									{needsAttention.grade.percentage.toFixed(1)}%
								</p>{/if}
						</div>
					</div>
				</section>

				<section class="border-border/80 bg-card overflow-hidden rounded-xl border shadow-sm">
					<h2 class="border-border/70 border-b px-5 py-4 font-bold">Recently graded</h2>
					{#if recentAssignments.length}<ol class="divide-border/70 divide-y">
							{#each recentAssignments as item (`${item.course._CourseID}-${item.assignment._GradebookID}`)}{@const score =
									assignmentPercentage(item.assignment)}
								<li class="px-4 py-3">
									<div class="flex items-start justify-between gap-3">
										<p class="line-clamp-1 font-semibold">{item.assignment._Measure}</p>
										{#if score !== undefined}<span
												class="{percentageTone(score)} shrink-0 font-mono text-xs font-bold"
												>{score.toFixed(1)}%</span
											>{/if}
									</div>
									<p class="text-muted-foreground mt-0.5 truncate text-xs">
										{removeCourseType(item.course._CourseName)} · {item.date.getTime()
											? item.date.toLocaleDateString(undefined, {
													month: 'numeric',
													day: 'numeric',
													year: '2-digit'
												})
											: 'Date unavailable'}
									</p>
								</li>{/each}
						</ol>{:else}<p class="text-muted-foreground px-5 py-8 text-center text-sm">
							No graded assignments yet.
						</p>{/if}
				</section>
			</aside>
		</div>
	{/if}
</AppPageShell>

<style>
	.metric-label {
		color: var(--muted-foreground);
		font-size: 0.69rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
</style>

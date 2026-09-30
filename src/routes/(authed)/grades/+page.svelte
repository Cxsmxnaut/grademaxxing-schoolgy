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
		getCourseUnseenAssignmentsCount
	} from '$lib/grades/course';
	import { saveSeenAssignmentsToLocalStorage } from '$lib/grades/seenAssignments';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
	import { recordCourseGradeScaleObservation } from '$lib/grades/grade-scale';
	import { parseGradebookXML } from '$lib/synergy';
	import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import { onMount } from 'svelte';
	import CourseButton from './CourseButton.svelte';
	import ReportPeriodSwitcher from './ReportPeriodSwitcher.svelte';

	let currentGradeLevel = $state<number | undefined>(undefined);

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
			await switchReportPeriod({ overrideIndex: index, delta: true });
		} catch {
			// The shared loading state surfaces the request failure.
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
		<div class="grid items-start gap-[22px] xl:grid-cols-[minmax(0,770px)_320px]">
			<div class="min-w-0">
				<div
					class="mb-[1.21875rem] flex flex-col gap-[0.75rem] sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
				>
					<h1
						class="font-heading -translate-y-[0.5px] text-2xl leading-[1.5] font-bold tracking-[-0.02em] sm:translate-y-0 sm:text-[1.875rem]"
					>
						Gradebook
					</h1>
					<div
						class="grid -translate-y-[0.5px] grid-cols-2 items-center gap-2.5 sm:flex sm:translate-y-[3.5px]"
					>
						<Button
							href="/gpa-calculator"
							class="border-primary h-[2.171875rem] w-full gap-[0.4375rem] rounded-[0.4375rem] border px-3 py-[0.4375rem] text-[0.78125rem] leading-[1.5] font-semibold tracking-[0.015625rem] shadow-none sm:w-[8.6328125rem]"
							><CalculatorIcon class="size-[0.9375rem]" /> GPA calculator</Button
						>
						<ReportPeriodSwitcher
							activeIndex={activeReportPeriodIndex}
							reportPeriods={gradebookCatalog?.canonicalReportPeriodEntries ??
								gradebook.ReportingPeriods.ReportPeriod}
							switchReportPeriod={changeReportPeriod}
							disabled={gradebookCatalog?.loadingIndex !== undefined}
						/>
					</div>
				</div>

				<details class="gradebook-panel border-border bg-card group mb-6 border sm:hidden">
					<summary
						class="flex h-[2.625rem] cursor-pointer list-none items-center justify-between px-[0.875rem] text-[0.84375rem] leading-[normal] font-semibold"
					>
						<span>GPA summary</span>
						<span class="text-muted-foreground flex items-center gap-[0.4375rem] font-mono">
							<span class="group-open:hidden">{formatGpa(gpas.unweighted)}</span>
							<ChevronDownIcon class="size-4 transition-transform group-open:rotate-180" /></span
						>
					</summary>
					<div class="border-border/70 grid grid-cols-2 border-t">
						<div class="flex h-[6.375rem] items-center px-4 py-[0.875rem]">
							<div>
								<p class="metric-label">GPA · Unweighted</p>
								<div class="mt-2 flex items-baseline gap-2.5">
									<p class="text-grade-strong text-[1.625rem] leading-[1.5] font-bold">
										{formatGpa(gpas.unweighted)}
									</p>
									<span class="text-tertiary-foreground font-mono text-xs leading-[1.5]"
										>{gpas.graded.length} graded courses</span
									>
								</div>
							</div>
						</div>
						<div
							class="border-border/70 flex h-[6.375rem] items-center border-l px-4 py-[0.875rem]"
						>
							<div>
								<p class="metric-label">GPA · Weighted</p>
								<p class="mt-2 text-[1.625rem] leading-[1.5] font-bold">
									{formatGpa(gpas.weighted)}
								</p>
							</div>
						</div>
					</div>
				</details>

				<section
					class="gradebook-panel border-border bg-card mb-6 hidden h-28 grid-cols-[1.4fr_1fr] overflow-hidden border sm:grid"
					aria-label="Grade summary"
				>
					<div class="flex flex-col px-5 py-[1.125rem]">
						<p class="metric-label">GPA · Unweighted</p>
						<div class="mt-2 flex items-baseline gap-[0.625rem]">
							<strong
								class="text-grade-strong text-[2rem] leading-[1.5]"
								style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif;"
								>{formatGpa(gpas.unweighted)}</strong
							><span class="text-tertiary-foreground font-mono text-xs leading-[1.5]"
								>{gpas.graded.length} graded courses</span
							>
						</div>
					</div>
					<div class="border-border flex flex-col border-l px-5 py-[1.125rem]">
						<p class="metric-label">GPA · Weighted</p>
						<strong
							class="mt-2 text-[2rem] leading-[1.5]"
							style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif;"
							>{formatGpa(gpas.weighted)}</strong
						>
					</div>
				</section>

				{#if hasNoGrades}
					<Alert.Root
						><CircleXIcon />No grades in {activeReportPeriod._GradePeriod} yet. Either the portal is early
						or the semester is.{#if activeReportPeriodIndex > 0}<Button
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
						<Button variant="outline" onclick={markAllAssignmentsSeen}
							>Mark {totalUnseenAssignments} new assignment{totalUnseenAssignments === 1 ? '' : 's'} as
							seen</Button
						>
					</div>{/if}
			</div>

			<aside class="hidden space-y-3.5 xl:block" aria-label="Gradebook details">
				<section class="gradebook-panel border-border bg-card overflow-hidden border">
					<h2 class="border-border border-b px-5 py-4 text-sm leading-[1.5] font-semibold">
						Recently graded
					</h2>
					{#if recentAssignments.length}<ol class="divide-border divide-y">
							{#each recentAssignments as item (`${item.course._CourseID}-${item.assignment._GradebookID}`)}{@const score =
									assignmentPercentage(item.assignment)}
								<li class="px-[1.125rem] py-[0.625rem]">
									<div class="flex items-start justify-between gap-3">
										<p
											class="line-clamp-1 text-[0.78125rem] leading-[1.5] font-semibold tracking-[0.03em]"
										>
											{item.assignment._Measure}
										</p>
										{#if score !== undefined}<span
												class="{percentageTone(
													score
												)} shrink-0 font-mono text-[0.78125rem] leading-[1.5] font-semibold"
												>{score.toFixed(1)}%</span
											>{/if}
									</div>
									<p class="text-tertiary-foreground truncate text-[0.6875rem] leading-[1.5]">
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
							No graded assignments yet. The portal may be pacing itself.
						</p>{/if}
				</section>
			</aside>
		</div>
	{/if}
</AppPageShell>

<style>
	.gradebook-panel {
		border-radius: 0.75rem;
		box-shadow:
			0 1px 2px rgb(15 28 46 / 6%),
			0 8px 24px rgb(11 125 194 / 8%);
	}

	:global(.dark) .gradebook-panel {
		box-shadow:
			0 1px 2px rgb(0 0 0 / 40%),
			0 8px 24px rgb(0 0 0 / 30%);
	}

	.metric-label {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.5;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>

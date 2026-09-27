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
		<div class="gradebook-page">
			<header class="gradebook-header">
				<div class="min-w-0">
					<h1
						class="font-heading text-2xl leading-[1.2] font-bold tracking-[-0.035em] sm:text-[1.875rem]"
					>
						Gradebook
					</h1>
					<p class="text-muted-foreground mt-1 text-sm">
						{activeReportPeriod._GradePeriod} grades
					</p>
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

			<div class="gradebook-layout">
				<details
					class="mobile-grade-summary gradebook-panel border-border bg-card group mb-6 border sm:hidden"
				>
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
					class="gradebook-panel academic-summary border-border bg-card mb-6 hidden h-28 grid-cols-[1.4fr_1fr] overflow-hidden border sm:grid"
					aria-label="Grade summary"
				>
					<div class="flex flex-col px-5 py-[1.125rem]">
						<p class="metric-label">GPA · Unweighted</p>
						<div class="mt-2 flex items-baseline gap-[0.625rem]">
							<strong
								class="text-grade-strong text-[2rem] leading-[1.5]"
								style="font-family: 'Outfit', 'Manrope', system-ui, sans-serif;"
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
							style="font-family: 'Outfit', 'Manrope', system-ui, sans-serif;"
							>{formatGpa(gpas.weighted)}</strong
						>
					</div>
				</section>

				<section class="course-index" aria-label="Courses">
					{#if courses.length > 0 && totalUnseenAssignments > 0}<div class="mb-4 flex justify-end">
							<Button
								variant="outline"
								size="sm"
								onclick={markAllAssignmentsSeen}
								class="whitespace-nowrap"
								>Mark {totalUnseenAssignments} new assignment{totalUnseenAssignments === 1
									? ''
									: 's'} as seen</Button
							>
						</div>{/if}

					{#if hasNoGrades}
						<Alert.Root
							><CircleXIcon />No grades in {activeReportPeriod._GradePeriod} yet. Either the portal is
							early or the semester is.{#if activeReportPeriodIndex > 0}<Button
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
				</section>

				<aside class="gradebook-aside hidden gap-3.5 xl:grid" aria-label="Gradebook details">
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
		</div>
	{/if}
</AppPageShell>

<style>
	/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V4 */
	/* Hallmark · genre: modern-minimal · macrostructure: Index-First · design-system: existing Grademaxxing tokens */
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

	.gradebook-layout {
		display: grid;
		gap: 1.5rem;
		margin-top: 1.5rem;
	}

	.mobile-grade-summary,
	.academic-summary {
		margin-bottom: 0;
	}

	.course-index {
		min-width: 0;
	}

	.gradebook-panel {
		border-radius: 0.75rem;
		box-shadow: none;
	}

	.metric-label {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.5;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	@media (min-width: 70rem) {
		.gradebook-layout {
			grid-template-areas:
				'courses summary'
				'courses details';
			grid-template-columns: minmax(0, 1fr) 18rem;
			align-items: start;
			column-gap: 1.5rem;
			row-gap: 1.5rem;
		}

		.course-index {
			grid-area: courses;
		}

		.academic-summary {
			grid-area: summary;
			display: flex;
			flex-direction: column;
			height: auto;
			min-height: 0;
			grid-template-columns: 1fr;
			margin-bottom: 0;
		}

		.academic-summary > div {
			min-height: 0;
			padding: 1.125rem 1.25rem;
			border: 0;
			border-bottom: 1px solid var(--border);
		}

		.academic-summary > div:last-child {
			border-bottom: 0;
		}

		.gradebook-aside {
			grid-area: details;
			display: grid;
			grid-template-columns: minmax(0, 1fr);
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

		.gradebook-aside {
			display: none;
		}
	}

	@media (max-width: 47.99rem) {
		.gradebook-controls {
			min-width: 0;
		}
	}

	@media (max-width: 22.5rem) {
		.gradebook-controls {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>

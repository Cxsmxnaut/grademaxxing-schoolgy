<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getReportPeriodName, gradebookState, initializeGradebookCatalog } from '$lib/grades/catalog.svelte';
	import { getCourseGrade, getCourseUnseenAssignmentsCount } from '$lib/grades/course';
	import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { onMount } from 'svelte';

	onMount(() => {
		void initializeGradebookCatalog();
	});

	const gradebook = $derived.by(() => {
		gradebookState.version;
		return getActiveGradebook();
	});
	const courses = $derived(gradebook?.Courses.Course ?? []);
	const gradedCourses = $derived(
		courses.flatMap((course) => {
			const grade = getCourseGrade(course);
			return grade ? [{ course, ...grade }] : [];
		})
	);
	const gpas = $derived(calculateCourseGpas(courses));
	const focusedCourse = $derived(
		gradedCourses.toSorted((a, b) => a.percentage - b.percentage)[0]
	);
	const coursePulse = $derived(
		gradedCourses.toSorted((a, b) => b.percentage - a.percentage)
	);
	const activeIndex = $derived(
		gradebookState.gradebookCatalog
			? (gradebookState.gradebookCatalog.overrideIndex ?? gradebookState.gradebookCatalog.defaultIndex)
			: undefined
	);
	const reportPeriod = $derived(
		gradebook?.ReportingPeriod._GradePeriod ??
			(activeIndex === undefined ? undefined : getReportPeriodName(activeIndex))
	);
	const unseenAssignments = $derived(
		courses.reduce((total, course) => total + getCourseUnseenAssignmentsCount(course), 0)
	);

	function gradeTone(percentage: number) {
		if (percentage >= 90) return 'strong';
		if (percentage >= 80) return 'watch';
		return 'risk';
	}
</script>

<svelte:head><title>Dashboard - {brand}</title></svelte:head>

<AppPageShell class="dashboard-page">
	{#if gradebook && reportPeriod}
		<div class="dashboard-workbench">
			<header class="dashboard-intro dashboard-reveal" style="--dashboard-index: 0">
				<div class="dashboard-intro-copy">
					<p class="dashboard-kicker">Academic overview · {reportPeriod}</p>
					<h1>Know where you stand.</h1>
					<p class="dashboard-lede">
						A current read on your coursework, with the next place to look kept close.
					</p>
				</div>
				<Button href="/grades" class="dashboard-open-gradebook">
					Open gradebook <ArrowUpRightIcon class="size-4" />
				</Button>
			</header>

			<section class="dashboard-focus dashboard-reveal" style="--dashboard-index: 1" aria-labelledby="focus-heading">
				<div class="dashboard-section-heading">
					<p class="dashboard-kicker">Focus now</p>
					<h2 id="focus-heading">Start with the course that needs the most attention.</h2>
				</div>
				{#if focusedCourse}
					<a class="dashboard-focus-course" href={`/grades/${focusedCourse.course._CourseID}`}>
						<div>
							<p class="dashboard-course-name">{focusedCourse.course._CourseName}</p>
							<p class="dashboard-course-detail">
								{focusedCourse.letter} · {focusedCourse.percentage.toFixed(1)}% current grade
							</p>
						</div>
						<span class="dashboard-course-action">Review <ChevronRightIcon class="size-4" /></span>
					</a>
				{:else}
					<div class="dashboard-empty" role="status">
						<CircleAlertIcon class="dashboard-empty-icon size-5" />
						<div>
							<p>No current grades yet.</p>
							<p>Open your gradebook after your school posts marks for this period.</p>
						</div>
					</div>
				{/if}
			</section>

			<aside class="dashboard-snapshot dashboard-reveal" style="--dashboard-index: 2" aria-labelledby="snapshot-heading">
				<p class="dashboard-kicker" id="snapshot-heading">Academic snapshot</p>
				<dl>
					<div>
						<dt>Estimated GPA</dt>
						<dd>{formatGpa(gpas.unweighted)}</dd>
					</div>
					<div>
						<dt>Graded courses</dt>
						<dd>{gpas.graded.length}</dd>
					</div>
					<div>
						<dt>Unread assignments</dt>
						<dd>{unseenAssignments}</dd>
					</div>
				</dl>
				<p class="dashboard-snapshot-note">GPA is an estimate based on grades currently shown.</p>
			</aside>

			<section class="dashboard-pulse dashboard-reveal" style="--dashboard-index: 3" aria-labelledby="pulse-heading">
				<div class="dashboard-pulse-header">
					<div>
						<p class="dashboard-kicker">Course pulse</p>
						<h2 id="pulse-heading">Every current course, at a glance.</h2>
					</div>
					<a href="/grades" class="dashboard-text-link">View full gradebook <ChevronRightIcon class="size-4" /></a>
				</div>
				{#if coursePulse.length}
					<ul class="dashboard-course-list" aria-label="Current course grades">
						{#each coursePulse as entry (entry.course._CourseID)}
							<li>
								<a href={`/grades/${entry.course._CourseID}`} class="dashboard-course-row">
									<span class="dashboard-course-title">{entry.course._CourseName}</span>
									<span class="dashboard-course-meter" aria-hidden="true">
										<span style={`--course-progress: ${entry.percentage}%;`}></span>
									</span>
									<span class={`dashboard-grade dashboard-grade-${gradeTone(entry.percentage)}`}>
										{entry.letter} <small>{entry.percentage.toFixed(1)}%</small>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="dashboard-empty dashboard-empty-course" role="status">
						<BookOpenIcon class="dashboard-empty-icon size-5" />
						<div>
							<p>Your courses will appear here.</p>
							<p>There are no calculated grades available for this report period.</p>
						</div>
					</div>
				{/if}
			</section>
		</div>
	{:else}
		<div class="dashboard-loading" aria-live="polite">
			<p class="dashboard-kicker">Academic overview</p>
			<h1>Loading your gradebook…</h1>
			<p>Your current courses will appear as soon as they’re available.</p>
		</div>
	{/if}
</AppPageShell>

<style>
	@import './dashboard.css';
</style>

<script lang="ts">
	import { removeCourseType } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
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
	import { parseGradebookXML } from '$lib/synergy';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import { onMount } from 'svelte';
	import CourseButton from './CourseButton.svelte';
	import ReportPeriodSwitcher from './ReportPeriodSwitcher.svelte';

	onMount(() => {
		if (!acc.studentAccount) return;
		void initializeGradebookCatalog();
	});

	const gradebookCatalog = $derived.by(() => {
		gradebookState.version;
		return gradebookState.gradebookCatalog;
	});

	const gradebook = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const index = catalog.overrideIndex ?? catalog.defaultIndex;
		const record = catalog.recordCache[index];
		return record ? parseGradebookXML(record.xml) : undefined;
	});

	const activeReportPeriod = $derived(gradebook?.ReportingPeriod);
	const activeReportPeriodIndex = $derived(
		gradebookCatalog ? (gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex) : undefined
	);
	const courses = $derived(gradebook?.Courses.Course);
	const hasNoGrades = $derived(
		courses
			?.map((course) => course.Marks?.Mark[0]?._CalculatedScoreString ?? 'N/A')
			.every((score) => score === 'N/A') ?? false
	);
	const totalUnseenAssignments = $derived(
		courses?.reduce((total, course) => total + getCourseUnseenAssignmentsCount(course), 0) ?? 0
	);

	async function changeReportPeriod(index: number) {
		try {
			await switchReportPeriod({ overrideIndex: index });
		} catch {
			// The grade layout and toast surface the shared loading error.
		}
	}
</script>

<svelte:head>
	<title>Grades - {brand}</title>
</svelte:head>

<AppPageShell>
	<AppPageHeader
		eyebrow="Gradebook"
		title="Grades"
		description="Official grades from StudentVUE, with every class in one place."
	/>

	{#if activeReportPeriod && activeReportPeriodIndex !== undefined && gradebook}
		<div class="space-y-5">
			<div
				class="border-border/80 bg-card flex flex-col gap-4 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
			>
				<div>
					<p class="text-muted-foreground text-[0.68rem] font-bold tracking-[0.13em] uppercase">
						Reporting period
					</p>
					<p class="mt-0.5 font-semibold">{activeReportPeriod._GradePeriod}</p>
				</div>
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

			{#if hasNoGrades}
				<Alert.Root class="mx-auto flex w-fit items-center">
					<CircleXIcon class="shrink-0" />
					It looks like you don't have any grades yet in {activeReportPeriod._GradePeriod}.
					{#if activeReportPeriodIndex > 0}
						<Button
							onclick={() => void changeReportPeriod(activeReportPeriodIndex - 1)}
							variant="outline"
						>
							View {getReportPeriodName(activeReportPeriodIndex - 1)}
						</Button>
					{/if}
				</Alert.Root>
			{/if}

			<ol
				class="border-border/80 bg-card divide-border/70 divide-y overflow-hidden rounded-2xl border shadow-[0_18px_50px_-42px_rgba(7,32,52,0.65)]"
			>
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

			{#if courses && totalUnseenAssignments > 0}
				<Alert.Root class="mx-auto flex w-fit items-center gap-4 shadow-lg/30">
					<Alert.Title class="tracking-normal">
						{totalUnseenAssignments} new assignment{totalUnseenAssignments === 1 ? '' : 's'}
					</Alert.Title>
					<Button variant="outline" onclick={() => courses.forEach(clearCourseUnseenAssignments)}>
						Mark as seen
					</Button>
				</Alert.Root>
			{/if}
		</div>
	{/if}
</AppPageShell>

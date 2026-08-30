<script lang="ts">
	import { page } from '$app/state';
	import { numberFlowDefaultEasing, removeCourseType, tailwindColors } from '$lib';
	import { brand } from '$lib/brand';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import {
		calculateAssignmentGPCs,
		calculateAssignmentGPCsFromCategories,
		calculateAssignmentGPCsFromTotals,
		calculateCourseGradePercentageFromCategories,
		calculateCourseGradePercentageFromTotals,
		type Category,
		type Flowed,
		getCalculableAssignments,
		getCalculableAssignmentsWithCategories,
		getHiddenAssignmentsFromCategories,
		getPointsByCategory,
		getPointsByCategoryMap,
		gradesMatch,
		type HiddenAssignment,
		type NewHypotheticalAssignment,
		parseSynergyAssignment,
		randomAssignmentID,
		type ReactiveAssignment,
		type RealAssignment
	} from '$lib/grades/assignments';
	import { getSynergyCourseAssignmentCategories } from '$lib/grades/course';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import { gradebookState } from '$lib/grades/catalog.svelte';
	import { saveSeenAssignmentsToLocalStorage } from '$lib/grades/seenAssignments';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import Columns3CogIcon from '@lucide/svelte/icons/columns-3-cog';
	import Grid2x2PlusIcon from '@lucide/svelte/icons/grid-2x2-plus';
	import RotateCCWIcon from '@lucide/svelte/icons/rotate-ccw';
	import NumberFlow from '@number-flow/svelte';
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import AssignmentTabs from './AssignmentTabs.svelte';
	import CalculationError from './CalculationError.svelte';
	import GradeCategoryTable from './GradeCategoryTable.svelte';
	import GradeChart from './GradeChart.svelte';
	import GradeTruthLabel from './GradeTruthLabel.svelte';
	import TargetGradeCalculator from './TargetGradeCalculator.svelte';

	const synergyCourse = $derived.by(() => {
		gradebookState.version;
		const courses = getActiveGradebook()?.Courses.Course;
		if (!courses || page.params.index === undefined) return undefined;
		return courses.find((course) => course._CourseID === page.params.index);
	});

	const mark = $derived(synergyCourse?.Marks?.Mark[0]);
	const activeGradebookRecord = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		return catalog.recordCache[catalog.overrideIndex ?? catalog.defaultIndex];
	});

	const courseName = $derived(synergyCourse ? removeCourseType(synergyCourse._CourseName) : '');

	const synergyGradePercentage = $derived.by(() => {
		const percentage = Number.parseFloat(mark?._CalculatedScoreRaw ?? '');
		return Number.isFinite(percentage) ? percentage : undefined;
	});

	const categories: Category[] | undefined = $derived(
		synergyCourse ? getSynergyCourseAssignmentCategories(synergyCourse) : undefined
	);

	const gradeCategories = $derived(categories?.filter((category) => category.name !== 'TOTAL'));

	const synergyAssignments = $derived(mark?.Assignments?.Assignment ?? []);

	const realAssignments = $derived(
		calculateAssignmentGPCs(synergyAssignments.map(parseSynergyAssignment), gradeCategories)
	);

	const hiddenAssignments = $derived(
		categories
			? getHiddenAssignmentsFromCategories(
					categories,
					getPointsByCategory(getCalculableAssignments(realAssignments))
				)
			: []
	);

	const assignments: (RealAssignment | Flowed<RealAssignment | HiddenAssignment>)[] = $derived([
		...hiddenAssignments,
		...realAssignments
	]);

	let hypotheticalMode = $state(false);

	let calculatedGrade = $state(NaN);
	let hypotheticalGrade = $state(NaN);
	let rawGradeCalcMatches = $derived(
		synergyGradePercentage === undefined || gradesMatch(calculatedGrade, synergyGradePercentage)
	);

	let reactiveAssignments: ReactiveAssignment[] = $state([]);

	function initReactiveAssignments() {
		reactiveAssignments = assignments.map((assignment) => {
			const reactiveAssignment: ReactiveAssignment = $state({ ...assignment, reactive: true });

			return reactiveAssignment;
		});

		const calculable = getCalculableAssignments(assignments);

		calculatedGrade = gradeCategories
			? calculateCourseGradePercentageFromCategories(
					getPointsByCategory(calculable),
					gradeCategories
				)
			: calculateCourseGradePercentageFromTotals(calculable);

		hypotheticalGrade = calculatedGrade;

		showTargetGradeCalculator = false;
	}

	// Initialize reactive assignments and re-initialize them when assignments change
	$effect(() => {
		void assignments;

		untrack(initReactiveAssignments);
	});

	function recalculateGradePercentage() {
		if (gradeCategories === undefined) {
			reactiveAssignments = calculateAssignmentGPCsFromTotals(reactiveAssignments);

			const calculable = getCalculableAssignments(reactiveAssignments);

			hypotheticalGrade = calculateCourseGradePercentageFromTotals(calculable);
		} else {
			reactiveAssignments = calculateAssignmentGPCsFromCategories(
				reactiveAssignments,
				gradeCategories
			);

			const calculable = getCalculableAssignmentsWithCategories(reactiveAssignments);

			hypotheticalGrade = calculateCourseGradePercentageFromCategories(
				getPointsByCategory(calculable),
				gradeCategories
			);
		}
	}

	const pointsByCategory = $derived(
		getPointsByCategoryMap(getCalculableAssignmentsWithCategories(reactiveAssignments))
	);
	let showAllAssignmentsRevision = $state(0);

	function addHypotheticalAssignment() {
		const newHypotheticalAssignment: NewHypotheticalAssignment = $state({
			name: 'Hypothetical Assignment',
			id: randomAssignmentID(),
			pointsEarned: undefined,
			pointsPossible: undefined,
			unscaledPoints: undefined,
			extraCredit: false,
			gradePercentageChange: undefined,
			notForGrade: false,
			hidden: false,
			category: undefined,
			newHypothetical: true,
			date: new Date(),
			reactive: true
		});

		reactiveAssignments = [newHypotheticalAssignment, ...reactiveAssignments];
		showAllAssignmentsRevision += 1;
	}

	const prefix = $derived(hypotheticalMode ? '' : `${mark?._CalculatedScoreString} `);

	const grade = $derived(
		hypotheticalMode
			? hypotheticalGrade / 100
			: synergyGradePercentage !== undefined
				? synergyGradePercentage / 100
				: undefined
	);
	const unseenAssignments = $derived(
		realAssignments.filter(({ id }) => !seenAssignmentIDs.has(id))
	);

	let pinChart = $state(false);

	let showTargetGradeCalculator = $state(false);
	function toggleTargetGradeCalculator() {
		showTargetGradeCalculator = !showTargetGradeCalculator;
	}
	const gradeCategoryWeightProportions: Map<string, number> | undefined = $derived(
		gradeCategories
			? new Map(gradeCategories.map(({ name, weightPercentage }) => [name, weightPercentage / 100]))
			: undefined
	);

	const roundedGradePercentage = $derived(
		grade !== undefined ? Math.round(grade * 100 * 1000) / 1000 : undefined
	);
	const gradeTone = $derived.by(() => {
		if (roundedGradePercentage === undefined) return 'text-foreground';
		if (roundedGradePercentage > 100) return 'text-grade-extra';
		if (roundedGradePercentage >= 90) return 'text-grade-strong';
		if (roundedGradePercentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	});
	const gradeSurface = $derived.by(() => {
		if (roundedGradePercentage === undefined) return 'bg-secondary';
		if (roundedGradePercentage > 100) return 'bg-grade-extra-soft';
		if (roundedGradePercentage >= 90) return 'bg-grade-strong-soft';
		if (roundedGradePercentage >= 80) return 'bg-grade-watch-soft';
		return 'bg-grade-risk-soft';
	});

	const assignmentCategoryNames = $derived(
		new Set(realAssignments.map((assignment) => assignment.category).toSorted())
	);

	const assignmentCategoryColors = $derived(
		new Map(
			[...assignmentCategoryNames].map((name, i) => [
				name,
				tailwindColors[(i * 4) % tailwindColors.length]!
			])
		)
	);

	let showCategoryTable = $state(false);

	function markSeenAssignments() {
		realAssignments.forEach(({ id }) => seenAssignmentIDs.add(id));
		saveSeenAssignmentsToLocalStorage(seenAssignmentIDs);
	}
</script>

<svelte:head>
	<title>{courseName} - {brand}</title>
</svelte:head>

{#if synergyCourse}
	<main class="mx-auto w-full max-w-[68rem] px-4 pb-10 sm:px-6 lg:px-8">
		<div
			class={[
				'bg-background/95 sticky top-10 z-10 py-3 backdrop-blur transition-all md:top-0',
				!pinChart && 'md:bg-transparent'
			]}
		>
			<div
				class="border-border/80 bg-card flex items-center justify-between gap-4 rounded-2xl border p-3 shadow-[0_18px_50px_-44px_rgba(7,32,52,0.7)] sm:p-4"
			>
				<div class="flex min-w-0 items-center gap-3">
					<a
						href="/grades"
						class="bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors"
						aria-label="Back to Grades"
					>
						<ArrowLeftIcon class="size-4" />
					</a>
					<div class="min-w-0">
						<p class="text-primary text-[0.65rem] font-bold tracking-[0.13em] uppercase">
							Course details
						</p>
						<h1 class="truncate text-lg font-bold tracking-[-0.015em] sm:text-2xl">{courseName}</h1>
						<p class="text-muted-foreground truncate text-xs sm:text-sm">
							Period {synergyCourse._Period}{synergyCourse._Room
								? ` · Room ${synergyCourse._Room}`
								: ''}{synergyCourse._Staff ? ` · ${synergyCourse._Staff}` : ''}
						</p>
					</div>
				</div>

				<div
					class="{gradeSurface} flex shrink-0 flex-col items-end gap-1 rounded-xl px-3 py-2 sm:px-5"
				>
					<div class="{gradeTone} flex items-center font-mono text-xl font-bold sm:text-2xl">
						{#if hypotheticalMode && !categories && !rawGradeCalcMatches}
							<CircleAlertIcon class="mr-2 h-5 w-5" />
						{/if}
						{#if grade !== undefined}
							<NumberFlow
								{prefix}
								value={grade}
								format={{ style: 'percent', maximumFractionDigits: 3 }}
								spinTiming={{ duration: 400, easing: numberFlowDefaultEasing }}
							/>
						{/if}
					</div>
					<GradeTruthLabel {hypotheticalMode} lastRefresh={activeGradebookRecord?.lastRefresh} />
				</div>
			</div>
			{#if pinChart}
				<div class="border-border/80 bg-card mt-3 overflow-hidden rounded-2xl border">
					{@render chart()}
				</div>
			{/if}
		</div>

		{#if !rawGradeCalcMatches}
			<div class="m-4 flex justify-center" in:fade>
				<CalculationError
					{hypotheticalMode}
					officialPercentage={synergyGradePercentage}
					estimatedPercentage={hypotheticalMode ? hypotheticalGrade : calculatedGrade}
					hiddenAssignmentCount={hiddenAssignments.length}
				/>
			</div>
		{/if}

		{#if !pinChart}
			<section
				aria-label="Grade trend"
				class="border-border/80 bg-card overflow-hidden rounded-2xl border"
			>
				<div class="border-border/70 border-b px-5 py-4">
					<h2 class="font-bold">Grade trend</h2>
					<p class="text-muted-foreground text-sm">How posted work has changed this grade</p>
				</div>
				{@render chart()}
			</section>
		{/if}

		{#snippet chart()}
			<GradeChart
				assignments={hypotheticalMode ? reactiveAssignments : realAssignments}
				{gradeCategories}
				animate={!hypotheticalMode}
				error={!rawGradeCalcMatches}
				officialGrade={hypotheticalMode ? undefined : synergyGradePercentage}
			/>
		{/snippet}

		<div
			class="border-border/80 bg-card my-4 flex min-h-9 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border px-4 py-3"
		>
			<div class="flex items-center gap-2">
				<Checkbox
					bind:checked={hypotheticalMode}
					id="hypothetical-mode"
					title="Hypothetical mode allows you to see what your grade would be if you got a certain score on an assignment."
				/>
				<Label for="hypothetical-mode">Hypothetical Mode</Label>
			</div>

			{#if categories && gradeCategories}
				<div class="flex items-center gap-2">
					<Checkbox bind:checked={showCategoryTable} id="show-category-breakdown" />
					<Label for="show-category-breakdown">Show category breakdown</Label>
				</div>
			{/if}

			<div class="hidden items-center gap-2 sm:flex">
				<Checkbox bind:checked={pinChart} id="pin-chart" />
				<Label for="pin-chart">Pin chart to top of screen</Label>
			</div>

			{#if hypotheticalMode}
				<div transition:fade={{ duration: 200 }} class="ml-auto flex flex-wrap gap-1">
					<Button variant="card" onclick={initReactiveAssignments}>
						<RotateCCWIcon class="mr-2 h-4 w-4" />
						Reset
					</Button>

					{#if !showTargetGradeCalculator}
						<div transition:fade={{ duration: 200 }}>
							<Button variant="card" onclick={toggleTargetGradeCalculator}>
								<Columns3CogIcon class="mr-2 h-4 w-4" />
								Target Grade Calculator
							</Button>
						</div>
					{/if}

					<Button variant="card" onclick={addHypotheticalAssignment}>
						<Grid2x2PlusIcon class="mr-2 h-4 w-4" />
						Add Hypothetical Assignment
					</Button>
				</div>
			{/if}
		</div>

		{#if categories && gradeCategories && showCategoryTable}
			<div class="m-4 flex justify-center" transition:fade={{ duration: 200 }}>
				<GradeCategoryTable {gradeCategories} {hypotheticalMode} {pointsByCategory} />
			</div>
		{/if}

		{#if hypotheticalMode && showTargetGradeCalculator}
			<div class="m-4" transition:fade={{ duration: 200 }}>
				<TargetGradeCalculator
					initialGradePercentage={roundedGradePercentage}
					assignments={reactiveAssignments}
					categoryColors={assignmentCategoryColors}
					{gradeCategoryWeightProportions}
					onclose={toggleTargetGradeCalculator}
				/>
			</div>
		{/if}

		{#if synergyAssignments.length > 0 || hypotheticalMode}
			<div transition:fade={{ duration: 200 }}>
				<AssignmentTabs
					{assignments}
					{reactiveAssignments}
					{gradeCategories}
					{assignmentCategoryNames}
					{assignmentCategoryColors}
					{hypotheticalMode}
					{rawGradeCalcMatches}
					{showAllAssignmentsRevision}
					{recalculateGradePercentage}
					{seenAssignmentIDs}
				/>
			</div>
		{:else}
			<div class="flex justify-center">
				<Alert.Root class="mx-4 w-fit">
					<CircleXIcon />
					<Alert.Title class="line-clamp-none">
						Looks like this this course doesn't have any assignments yet.
					</Alert.Title>
				</Alert.Root>
			</div>
		{/if}

		{#if unseenAssignments.length > 0 && !hypotheticalMode}
			<div transition:fade={{ duration: 200 }} class="sticky bottom-8 mt-4 flex justify-center">
				<Alert.Root class="flex w-fit items-center gap-4 shadow-lg/30">
					<Alert.Title class="tracking-normal">
						{unseenAssignments.length} new assignment{unseenAssignments.length === 1 ? '' : 's'}
					</Alert.Title>
					<Button onclick={markSeenAssignments}>Mark as seen</Button>
				</Alert.Root>
			</div>
		{/if}
	</main>
{:else if getActiveGradebook()?.Courses.Course}
	<div class="mx-auto flex min-h-[50vh] max-w-xl items-center px-4">
		<Alert.Root>
			<CircleXIcon />
			<Alert.Title class="line-clamp-none"
				>This class is no longer in this grading period.</Alert.Title
			>
			<Alert.Description>
				The class list may have changed after a refresh. Return to Grades and choose the class
				again.
			</Alert.Description>
			<Button href="/grades" variant="outline">Back to Grades</Button>
		</Alert.Root>
	</div>
{/if}

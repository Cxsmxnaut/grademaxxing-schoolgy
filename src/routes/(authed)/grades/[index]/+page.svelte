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
	import NumberFlow from '@number-flow/svelte';
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import AssignmentTabs from './AssignmentTabs.svelte';
	import CalculationError from './CalculationError.svelte';
	import GradeCategoryTable from './GradeCategoryTable.svelte';
	import GradeChart from './GradeChart.svelte';
	import TargetGradeCalculator from './TargetGradeCalculator.svelte';

	const synergyCourse = $derived.by(() => {
		gradebookState.version;
		const courses = getActiveGradebook()?.Courses.Course;
		if (!courses || page.params.index === undefined) return undefined;
		return courses.find((course) => course._CourseID === page.params.index);
	});

	const mark = $derived(synergyCourse?.Marks?.Mark[0]);
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

	function addHypotheticalAssignment(
		category: string | undefined,
		pointsEarned: number,
		pointsPossible: number
	) {
		const whatIfNumber =
			reactiveAssignments.filter((assignment) => assignment.newHypothetical).length + 1;
		const newHypotheticalAssignment: NewHypotheticalAssignment = $state({
			name: `What-if ${whatIfNumber}`,
			id: randomAssignmentID(),
			pointsEarned,
			pointsPossible,
			unscaledPoints: undefined,
			extraCredit: false,
			gradePercentageChange: undefined,
			notForGrade: false,
			hidden: false,
			category,
			newHypothetical: true,
			date: new Date(),
			reactive: true
		});

		reactiveAssignments = [newHypotheticalAssignment, ...reactiveAssignments];
		showAllAssignmentsRevision += 1;
		recalculateGradePercentage();
	}

	function removeHypotheticalAssignment(id: string) {
		reactiveAssignments = reactiveAssignments.filter((assignment) => assignment.id !== id);
		recalculateGradePercentage();
	}

	const markLabel = $derived(mark?._CalculatedScoreString ?? '');
	const hypotheticalDelta = $derived(
		synergyGradePercentage === undefined || !Number.isFinite(hypotheticalGrade)
			? undefined
			: hypotheticalGrade - synergyGradePercentage
	);

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
	const assignmentCategoryNames = $derived(
		new Set(realAssignments.map((assignment) => assignment.category))
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
	<main
		class="min-h-[calc(100vh-3.09375rem)] w-full max-w-[67.5rem] px-4 pt-[0.84375rem] pb-[5.25rem] sm:px-6 md:min-h-screen lg:px-11 lg:pt-9 lg:pb-16"
	>
		<a
			href="/grades"
			class="text-primary mb-[0.875rem] inline-flex items-center gap-2 text-[0.90625rem] leading-[1.5] font-semibold hover:underline sm:mb-4 sm:text-sm sm:leading-5"
		>
			<ArrowLeftIcon class="size-4" /> All courses
		</a>

		<header class="mb-[1.125rem] flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<h1
					class="font-heading text-[1.75rem] leading-[1.5] font-bold tracking-normal sm:tracking-[-0.035em]"
				>
					{courseName}
				</h1>
				<p class="text-muted-foreground mt-1 text-sm leading-5 sm:truncate">
					Period {synergyCourse._Period}{synergyCourse._Room
						? ` · Room ${synergyCourse._Room}`
						: ''}{#if synergyCourse._Staff}
						· {#if synergyCourse._StaffEMail}<a
								href={`mailto:${synergyCourse._StaffEMail}`}
								class="text-primary hover:underline">{synergyCourse._Staff}</a
							>{:else}{synergyCourse._Staff}{/if}{/if}{#if mark?._MarkName}
						· {mark._MarkName}{/if}
				</p>
			</div>

			<div class="shrink-0 text-right">
				<div class="flex items-baseline justify-end gap-[0.625rem]">
					{#if hypotheticalMode && !categories && !rawGradeCalcMatches}<CircleAlertIcon
							class="text-grade-risk size-5"
						/>{/if}
					{#if markLabel}<span
							class="font-heading {gradeTone} text-[2.125rem] leading-none font-bold"
							>{markLabel}</span
						>{/if}
					{#if grade !== undefined}<NumberFlow
							class="font-mono text-[1.375rem] font-semibold"
							value={grade}
							format={{
								style: 'percent',
								minimumFractionDigits: 1,
								maximumFractionDigits: 1
							}}
							spinTiming={{ duration: 400, easing: numberFlowDefaultEasing }}
						/>{/if}
				</div>
				<p class="text-muted-foreground mt-1 font-mono text-[0.78125rem] leading-[1.5]">
					{#if hypotheticalMode && hypotheticalDelta !== undefined}
						what-if · {hypotheticalDelta === 0
							? '±'
							: hypotheticalDelta > 0
								? '+'
								: ''}{hypotheticalDelta.toFixed(2)}% vs actual
					{:else}
						{realAssignments.filter((assignment) => assignment.pointsEarned !== undefined).length}
						graded of {realAssignments.length}
					{/if}
				</p>
			</div>
		</header>

		<section
			class="border-border/80 bg-card mb-4 overflow-hidden rounded-[0.75rem] border shadow-[0_1px_2px_rgba(15,28,46,0.06),0_8px_24px_rgba(11,125,194,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)]"
		>
			<button
				type="button"
				onclick={toggleTargetGradeCalculator}
				aria-expanded={showTargetGradeCalculator}
				style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif; line-height: normal;"
				class="hover:bg-accent/30 flex h-[3.3125rem] w-full items-center justify-between px-5 text-left text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
			>
				<span>Finals Planner</span><span class="text-muted-foreground flex items-center text-xs"
					><span class="hidden sm:inline">what do I need on the final?</span><span
						class="ml-2 transition-transform {showTargetGradeCalculator ? 'rotate-180' : ''}"
						>⌄</span
					></span
				>
			</button>

			{#if showTargetGradeCalculator}
				<div transition:fade={{ duration: 160 }}>
					<TargetGradeCalculator
						initialGradePercentage={roundedGradePercentage}
						assignments={reactiveAssignments}
						{gradeCategoryWeightProportions}
					/>
				</div>
			{/if}
		</section>

		{#if !rawGradeCalcMatches}
			<div class="my-3 flex justify-center" in:fade>
				<CalculationError
					{hypotheticalMode}
					officialPercentage={synergyGradePercentage}
					estimatedPercentage={hypotheticalMode ? hypotheticalGrade : calculatedGrade}
					hiddenAssignmentCount={hiddenAssignments.length}
				/>
			</div>
		{/if}

		<section
			aria-label="Grade trend"
			class="border-border/80 bg-card overflow-hidden rounded-[0.75rem] border shadow-[0_1px_2px_rgba(15,28,46,0.06),0_8px_24px_rgba(11,125,194,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)]"
		>
			{@render chart()}
		</section>

		{#snippet chart()}
			<GradeChart
				assignments={hypotheticalMode ? reactiveAssignments : realAssignments}
				{gradeCategories}
				animate={!hypotheticalMode}
				error={!rawGradeCalcMatches}
				officialGrade={hypotheticalMode ? undefined : synergyGradePercentage}
			/>
		{/snippet}

		<div class="my-[0.875rem] flex flex-wrap items-center gap-x-5 gap-y-3">
			<div class="flex items-center gap-2">
				<Checkbox
					bind:checked={hypotheticalMode}
					id="hypothetical-mode"
					title="Hypothetical mode allows you to see what your grade would be if you got a certain score on an assignment."
				/>
				<Label for="hypothetical-mode">Hypothetical mode</Label>
			</div>

			{#if hypotheticalMode}
				<Button
					variant="outline"
					size="sm"
					class="h-[1.9375rem] px-3 text-[0.78125rem] font-semibold"
					onclick={initReactiveAssignments}
					>Reset changes
				</Button>
			{/if}

			{#if categories && gradeCategories && !hypotheticalMode}
				<div class="flex items-center gap-2">
					<Checkbox bind:checked={showCategoryTable} id="show-category-breakdown" />
					<Label for="show-category-breakdown"
						><span class="sm:hidden">Categories</span><span class="hidden sm:inline"
							>Show category breakdown</span
						></Label
					>
				</div>
			{/if}
		</div>

		{#if categories && gradeCategories && showCategoryTable && !hypotheticalMode}
			<div class="m-4 flex justify-center" transition:fade={{ duration: 200 }}>
				<GradeCategoryTable {gradeCategories} {hypotheticalMode} {pointsByCategory} />
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
					{addHypotheticalAssignment}
					{removeHypotheticalAssignment}
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

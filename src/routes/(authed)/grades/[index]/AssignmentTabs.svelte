<script lang="ts">
	import { bgColorVariants, type BadgeColor } from '$lib/components/ui/badge/colors';
	import * as Tabs from '$lib/components/ui/tabs';
	import type {
		AdjustmentAssignment,
		Category,
		Flowed,
		ReactiveAssignment,
		RealAssignment
	} from '$lib/grades/assignments';
	import { getAssignmentCalculationIssue } from '$lib/grades/calculation-coverage';
	import AssignmentCard from './AssignmentCard.svelte';

	interface Props {
		hypotheticalMode: boolean;
		assignments: (RealAssignment | Flowed<RealAssignment> | AdjustmentAssignment)[];
		reactiveAssignments: ReactiveAssignment[];
		gradeCategories: Category[] | undefined;
		assignmentCategoryNames: Set<string>;
		assignmentCategoryColors: Map<string, BadgeColor>;
		rawGradeCalcMatches: boolean;
		showAllAssignmentsRevision: number;
		addHypotheticalAssignment: (
			category: string | undefined,
			pointsEarned: number,
			pointsPossible: number
		) => void;
		removeHypotheticalAssignment: (id: string) => void;
		recalculateGradePercentage: () => void;
		seenAssignmentIDs?: Set<string>;
	}
	let {
		hypotheticalMode,
		assignments,
		reactiveAssignments,
		gradeCategories,
		assignmentCategoryNames,
		assignmentCategoryColors,
		rawGradeCalcMatches,
		showAllAssignmentsRevision,
		addHypotheticalAssignment,
		removeHypotheticalAssignment,
		recalculateGradePercentage,
		seenAssignmentIDs
	}: Props = $props();

	const categoryDropdownOptions = $derived(
		gradeCategories
			? new Set(
					gradeCategories
						.filter(
							(category) =>
								Number.isFinite(category.weightPercentage) && category.weightPercentage >= 0
						)
						.map((category) => category.name)
				)
			: undefined
	);
	const originalAssignmentsById = $derived(
		new Map(assignments.map((assignment) => [assignment.id, assignment]))
	);

	function untouchedOriginal(assignment: ReactiveAssignment) {
		const original = originalAssignmentsById.get(assignment.id);
		return original &&
			!assignment.newHypothetical &&
			assignment.pointsEarned === original.pointsEarned &&
			assignment.pointsPossible === original.pointsPossible &&
			assignment.extraCredit === original.extraCredit
			? original
			: undefined;
	}

	function untouchedPercentage(assignment: ReactiveAssignment) {
		return untouchedOriginal(assignment)?.officialPercentage;
	}

	function untouchedRawPoints(assignment: ReactiveAssignment) {
		return untouchedOriginal(assignment)?.unscaledPoints;
	}

	function persistentCalculationUnavailable(assignment: ReactiveAssignment) {
		return (
			assignment.calculationUnavailable ||
			originalAssignmentsById.get(assignment.id)?.calculationUnavailable
		);
	}

	function calculationIssue(assignment: ReactiveAssignment) {
		const original = originalAssignmentsById.get(assignment.id);
		// A temporary blank input must not lock a row whose scale was established.
		const basis = original ?? {
			...assignment,
			pointsEarned: undefined,
			unscaledPoints: undefined,
			officialPercentage: undefined
		};
		return getAssignmentCalculationIssue(
			{
				...basis,
				category: assignment.category,
				calculationUnavailable: persistentCalculationUnavailable(assignment)
			},
			gradeCategories
		);
	}

	function pointsScaleUnavailable(assignment: ReactiveAssignment) {
		if (assignment.newHypothetical) return false;
		const original = originalAssignmentsById.get(assignment.id) ?? assignment;
		return (
			persistentCalculationUnavailable(assignment) ||
			original.pointsPossible === undefined ||
			!Number.isFinite(original.pointsPossible) ||
			original.pointsPossible < 0 ||
			(original.pointsPossible === 0 && !original.extraCredit)
		);
	}

	function zeroWeightCategory(category: string | undefined) {
		return gradeCategories?.some(
			(gradeCategory) => gradeCategory.name === category && gradeCategory.weightPercentage === 0
		);
	}

	let activeTab = $state('all');
	let draftCategory = $state<string | undefined>(undefined);
	let draftPointsEarned = $state<number | undefined>(undefined);
	let draftPointsPossible = $state<number | undefined>(undefined);

	$effect(() => {
		if (
			categoryDropdownOptions?.size &&
			(draftCategory === undefined || !categoryDropdownOptions.has(draftCategory))
		) {
			draftCategory = categoryDropdownOptions.values().next().value;
		}
	});

	function submitHypotheticalAssignment(event: SubmitEvent) {
		event.preventDefault();
		if (
			draftPointsEarned === undefined ||
			draftPointsPossible === undefined ||
			!Number.isFinite(draftPointsEarned) ||
			!Number.isFinite(draftPointsPossible) ||
			draftPointsEarned < 0 ||
			draftPointsPossible <= 0 ||
			(gradeCategories !== undefined && !categoryDropdownOptions?.has(draftCategory ?? ''))
		)
			return;

		addHypotheticalAssignment(draftCategory, draftPointsEarned, draftPointsPossible);
		draftPointsEarned = undefined;
		draftPointsPossible = undefined;
	}
	$effect(() => {
		void showAllAssignmentsRevision;
		activeTab = 'all';
	});
</script>

<section class="mt-4">
	<Tabs.Root bind:value={activeTab} class="gap-0">
		<Tabs.List
			class="border-border/80 bg-secondary mb-4 h-[4.625rem] min-h-[2.5625rem] max-w-full flex-wrap justify-start gap-1 overflow-visible rounded-md border p-[0.3125rem] sm:h-[2.5625rem] sm:flex-nowrap sm:overflow-x-auto"
		>
			<Tabs.Trigger value="all" class="h-[1.8125rem] flex-none rounded-sm border-0 px-[0.640625rem]"
				>All</Tabs.Trigger
			>

			{#each assignmentCategoryNames as categoryName (categoryName)}
				<Tabs.Trigger
					value={categoryName}
					class="h-[1.8125rem] flex-none rounded-sm border-0 px-[0.640625rem]"
				>
					{#if assignmentCategoryColors.has(categoryName)}
						<div
							class={[
								bgColorVariants[assignmentCategoryColors.get(categoryName)!],
								'h-2 w-2 rounded-full'
							]}
						></div>
					{/if}
					{categoryName}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>

		{#if hypotheticalMode}
			<form
				aria-label="Add what-if assignment"
				class="border-border/80 bg-card mt-[0.875rem] mb-[0.875rem] flex flex-wrap items-center gap-2 rounded-lg border px-5 py-[0.875rem] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)]"
				onsubmit={submitHypotheticalAssignment}
			>
				{#if categoryDropdownOptions?.size}
					<select
						aria-label="Category for the what-if assignment"
						class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-[2.375rem] w-full flex-none rounded-sm border px-3 text-[0.8125rem] outline-none focus-visible:ring-[3px] sm:min-w-[10rem] sm:flex-1"
						bind:value={draftCategory}
					>
						{#each categoryDropdownOptions as category (category)}
							<option value={category}>{category}</option>
						{/each}
					</select>
				{/if}

				<input
					aria-label="What-if score"
					class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-[2.1875rem] w-16 rounded-sm border px-3 font-mono text-[0.8125rem] outline-none focus-visible:ring-[3px]"
					type="number"
					inputmode="decimal"
					min="0"
					step="any"
					placeholder="Score"
					required
					bind:value={draftPointsEarned}
				/>
				<span class="text-muted-foreground">/</span>
				<input
					aria-label="What-if points possible"
					class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-[2.1875rem] w-16 rounded-sm border px-3 font-mono text-[0.8125rem] outline-none focus-visible:ring-[3px]"
					type="number"
					inputmode="decimal"
					min="0.01"
					step="any"
					placeholder="Out of"
					required
					bind:value={draftPointsPossible}
				/>
				<button
					type="submit"
					class="bg-primary text-primary-foreground focus-visible:ring-ring/50 inline-flex h-[1.9375rem] items-center justify-center rounded-sm px-3 text-[0.78125rem] font-semibold outline-none hover:brightness-95 focus-visible:ring-[3px]"
					>Add</button
				>
			</form>
		{/if}

		<Tabs.Content value="all">
			<ol class="flex flex-col items-center gap-[0.625rem]">
				{#if hypotheticalMode}
					{#each reactiveAssignments as { id, gradePercentageChange, newHypothetical, date, comments, category, hidden }, i (id)}
						{#if !hidden && reactiveAssignments[i]}
							<li class="w-full">
								{#if gradeCategories && categoryDropdownOptions}
									<AssignmentCard
										bind:name={reactiveAssignments[i].name}
										{id}
										bind:pointsEarned={reactiveAssignments[i].pointsEarned}
										bind:pointsPossible={reactiveAssignments[i].pointsPossible}
										officialPercentage={untouchedPercentage(reactiveAssignments[i])}
										calculationUnavailable={persistentCalculationUnavailable(
											reactiveAssignments[i]
										)}
										calculationIssue={calculationIssue(reactiveAssignments[i])}
										pointsScaleUnavailable={pointsScaleUnavailable(reactiveAssignments[i])}
										zeroWeightCategory={zeroWeightCategory(reactiveAssignments[i].category)}
										unscaledPoints={untouchedRawPoints(reactiveAssignments[i])}
										bind:extraCredit={reactiveAssignments[i].extraCredit}
										gradePercentageChange={rawGradeCalcMatches ? gradePercentageChange : undefined}
										bind:notForGrade={reactiveAssignments[i].notForGrade}
										showHypotheticalLabel={newHypothetical}
										bind:categoryDropdownSelected={reactiveAssignments[i].category}
										categoryDropdown={{
											names: categoryDropdownOptions,
											colors: assignmentCategoryColors
										}}
										date={newHypothetical ? undefined : date}
										{comments}
										editable={true}
										onRemove={newHypothetical ? () => removeHypotheticalAssignment(id) : undefined}
										{recalculateGradePercentage}
									/>
								{:else}
									<AssignmentCard
										bind:name={reactiveAssignments[i].name}
										{id}
										bind:pointsEarned={reactiveAssignments[i].pointsEarned}
										bind:pointsPossible={reactiveAssignments[i].pointsPossible}
										officialPercentage={untouchedPercentage(reactiveAssignments[i])}
										calculationUnavailable={persistentCalculationUnavailable(
											reactiveAssignments[i]
										)}
										calculationIssue={calculationIssue(reactiveAssignments[i])}
										pointsScaleUnavailable={pointsScaleUnavailable(reactiveAssignments[i])}
										zeroWeightCategory={zeroWeightCategory(reactiveAssignments[i].category)}
										unscaledPoints={untouchedRawPoints(reactiveAssignments[i])}
										bind:extraCredit={reactiveAssignments[i].extraCredit}
										gradePercentageChange={rawGradeCalcMatches ? gradePercentageChange : undefined}
										bind:notForGrade={reactiveAssignments[i].notForGrade}
										showHypotheticalLabel={newHypothetical}
										categoryBadge={category !== undefined
											? {
													name: category,
													color: assignmentCategoryColors.get(category) ?? 'default'
												}
											: undefined}
										date={newHypothetical ? undefined : date}
										{comments}
										editable={true}
										onRemove={newHypothetical ? () => removeHypotheticalAssignment(id) : undefined}
										{recalculateGradePercentage}
									/>
								{/if}
							</li>
						{/if}
					{/each}
				{:else}
					{#each assignments as assignment (assignment.id)}
						{#if !assignment.hidden}
							{@render assignmentSnippet(assignment, true)}
						{/if}
					{/each}
				{/if}
			</ol>
		</Tabs.Content>

		{#each assignmentCategoryNames as categoryName (categoryName)}
			<Tabs.Content value={categoryName}>
				<ol class="flex flex-col items-center gap-[0.625rem]">
					{#if hypotheticalMode}
						{#each reactiveAssignments as { category, id, gradePercentageChange, newHypothetical, date, comments, hidden }, i (id)}
							{#if category === categoryName && !hidden && reactiveAssignments[i]}
								<li class="w-full">
									{#if gradeCategories && categoryDropdownOptions && reactiveAssignments[i].category !== undefined}
										<AssignmentCard
											bind:name={reactiveAssignments[i].name}
											{id}
											bind:pointsEarned={reactiveAssignments[i].pointsEarned}
											bind:pointsPossible={reactiveAssignments[i].pointsPossible}
											officialPercentage={untouchedPercentage(reactiveAssignments[i])}
											calculationUnavailable={persistentCalculationUnavailable(
												reactiveAssignments[i]
											)}
											calculationIssue={calculationIssue(reactiveAssignments[i])}
											pointsScaleUnavailable={pointsScaleUnavailable(reactiveAssignments[i])}
											zeroWeightCategory={zeroWeightCategory(reactiveAssignments[i].category)}
											unscaledPoints={untouchedRawPoints(reactiveAssignments[i])}
											bind:extraCredit={reactiveAssignments[i].extraCredit}
											gradePercentageChange={rawGradeCalcMatches
												? gradePercentageChange
												: undefined}
											bind:notForGrade={reactiveAssignments[i].notForGrade}
											showHypotheticalLabel={newHypothetical}
											bind:categoryDropdownSelected={reactiveAssignments[i].category}
											categoryDropdown={{
												names: categoryDropdownOptions,
												colors: assignmentCategoryColors
											}}
											date={newHypothetical ? undefined : date}
											{comments}
											editable={true}
											onRemove={newHypothetical
												? () => removeHypotheticalAssignment(id)
												: undefined}
											{recalculateGradePercentage}
										/>
									{:else}
										<AssignmentCard
											bind:name={reactiveAssignments[i].name}
											{id}
											bind:pointsEarned={reactiveAssignments[i].pointsEarned}
											bind:pointsPossible={reactiveAssignments[i].pointsPossible}
											officialPercentage={untouchedPercentage(reactiveAssignments[i])}
											calculationUnavailable={persistentCalculationUnavailable(
												reactiveAssignments[i]
											)}
											calculationIssue={calculationIssue(reactiveAssignments[i])}
											pointsScaleUnavailable={pointsScaleUnavailable(reactiveAssignments[i])}
											zeroWeightCategory={zeroWeightCategory(reactiveAssignments[i].category)}
											unscaledPoints={untouchedRawPoints(reactiveAssignments[i])}
											bind:extraCredit={reactiveAssignments[i].extraCredit}
											gradePercentageChange={rawGradeCalcMatches
												? gradePercentageChange
												: undefined}
											bind:notForGrade={reactiveAssignments[i].notForGrade}
											showHypotheticalLabel={newHypothetical}
											date={newHypothetical ? undefined : date}
											{comments}
											editable={true}
											onRemove={newHypothetical
												? () => removeHypotheticalAssignment(id)
												: undefined}
											{recalculateGradePercentage}
										/>
									{/if}
								</li>
							{/if}
						{/each}
					{:else}
						{#each assignments as assignment (assignment.id)}
							{#if !assignment.hidden && assignment.category === categoryName}
								{@render assignmentSnippet(assignment, false)}
							{/if}
						{/each}
					{/if}
				</ol>
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</section>

{#snippet assignmentSnippet(
	assignment: RealAssignment | Flowed<RealAssignment>,
	showCategory = true
)}
	{@const {
		name,
		id,
		pointsEarned,
		pointsPossible,
		unscaledPoints,
		officialPercentage,
		calculationUnavailable,
		extraCredit,
		gradePercentageChange,
		notForGrade,
		category,
		date,
		newHypothetical,
		description,
		comments
	} = assignment}
	<li class="w-full">
		<AssignmentCard
			{name}
			{id}
			{description}
			{pointsEarned}
			{pointsPossible}
			{unscaledPoints}
			{officialPercentage}
			{calculationUnavailable}
			calculationIssue={getAssignmentCalculationIssue(assignment, gradeCategories)}
			zeroWeightCategory={zeroWeightCategory(category)}
			{extraCredit}
			gradePercentageChange={rawGradeCalcMatches ? gradePercentageChange : undefined}
			{notForGrade}
			showHypotheticalLabel={newHypothetical}
			categoryBadge={showCategory
				? { name: category, color: assignmentCategoryColors.get(category) ?? 'default' }
				: undefined}
			{date}
			{comments}
			unseen={seenAssignmentIDs && !seenAssignmentIDs.has(id) && !notForGrade}
		/>
	</li>
{/snippet}

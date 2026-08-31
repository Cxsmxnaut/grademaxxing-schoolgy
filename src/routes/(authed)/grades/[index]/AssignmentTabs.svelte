<script lang="ts">
	import { bgColorVariants, type BadgeColor } from '$lib';
	import * as Tabs from '$lib/components/ui/tabs';
	import type {
		Category,
		Flowed,
		HiddenAssignment,
		ReactiveAssignment,
		RealAssignment
	} from '$lib/grades/assignments';
	import AssignmentCard from './AssignmentCard.svelte';

	interface Props {
		hypotheticalMode: boolean;
		assignments: (RealAssignment | Flowed<RealAssignment | HiddenAssignment>)[];
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
		gradeCategories ? new Set(gradeCategories.map((category) => category.name)) : undefined
	);

	let activeTab = $state('all');
	let draftCategory = $state<string | undefined>(undefined);
	let draftPointsEarned = $state<number | undefined>(undefined);
	let draftPointsPossible = $state<number | undefined>(undefined);

	$effect(() => {
		if (draftCategory === undefined && categoryDropdownOptions?.size) {
			draftCategory = categoryDropdownOptions.values().next().value;
		}
	});

	function submitHypotheticalAssignment(event: SubmitEvent) {
		event.preventDefault();
		if (
			draftPointsEarned === undefined ||
			draftPointsPossible === undefined ||
			draftPointsEarned < 0 ||
			draftPointsPossible <= 0
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
			class="border-border/80 bg-secondary mb-4 h-[4.625rem] min-h-[2.5625rem] max-w-full flex-wrap justify-start gap-1 overflow-visible rounded-[0.625rem] border p-[0.3125rem] sm:h-[2.5625rem] sm:flex-nowrap sm:overflow-x-auto"
		>
			<Tabs.Trigger
				value="all"
				class="h-[1.8125rem] flex-none rounded-[0.4375rem] border-0 px-[0.640625rem]"
				>All</Tabs.Trigger
			>

			{#each assignmentCategoryNames as categoryName (categoryName)}
				<Tabs.Trigger
					value={categoryName}
					class="h-[1.8125rem] flex-none rounded-[0.4375rem] border-0 px-[0.640625rem]"
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
				class="border-border/80 bg-card mt-[0.875rem] mb-[0.875rem] flex flex-wrap items-center gap-2 rounded-[0.75rem] border px-5 py-[0.875rem] shadow-[0_1px_2px_rgba(15,28,46,0.06),0_8px_24px_rgba(11,125,194,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)]"
				onsubmit={submitHypotheticalAssignment}
			>
				{#if categoryDropdownOptions?.size}
					<select
						aria-label="Category for the what-if assignment"
						class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-[2.375rem] w-full flex-none rounded-[0.5rem] border px-3 text-[0.8125rem] outline-none focus-visible:ring-[3px] sm:min-w-[10rem] sm:flex-1"
						bind:value={draftCategory}
					>
						{#each categoryDropdownOptions as category (category)}
							<option value={category}>{category}</option>
						{/each}
					</select>
				{/if}

				<input
					aria-label="What-if score"
					class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-[2.1875rem] w-16 rounded-[0.4375rem] border px-3 font-mono text-[0.8125rem] outline-none focus-visible:ring-[3px]"
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
					class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-[2.1875rem] w-16 rounded-[0.4375rem] border px-3 font-mono text-[0.8125rem] outline-none focus-visible:ring-[3px]"
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
					class="bg-primary text-primary-foreground focus-visible:ring-ring/50 inline-flex h-[1.9375rem] items-center justify-center rounded-[0.4375rem] px-3 text-[0.78125rem] font-semibold outline-none hover:brightness-95 focus-visible:ring-[3px]"
					>Add</button
				>
			</form>
		{/if}

		<Tabs.Content value="all">
			<ol class="flex flex-col items-center gap-[0.625rem]">
				{#if hypotheticalMode}
					{#each reactiveAssignments as { id, gradePercentageChange, hidden, newHypothetical, date, comments, category }, i (id)}
						{#if reactiveAssignments[i]}
							<li class="w-full">
								{#if gradeCategories && categoryDropdownOptions}
									<AssignmentCard
										bind:name={reactiveAssignments[i].name}
										{id}
										bind:pointsEarned={reactiveAssignments[i].pointsEarned}
										bind:pointsPossible={reactiveAssignments[i].pointsPossible}
										bind:extraCredit={reactiveAssignments[i].extraCredit}
										gradePercentageChange={rawGradeCalcMatches ? gradePercentageChange : undefined}
										bind:notForGrade={reactiveAssignments[i].notForGrade}
										{hidden}
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
										bind:extraCredit={reactiveAssignments[i].extraCredit}
										gradePercentageChange={rawGradeCalcMatches ? gradePercentageChange : undefined}
										bind:notForGrade={reactiveAssignments[i].notForGrade}
										{hidden}
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
						{@render assignmentSnippet(assignment, true)}
					{/each}
				{/if}
			</ol>
		</Tabs.Content>

		{#each assignmentCategoryNames as categoryName (categoryName)}
			<Tabs.Content value={categoryName}>
				<ol class="flex flex-col items-center gap-[0.625rem]">
					{#if hypotheticalMode}
						{#each reactiveAssignments as { category, id, gradePercentageChange, hidden, newHypothetical, date, comments }, i (id)}
							{#if category === categoryName && reactiveAssignments[i]}
								<li class="w-full">
									{#if gradeCategories && categoryDropdownOptions && reactiveAssignments[i].category !== undefined}
										<AssignmentCard
											bind:name={reactiveAssignments[i].name}
											{id}
											bind:pointsEarned={reactiveAssignments[i].pointsEarned}
											bind:pointsPossible={reactiveAssignments[i].pointsPossible}
											bind:extraCredit={reactiveAssignments[i].extraCredit}
											gradePercentageChange={rawGradeCalcMatches
												? gradePercentageChange
												: undefined}
											bind:notForGrade={reactiveAssignments[i].notForGrade}
											{hidden}
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
											bind:extraCredit={reactiveAssignments[i].extraCredit}
											gradePercentageChange={rawGradeCalcMatches
												? gradePercentageChange
												: undefined}
											bind:notForGrade={reactiveAssignments[i].notForGrade}
											{hidden}
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
							{#if assignment.category === categoryName}
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
	{
		name,
		id,
		pointsEarned,
		pointsPossible,
		unscaledPoints,
		extraCredit,
		gradePercentageChange,
		notForGrade,
		hidden,
		category,
		date,
		newHypothetical,
		description,
		comments
	}: RealAssignment | Flowed<RealAssignment | HiddenAssignment>,
	showCategory = true
)}
	<li class="w-full">
		<AssignmentCard
			{name}
			{id}
			{description}
			{pointsEarned}
			{pointsPossible}
			{unscaledPoints}
			{extraCredit}
			gradePercentageChange={rawGradeCalcMatches ? gradePercentageChange : undefined}
			{notForGrade}
			{hidden}
			showHypotheticalLabel={newHypothetical}
			categoryBadge={showCategory
				? { name: category, color: assignmentCategoryColors.get(category) ?? 'default' }
				: undefined}
			{date}
			{comments}
			unseen={seenAssignmentIDs && !seenAssignmentIDs.has(id) && !hidden}
		/>
	</li>
{/snippet}

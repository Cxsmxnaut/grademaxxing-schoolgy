<script lang="ts">
	import {
		calculatePointsNeededForTargetGrade,
		getCalculableAssignments,
		getCalculableAssignmentsWithCategories,
		type ReactiveAssignment
	} from '$lib/grades/assignments';

	interface Props {
		initialGradePercentage?: number;
		assignments: ReactiveAssignment[];
		gradeCategoryWeightProportions?: Map<string, number>;
	}

	const { assignments, initialGradePercentage, gradeCategoryWeightProportions }: Props = $props();

	const gradeTargets = [
		{ label: 'A', value: 93 },
		{ label: 'A-', value: 90 },
		{ label: 'B+', value: 87 },
		{ label: 'B', value: 83 },
		{ label: 'B-', value: 80 },
		{ label: 'C+', value: 77 },
		{ label: 'C', value: 73 },
		{ label: 'C-', value: 70 },
		{ label: 'D', value: 60 }
	] as const;

	let targetGradePercentage = $state(93);
	let finalPointsPossible = $state(100);
	let selectedCategory = $state('');

	const categories = $derived(
		gradeCategoryWeightProportions ? [...gradeCategoryWeightProportions.keys()] : []
	);

	$effect(() => {
		if (!selectedCategory && categories.length) selectedCategory = categories[0] ?? '';
	});

	const requiredPoints = $derived.by(() => {
		if (!Number.isFinite(finalPointsPossible) || finalPointsPossible <= 0) return undefined;

		const value =
			gradeCategoryWeightProportions && selectedCategory
				? calculatePointsNeededForTargetGrade({
						targetGradePercentage,
						assignmentPointsPossible: finalPointsPossible,
						hasCategories: true,
						otherAssignments: getCalculableAssignmentsWithCategories(assignments),
						gradeCategoryWeightProportions,
						assignmentCategoryName: selectedCategory
					})
				: calculatePointsNeededForTargetGrade({
						targetGradePercentage,
						assignmentPointsPossible: finalPointsPossible,
						hasCategories: false,
						otherAssignments: getCalculableAssignments(assignments)
					});

		return Number.isFinite(value) ? value : undefined;
	});

	const requiredPercentage = $derived(
		requiredPoints === undefined ? undefined : (requiredPoints / finalPointsPossible) * 100
	);

	function format(value: number) {
		return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
	}
</script>

<div
	class="border-border/70 border-t px-[1.125rem] py-3.5"
	role="region"
	aria-label="Finals Planner"
>
	<div class="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
		<span class="text-muted-foreground">To get</span>
		<label>
			<span class="sr-only">Target grade</span>
			<select
				bind:value={targetGradePercentage}
				class="border-input bg-background h-[2.375rem] w-[3.75rem] rounded-[0.625rem] border px-2.5 font-semibold"
			>
				{#each gradeTargets as target (target.value)}
					<option value={target.value}>{target.label}</option>
				{/each}
			</select>
		</label>
		<span class="text-muted-foreground">with a final worth</span>
		<label>
			<span class="sr-only">Final points possible</span>
			<input
				type="number"
				min="1"
				step="1"
				bind:value={finalPointsPossible}
				class="border-input bg-background h-[2.375rem] w-20 rounded-[0.625rem] border px-2.5 font-mono"
			/>
		</label>
		<span class="text-muted-foreground">points{categories.length ? ' in' : ''}</span>
		{#if categories.length}
			<label>
				<span class="sr-only">Final category</span>
				<select
					bind:value={selectedCategory}
					class="border-input bg-background h-[2.375rem] min-w-[8rem] rounded-[0.625rem] border px-2.5 font-semibold"
				>
					{#each categories as category (category)}
						<option value={category}>{category}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	<p class="text-muted-foreground mt-3 text-sm">
		{#if requiredPoints !== undefined && requiredPercentage !== undefined}
			You need <strong class="text-grade-strong font-mono text-base"
				>{format(requiredPercentage)}%</strong
			>
			— that's
			<strong class="text-foreground font-mono"
				>{format(requiredPoints)} / {format(finalPointsPossible)}</strong
			>
			on the final.
		{:else if initialGradePercentage !== undefined}
			Choose valid final points to calculate what you need from your current
			{format(initialGradePercentage)}%.
		{:else}
			There is not enough graded work to calculate a final target yet.
		{/if}
	</p>
</div>

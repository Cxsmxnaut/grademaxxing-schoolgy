<script lang="ts">
	import {
		calculatePointsNeededForTargetGrade,
		getCalculableAssignments,
		getCalculableAssignmentsWithCategories,
		type ReactiveAssignment
	} from '$lib/grades/assignments';
	import { formatPercentage } from '$lib/grades/percentage-format';

	interface Props {
		initialGradePercentage?: number;
		assignments: ReactiveAssignment[];
		gradeCategoryWeightProportions?: Map<string, number>;
		officialGradeOffset?: number;
		calculationAvailable?: boolean;
		partialEstimate?: boolean;
	}

	const {
		assignments,
		initialGradePercentage,
		gradeCategoryWeightProportions,
		officialGradeOffset = 0,
		calculationAvailable = true,
		partialEstimate = false
	}: Props = $props();

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

	const supportedCategoryWeights = $derived(
		gradeCategoryWeightProportions
			? new Map(
					[...gradeCategoryWeightProportions].filter(
						([, weight]) => Number.isFinite(weight) && weight > 0
					)
				)
			: undefined
	);
	const categories = $derived(supportedCategoryWeights ? [...supportedCategoryWeights.keys()] : []);

	$effect(() => {
		if (!categories.includes(selectedCategory)) selectedCategory = categories[0] ?? '';
	});

	const requiredPoints = $derived.by(() => {
		if (
			!calculationAvailable ||
			!Number.isFinite(officialGradeOffset) ||
			!Number.isFinite(finalPointsPossible) ||
			finalPointsPossible <= 0 ||
			(supportedCategoryWeights !== undefined && !selectedCategory)
		)
			return undefined;
		const localTargetPercentage = targetGradePercentage - officialGradeOffset;

		const value =
			supportedCategoryWeights && selectedCategory
				? calculatePointsNeededForTargetGrade({
						targetGradePercentage: localTargetPercentage,
						assignmentPointsPossible: finalPointsPossible,
						hasCategories: true,
						otherAssignments: getCalculableAssignmentsWithCategories(assignments),
						gradeCategoryWeightProportions: supportedCategoryWeights,
						assignmentCategoryName: selectedCategory
					})
				: calculatePointsNeededForTargetGrade({
						targetGradePercentage: localTargetPercentage,
						assignmentPointsPossible: finalPointsPossible,
						hasCategories: false,
						otherAssignments: getCalculableAssignments(assignments)
					});

		return Number.isFinite(value) ? value : undefined;
	});

	const requiredPercentage = $derived.by(() => {
		if (requiredPoints === undefined) return undefined;
		const value = (requiredPoints / finalPointsPossible) * 100;
		return Number.isFinite(value) ? value : undefined;
	});

	function format(value: number) {
		return formatPercentage(value);
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
				class="border-input bg-background h-[2.375rem] w-[3.75rem] rounded-md border px-2.5 font-semibold"
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
				class="border-input bg-background h-[2.375rem] w-20 rounded-md border px-2.5 font-mono"
			/>
		</label>
		<span class="text-muted-foreground">points{categories.length ? ' in' : ''}</span>
		{#if categories.length}
			<label>
				<span class="sr-only">Final category</span>
				<select
					bind:value={selectedCategory}
					class="border-input bg-background h-[2.375rem] min-w-[8rem] rounded-md border px-2.5 font-semibold"
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
			{partialEstimate ? 'Estimated score:' : 'You need'}
			<strong class="text-grade-strong font-mono text-base"
				>{formatPercentage(requiredPercentage)}%</strong
			>
			— that's
			<strong class="text-foreground font-mono"
				>{format(requiredPoints)} / {format(finalPointsPossible)}</strong
			>
			on the final.
			{#if partialEstimate}
				Some grading information is unavailable, so the actual requirement may differ.
			{/if}
		{:else if !calculationAvailable}
			Complete the assignment points to update this estimate.
		{:else if initialGradePercentage !== undefined}
			Choose valid final points to calculate what you need from your current
			{formatPercentage(initialGradePercentage)}%.
		{:else}
			There is not enough graded work to calculate a final target yet.
		{/if}
	</p>
</div>

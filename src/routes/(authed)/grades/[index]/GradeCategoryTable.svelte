<script lang="ts">
	import { bgColorVariants, type BadgeColor } from '$lib/components/ui/badge/colors';
	import * as Table from '$lib/components/ui/table';
	import { calculateGradePercentage, type Category } from '$lib/grades/assignments';
	import { formatPercentage } from '$lib/grades/percentage-format';

	interface Props {
		gradeCategories: Category[];
		hypotheticalMode: boolean;
		pointsByCategory: Map<string, { pointsEarned: number; pointsPossible: number }>;
		assignmentCategoryColors: Map<string, BadgeColor>;
	}
	let { gradeCategories, hypotheticalMode, pointsByCategory, assignmentCategoryColors }: Props =
		$props();

	const categoryGradePercentages = $derived(
		new Map(
			pointsByCategory
				.entries()
				.map(([categoryName, { pointsEarned, pointsPossible }]) => [
					categoryName,
					calculateGradePercentage(pointsEarned, pointsPossible)
				])
		)
	);

	const countableCategoryWeightProportions = $derived(
		new Map(
			gradeCategories.flatMap(({ name, weightPercentage }) => {
				const points = pointsByCategory.get(name);
				if (!points || points.pointsPossible === 0) return [];

				return [[name, weightPercentage / 100] as const];
			})
		)
	);

	const totalCountedWeightProportion = $derived(
		countableCategoryWeightProportions
			.values()
			.reduce((sum, weightProportion) => sum + weightProportion, 0)
	);
	const showEffectiveWeight = $derived(totalCountedWeightProportion !== 1);

	function gradeTone(percentage: number) {
		if (!Number.isFinite(percentage)) return 'text-muted-foreground';
		if (percentage > 100) return 'text-grade-extra';
		if (percentage >= 90) return 'text-grade-strong';
		if (percentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	}
</script>

<section class="category-breakdown" aria-labelledby="category-breakdown-title">
	<header class="breakdown-heading">
		<h2 id="category-breakdown-title" class="font-heading text-base font-semibold">Categories</h2>
		{#if showEffectiveWeight}
			<p class="text-muted-foreground text-xs leading-relaxed">
				Effective weights exclude categories with no graded points.
			</p>
		{/if}
	</header>

	<Table.Root
		class={showEffectiveWeight ? 'has-effective-weight' : ''}
		aria-label="Category breakdown"
	>
		<thead>
			<tr>
				<th scope="col" class="category-name">Category</th>
				<th scope="col">Weight</th>
				{#if showEffectiveWeight}<th scope="col">Effective weight</th>{/if}
				<th scope="col">Points</th>
				<th scope="col">Grade</th>
			</tr>
		</thead>
		<tbody>
			{#each gradeCategories as { name, pointsEarned, pointsPossible, gradeLetter, weightPercentage } (name)}
				{@const percentage = hypotheticalMode
					? categoryGradePercentages.get(name)
					: pointsPossible > 0
						? calculateGradePercentage(pointsEarned, pointsPossible)
						: undefined}
				<tr>
					<th scope="row" class="category-name text-foreground font-medium">
						<span class="category-label">
							<span
								class="size-2 shrink-0 rounded-full {bgColorVariants[
									assignmentCategoryColors.get(name) ?? 'default'
								]}"
								aria-hidden="true"
							></span>
							<span>{name}</span>
						</span>
					</th>
					<td class="category-weight">
						<span class="metric-label" aria-hidden="true">Weight</span>
						<span class="font-mono">{formatPercentage(weightPercentage)}%</span>
					</td>
					{#if showEffectiveWeight}
						<td class="category-effective">
							<span class="metric-label" aria-hidden="true">Effective weight</span>
							<span class="font-mono">
								{#if countableCategoryWeightProportions.has(name) && totalCountedWeightProportion > 0}
									{formatPercentage(weightPercentage / totalCountedWeightProportion)}%
								{:else}<span class="text-muted-foreground">—</span>{/if}
							</span>
						</td>
					{/if}
					<td class="category-points">
						<span class="metric-label" aria-hidden="true">Points</span>
						{#if hypotheticalMode}
							{#if pointsByCategory.has(name)}
								<span class="font-mono"
									>{pointsByCategory.get(name)?.pointsEarned}
									<span class="text-muted-foreground">/</span>
									{pointsByCategory.get(name)?.pointsPossible}</span
								>
							{:else}<span class="text-muted-foreground">—</span>{/if}
						{:else if pointsEarned === 0 && pointsPossible === 0}
							<span class="text-muted-foreground text-xs leading-relaxed">
								{weightPercentage === 0 ? 'Not included in grade totals' : 'No graded points yet'}
							</span>
						{:else}
							<span class="font-mono"
								>{pointsEarned} <span class="text-muted-foreground">/</span>
								{pointsPossible}</span
							>
						{/if}
					</td>
					<td class="category-grade">
						{#if percentage !== undefined && Number.isFinite(percentage)}
							<div class="grade-value {gradeTone(percentage)}">
								{#if !hypotheticalMode && gradeLetter}
									<span class="font-heading text-sm font-semibold">{gradeLetter}</span>
								{/if}
								<span class="font-mono text-sm font-semibold">{formatPercentage(percentage)}%</span>
							</div>
						{:else if !hypotheticalMode && pointsEarned !== 0 && pointsPossible === 0}
							<span class="text-muted-foreground text-xs">No graded denominator yet</span>
						{:else}
							<span class="text-muted-foreground text-xs">Not graded</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</Table.Root>
</section>

<style>
	/* Hallmark · component: category breakdown · existing Grademaxxing tokens
	 * Pre-emit critique: P5 H4 E5 S5 R5 V4 */
	.category-breakdown {
		container-type: inline-size;
		width: 100%;
		min-width: 0;
		overflow: clip;
		border: 1px solid var(--border);
		border-radius: var(--corner-lg);
		background: var(--card);
	}

	.breakdown-heading {
		display: grid;
		gap: var(--space-2xs);
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border);
	}

	.category-breakdown :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}

	thead th {
		padding: var(--space-sm) var(--space-md);
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-align: right;
	}

	tbody tr {
		border-top: 1px solid var(--border);
	}

	tbody th,
	td {
		padding: var(--space-md);
		text-align: right;
		vertical-align: middle;
	}

	.category-name {
		width: 38%;
		padding-left: var(--space-lg);
		text-align: left;
		overflow-wrap: anywhere;
	}

	.category-label {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		line-height: 1.5;
	}

	.category-grade {
		padding-right: var(--space-lg);
	}

	.grade-value {
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: var(--space-xs);
		white-space: nowrap;
	}

	.category-points :global(.font-mono) {
		white-space: nowrap;
	}

	.metric-label {
		display: none;
	}

	@container (max-width: 30rem) {
		.category-breakdown :global(table),
		tbody {
			display: block;
		}

		thead {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			grid-template-areas: 'name grade' 'weight points';
			gap: var(--space-sm) var(--space-md);
			padding: var(--space-md);
		}

		:global(.has-effective-weight) tbody tr {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			grid-template-areas: 'name name grade' 'weight effective points';
		}

		tbody th,
		td {
			min-width: 0;
			width: auto;
			padding: 0;
			text-align: left;
			overflow-wrap: anywhere;
		}

		.category-name {
			grid-area: name;
			align-self: center;
			width: auto;
			padding: 0;
		}

		.category-grade {
			grid-area: grade;
			align-self: center;
			padding: 0;
			text-align: right;
		}

		.category-weight {
			grid-area: weight;
		}

		.category-effective {
			grid-area: effective;
		}

		.category-points {
			grid-area: points;
		}

		.metric-label {
			display: block;
			margin-bottom: var(--space-2xs);
			color: var(--muted-foreground);
			font-size: 0.625rem;
			line-height: 1.5;
		}

		.grade-value {
			flex-direction: column;
			align-items: flex-end;
			gap: 0;
		}
	}
</style>

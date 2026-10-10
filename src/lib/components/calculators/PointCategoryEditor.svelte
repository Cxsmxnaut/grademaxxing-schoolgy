<script lang="ts">
	import { recordPublicEvent } from '$lib/analytics/public-client';
	import type { PointCategory } from '$lib/grades/public-calculators';
	import NumberField from './NumberField.svelte';
	let { categories = $bindable(), idPrefix }: { categories: PointCategory[]; idPrefix: string } =
		$props();
	let nextId = $state(3);
	function addCategory() {
		categories = [
			...categories,
			{ id: `category-${nextId++}`, name: 'New category', weight: 0, earned: 0, possible: 0 }
		];
		recordPublicEvent('tool_used');
	}
	function removeCategory(id: string) {
		categories = categories.filter((c) => c.id !== id);
		recordPublicEvent('tool_used');
	}
</script>

<fieldset>
	<legend>Current category totals</legend>
	{#each categories as category (category.id)}
		<div class="calc-row">
			<div class="calc-field">
				<label for={`${idPrefix}-${category.id}-name`}>Category name</label><input
					id={`${idPrefix}-${category.id}-name`}
					bind:value={category.name}
					maxlength="80"
				/>
			</div>
			<NumberField
				id={`${idPrefix}-${category.id}-weight`}
				label={`${category.name} weight (%)`}
				bind:value={category.weight}
				max={100}
			/>
			<NumberField
				id={`${idPrefix}-${category.id}-earned`}
				label={`${category.name} earned points`}
				bind:value={category.earned}
			/>
			<NumberField
				id={`${idPrefix}-${category.id}-possible`}
				label={`${category.name} possible points`}
				bind:value={category.possible}
				hint="Use 0 for a category with no graded denominator yet."
			/>
			<button
				type="button"
				disabled={categories.length === 1}
				onclick={() => removeCategory(category.id)}>Remove {category.name}</button
			>
		</div>
	{/each}
	<div class="calc-actions"><button type="button" onclick={addCategory}>Add category</button></div>
</fieldset>

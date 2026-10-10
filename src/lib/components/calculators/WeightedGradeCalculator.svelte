<script lang="ts">
	import { recordPublicEvent } from '$lib/analytics/public-client';
	import {
		calculateWeightedGrade,
		type WeightedGradeRow,
		type WeightMode
	} from '$lib/grades/public-calculators';
	import { formatPercentage } from '$lib/grades/percentage-format';
	import CalculatorFrame from './CalculatorFrame.svelte';
	import NumberField from './NumberField.svelte';
	let { idPrefix = 'weighted' }: { idPrefix?: string } = $props();
	let mode = $state<WeightMode>('require-100');
	let rows = $state<WeightedGradeRow[]>([
		{ id: 'tests', name: 'Tests', grade: 80, weight: 70, included: true },
		{ id: 'homework', name: 'Homework', grade: 100, weight: 30, included: true }
	]);
	let nextId = 3;
	const result = $derived(calculateWeightedGrade(rows, mode));
	function addCategory() {
		rows.push({
			id: `category-${nextId++}`,
			name: 'New category',
			grade: 0,
			weight: 0,
			included: true
		});
		recordPublicEvent('tool_used');
	}
	function removeCategory(id: string) {
		rows = rows.filter((row) => row.id !== id);
		recordPublicEvent('tool_used');
	}
</script>

<CalculatorFrame label="Weighted grade calculator">
	<div class="calc-field">
		<label for={`${idPrefix}-mode`}>How to handle the included weights</label>
		<select id={`${idPrefix}-mode`} bind:value={mode}>
			<option value="require-100">Require a total of 100%</option>
			<option value="normalize">Normalize by the included weight total</option>
		</select>
		<p class="calc-help">
			Normalization rescales only the included weights. Choose it explicitly if your policy excludes
			ungraded categories and redistributes their weight.
		</p>
	</div>
	<fieldset>
		<legend>Category grades and weights</legend>
		{#each rows as row (row.id)}
			<div class="calc-row">
				<div class="calc-field">
					<label for={`${idPrefix}-${row.id}-name`}>Category name</label><input
						id={`${idPrefix}-${row.id}-name`}
						bind:value={row.name}
						maxlength="80"
					/>
				</div>
				<label class="calc-check"
					><input type="checkbox" bind:checked={row.included} />Include {row.name ||
						'this category'}</label
				>
				<NumberField
					id={`${idPrefix}-${row.id}-grade`}
					label={`${row.name || 'Category'} grade (%)`}
					bind:value={row.grade}
					disabled={!row.included}
				/>
				<NumberField
					id={`${idPrefix}-${row.id}-weight`}
					label={`${row.name || 'Category'} weight (%)`}
					bind:value={row.weight}
					max={100}
					disabled={!row.included}
				/>
				<div class="calc-actions">
					<button
						type="button"
						onclick={() => removeCategory(row.id)}
						disabled={rows.length === 1}
						aria-label={`Remove ${row.name || 'category'}`}>Remove category</button
					>
				</div>
			</div>
		{/each}
		<div class="calc-actions">
			<button type="button" onclick={addCategory}>Add category</button>
		</div>
	</fieldset>
	{#if result.ok}
		<div class="calc-result" aria-live="polite" aria-atomic="true">
			<h3>Weighted course grade · estimate</h3>
			<strong class="calc-value" data-testid="weighted-grade"
				>{formatPercentage(result.grade)}%</strong
			>
			<p class="calc-note">
				Included weights total {formatPercentage(result.totalWeight)}%. {mode === 'normalize'
					? 'Each included category is divided by that total.'
					: 'The entered weights total 100%.'}
			</p>
		</div>
	{:else}<p class="calc-error" role="alert">{result.error}</p>{/if}
	<div class="calc-section">
		<h3>The formula</h3>
		<p class="calc-formula">
			Course % = Σ(category % × included category weight) ÷ Σ(included category weights)
		</p>
		<p class="calc-note">
			Enter each category's calculated percentage. A blank grade is an error; uncheck an ungraded
			category to exclude it. A scored zero stays included. Scores above 100% are supported when
			your policy allows them. This tool does not calculate a category's internal assignment
			average.
		</p>
		<p class="calc-note">
			Teacher rounding, dropped assignments, extra-credit rules and overrides can change an official
			grade. For point totals and a new score, use the <a href="/calculators/assignment-impact"
				>assignment calculator</a
			>. Values are used locally on this page.
		</p>
	</div>
</CalculatorFrame>

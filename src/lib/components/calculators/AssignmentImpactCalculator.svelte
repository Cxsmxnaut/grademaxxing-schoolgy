<script lang="ts">
	import {
		calculateAssignmentImpact,
		calculateCategoryTarget,
		type InputNumber,
		type PointCategory
	} from '$lib/grades/public-calculators';
	import { formatPercentage } from '$lib/grades/percentage-format';
	import { untrack } from 'svelte';
	import CalculatorFrame from './CalculatorFrame.svelte';
	import NumberField from './NumberField.svelte';
	import PointCategoryEditor from './PointCategoryEditor.svelte';
	let {
		idPrefix = 'impact',
		initialModel = 'total',
		initialAction = 'new'
	}: {
		idPrefix?: string;
		initialModel?: 'total' | 'categories';
		initialAction?: 'new' | 'replace';
	} = $props();
	let model = $state(untrack(() => initialModel));
	let action = $state(untrack(() => initialAction));
	let earned = $state<InputNumber>(80);
	let possible = $state<InputNumber>(100);
	let newEarned = $state<InputNumber>(40);
	let newPossible = $state<InputNumber>(50);
	let extraCredit = $state(false);
	let oldEarned = $state<InputNumber>(20);
	let oldPossible = $state<InputNumber>(25);
	let oldExtraCredit = $state(false);
	let categories = $state<PointCategory[]>([
		{ id: 'tests', name: 'Tests', weight: 50, earned: 170, possible: 200 },
		{ id: 'homework', name: 'Homework', weight: 50, earned: 95, possible: 100 }
	]);
	let categoryId = $state('tests');
	let target = $state<InputNumber>(92);
	let targetPossible = $state<InputNumber>(100);
	let targetIncrement = $state<InputNumber>(1);
	$effect(() => {
		if (!categories.some((c) => c.id === categoryId)) categoryId = categories[0]?.id ?? '';
	});
	const score = $derived({
		earned: newEarned,
		possible: extraCredit ? 0 : newPossible,
		extraCredit
	});
	const previous = $derived(
		action === 'replace'
			? {
					earned: oldEarned,
					possible: oldExtraCredit ? 0 : oldPossible,
					extraCredit: oldExtraCredit
				}
			: undefined
	);
	const result = $derived(
		calculateAssignmentImpact(
			model === 'total'
				? { model: 'total', earned, possible, score, previous }
				: { model: 'categories', categories, categoryId, score, previous }
		)
	);
	const targetResult = $derived(
		targetIncrement === undefined
			? { ok: false as const, error: 'Enter a positive point step.' }
			: calculateCategoryTarget({
					categories,
					categoryId,
					target,
					assignmentPossible: targetPossible,
					increment: targetIncrement
				})
	);
</script>

<CalculatorFrame label="Assignment impact calculator">
	<div class="calc-grid">
		<div class="calc-field">
			<label for={`${idPrefix}-model`}>Course calculation model</label><select
				id={`${idPrefix}-model`}
				bind:value={model}
				><option value="total">Total points</option><option value="categories"
					>Weighted categories · points within each</option
				></select
			>
		</div>
		<div class="calc-field">
			<label for={`${idPrefix}-action`}>Assignment action</label><select
				id={`${idPrefix}-action`}
				bind:value={action}
				><option value="new">Add a new assignment</option><option value="replace"
					>Replace a scored assignment</option
				></select
			>
		</div>
	</div>
	{#if model === 'total'}
		<fieldset>
			<legend
				>Current totals {action === 'replace'
					? '(including the original assignment)'
					: '(before the new assignment)'}</legend
			>
			<div class="calc-grid">
				<NumberField id={`${idPrefix}-earned`} label="Current earned points" bind:value={earned} />
				<NumberField
					id={`${idPrefix}-possible`}
					label="Current possible points"
					bind:value={possible}
				/>
			</div>
		</fieldset>
	{:else}
		<PointCategoryEditor bind:categories {idPrefix} />
		<p class="calc-note">
			This model divides points within each category, then normalizes across positive-weight
			categories with positive possible points. Empty categories are inactive; adding the first
			ordinary score activates their weight. Extra-credit-only categories remain inactive until they
			have ordinary possible points. No equal assignment averaging is assumed.
		</p>
		<div class="calc-field calc-section">
			<label for={`${idPrefix}-category`}>Assignment category</label><select
				id={`${idPrefix}-category`}
				bind:value={categoryId}
				>{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select
			>
		</div>
	{/if}
	{#if action === 'replace'}
		<fieldset>
			<legend>Original scored assignment</legend>
			<div class="calc-grid">
				<NumberField
					id={`${idPrefix}-old-earned`}
					label="Original earned points"
					bind:value={oldEarned}
				/>
				<NumberField
					id={`${idPrefix}-old-possible`}
					label="Original possible points"
					bind:value={oldPossible}
					disabled={oldExtraCredit}
				/>
			</div>
			<label class="calc-check"
				><input
					type="checkbox"
					bind:checked={oldExtraCredit}
					onchange={(event) => {
						oldPossible = event.currentTarget.checked ? 0 : 25;
					}}
				/>Original was numerator-only extra credit</label
			>
			<p class="calc-help">
				The current totals must already contain this original score. Replacement removes it before
				adding the new score.
			</p>
		</fieldset>
	{/if}
	<fieldset>
		<legend>{action === 'replace' ? 'Replacement score' : 'New assignment score'}</legend>
		<div class="calc-grid">
			<NumberField id={`${idPrefix}-new-earned`} label="New earned points" bind:value={newEarned} />
			<NumberField
				id={`${idPrefix}-new-possible`}
				label="New possible points"
				bind:value={newPossible}
				disabled={extraCredit}
			/>
		</div>
		<label class="calc-check"
			><input
				type="checkbox"
				bind:checked={extraCredit}
				onchange={(event) => {
					newPossible = event.currentTarget.checked ? 0 : 50;
				}}
			/>Numerator-only extra credit · adds zero possible points</label
		>
	</fieldset>
	{#if result.ok}
		<div class="calc-result" aria-live="polite" aria-atomic="true">
			<h3>Projected course grade · estimate</h3>
			<strong class="calc-value" data-testid="impact-after"
				>{formatPercentage(result.after)}%</strong
			>
			<p class="calc-note">
				Before: {result.before === undefined
					? 'no graded percentage yet'
					: `${formatPercentage(result.before)}%`}. Change:
				<strong data-testid="impact-delta"
					>{result.delta === undefined
						? 'new graded percentage'
						: `${result.delta >= 0 ? '+' : ''}${formatPercentage(result.delta)} percentage points`}</strong
				>.
			</p>
			{#if result.includedWeight !== undefined}<p class="calc-help">
					Active category weights total {formatPercentage(result.includedWeight)}%; this estimate
					normalizes by that total.
				</p>{/if}
		</div>
	{:else}<p class="calc-error" role="alert">{result.error}</p>{/if}
	{#if model === 'categories'}
		<div class="calc-section">
			<h3>Target a new assignment in this category</h3>
			<p class="calc-help">
				This separate calculation uses the current category totals above and a new ordinary
				assignment. It does not include the impact preview or replace an assignment.
			</p>
			<div class="calc-grid">
				<NumberField
					id={`${idPrefix}-target`}
					label="Target course grade (%)"
					bind:value={target}
				/>
				<NumberField
					id={`${idPrefix}-target-possible`}
					label="Target assignment possible points"
					bind:value={targetPossible}
				/>
				<NumberField
					id={`${idPrefix}-target-increment`}
					label="Allowed point step"
					bind:value={targetIncrement}
					hint="Use 1 for whole points or 0.5 for half points."
				/>
			</div>
			{#if targetResult.ok}
				<div class="calc-result" aria-live="polite" aria-atomic="true">
					<h3>Required earned points · estimate</h3>
					<strong class="calc-value" data-testid="category-target"
						>{formatPercentage(targetResult.requiredPoints)} / {formatPercentage(
							targetPossible!
						)}</strong
					>
					<p class="calc-note">
						That is {formatPercentage(targetResult.requiredPercentage)}%. Minimum nonnegative score
						at your step: {formatPercentage(targetResult.minimumPoints)} points. Forward check: {formatPercentage(
							targetResult.forwardGrade
						)}% overall.
					</p>
					{#if targetResult.status === 'above-maximum'}<p class="calc-warning">
							The required points or their upward rounding exceed this assignment's ordinary
							maximum. The target is unreachable at this point step without a policy that permits
							extra credit or another change.
						</p>{:else if targetResult.status === 'already-secured'}<p class="calc-warning">
							The algebra gives negative earned points; 0 points already keeps you at or above the
							target under this model.
						</p>{/if}
				</div>
			{:else}<p class="calc-error" role="alert">{targetResult.error}</p>{/if}
			<p class="calc-note">
				A 100-point final inside a tests category is not automatically worth that category's entire
				course weight. Its effect depends on the category's existing points. For a final with a
				fixed overall course weight, use the <a href="/calculators/final-grade"
					>final exam calculator</a
				>.
			</p>
		</div>
	{/if}
	<div class="calc-section">
		<h3>The formula</h3>
		<p class="calc-formula">
			Total points after = (current earned − original earned + new earned) ÷ (current possible −
			original possible + new possible) × 100
		</p>
		<p class="calc-help">
			For a new assignment, original earned and possible are both zero. Numerator-only extra credit
			adds zero possible points. For weighted categories, update this ratio inside the selected
			category, then sum each active category percentage × weight and divide by the active weight
			total.
		</p>
	</div>
	<p class="calc-note">
		All results are local estimates from entered values. Ungraded work is excluded unless you
		explicitly add it as a scored zero. Dropped work, equal-assignment category averages,
		replacements restricted by a teacher, and official overrides are outside this model.
	</p>
</CalculatorFrame>

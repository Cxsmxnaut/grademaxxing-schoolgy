<script lang="ts">
	import { calculateFinalTarget, type InputNumber } from '$lib/grades/public-calculators';
	import { formatPercentage } from '$lib/grades/percentage-format';
	import { untrack } from 'svelte';
	import CalculatorFrame from './CalculatorFrame.svelte';
	import NumberField from './NumberField.svelte';
	let {
		idPrefix = 'final',
		initialCurrent = 82,
		initialTarget = 90,
		initialWeight = 20
	}: {
		idPrefix?: string;
		initialCurrent?: number;
		initialTarget?: number;
		initialWeight?: number;
	} = $props();
	let current = $state<InputNumber>(untrack(() => initialCurrent));
	let target = $state<InputNumber>(untrack(() => initialTarget));
	let weight = $state<InputNumber>(untrack(() => initialWeight));
	let maximum = $state<InputNumber>(100);
	let increment = $state<InputNumber>(0.01);
	const result = $derived(
		maximum === undefined || increment === undefined
			? { ok: false as const, error: 'Enter a maximum score and a score step.' }
			: calculateFinalTarget({ current, target, weight, maximum, increment })
	);
</script>

<CalculatorFrame label="Final exam grade calculator">
	<div class="calc-grid">
		<NumberField
			id={`${idPrefix}-current`}
			label="Current grade (%)"
			bind:value={current}
			hint="Grade for the work before the final, not a grade already including it."
		/>
		<NumberField id={`${idPrefix}-target`} label="Target course grade (%)" bind:value={target} />
		<NumberField
			id={`${idPrefix}-weight`}
			label="Final's overall course weight (%)"
			bind:value={weight}
			max={100}
			hint="Use the final's overall percentage, not its category's weight."
		/>
		<NumberField
			id={`${idPrefix}-maximum`}
			label="Maximum allowed final score (%)"
			bind:value={maximum}
			hint="Usually 100. Change only if your grading policy permits more."
		/>
	</div>
	<details>
		<summary>Score increments</summary>
		<NumberField
			id={`${idPrefix}-increment`}
			label="Allowed score step (%)"
			bind:value={increment}
			hint="The minimum score rounds up to this step. For whole percentages, enter 1."
		/>
	</details>
	{#if result.ok}
		<div class="calc-result" aria-live="polite" aria-atomic="true">
			<h3>Required final score · estimate</h3>
			<strong class="calc-value" data-testid="final-required"
				>{formatPercentage(result.required)}%</strong
			>
			{#if result.status === 'above-maximum'}
				<p class="calc-warning">
					The required score or its upward rounding exceeds the entered maximum of {formatPercentage(
						maximum!
					)}%. It is unreachable at this score step under these assumptions.
				</p>
			{:else if result.status === 'already-secured'}
				<p class="calc-warning">
					The algebra gives a negative score: the target is already secured even with 0% on the
					final under these assumptions.
				</p>
			{/if}
			<p class="calc-note">
				Minimum nonnegative score at your chosen step: <strong
					>{formatPercentage(result.minimumScore)}%</strong
				>. Forward check: that score gives <strong>{formatPercentage(result.forwardGrade)}%</strong> overall.
			</p>
		</div>
	{:else}<p class="calc-error" role="alert">{result.error}</p>{/if}
	<p class="calc-note">
		Assumes the current grade fills the other {weight === undefined
			? 'remaining'
			: formatPercentage(100 - weight)}% and no other scores, drops, or overrides change. Inputs
		stay in this page; this tool does not connect to StudentVUE.
	</p>
	<div class="calc-section">
		<h3>The formula</h3>
		<p class="calc-formula">
			Required final % = (target % − current % × (1 − final weight ÷ 100)) ÷ (final weight ÷ 100)
		</p>
		<p class="calc-note">
			If the final is a point-based assignment within a tests category, use the <a
				href="/calculators/assignment-impact">assignment calculator</a
			> instead. Your teacher's grading and rounding rules determine the official grade.
		</p>
	</div>
</CalculatorFrame>

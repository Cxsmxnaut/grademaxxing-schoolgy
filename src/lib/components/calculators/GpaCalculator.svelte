<script lang="ts">
	import { recordPublicEvent } from '$lib/analytics/public-client';
	import {
		calculatePublicGpa,
		type GpaScaleEntry,
		type InputNumber,
		type PublicGpaRow
	} from '$lib/grades/public-calculators';
	import CalculatorFrame from './CalculatorFrame.svelte';
	import NumberField from './NumberField.svelte';
	let { idPrefix = 'gpa' }: { idPrefix?: string } = $props();
	let scale = $state<GpaScaleEntry[]>([
		{ letter: 'A', points: 4 },
		{ letter: 'B', points: 3 },
		{ letter: 'C', points: 2 },
		{ letter: 'D', points: 1 },
		{ letter: 'F', points: 0 }
	]);
	let rows = $state<PublicGpaRow[]>([
		{ id: 'course-1', name: 'Example course 1', grade: 'A', credits: 1, bonus: 0, included: true },
		{ id: 'course-2', name: 'Example course 2', grade: 'B', credits: 0.5, bonus: 0, included: true }
	]);
	let minimumPoints = $state<InputNumber>(0);
	let nextId = 3;
	const result = $derived(
		minimumPoints === undefined
			? { ok: false as const, error: 'Enter a nonnegative base-point threshold for bonuses.' }
			: calculatePublicGpa(rows, scale, minimumPoints)
	);
	const displayGpa = (value: number) => value.toFixed(2);
	function addCourse() {
		rows.push({
			id: `course-${nextId++}`,
			name: `Example course ${nextId - 1}`,
			grade: scale[0]?.letter ?? '',
			credits: 1,
			bonus: 0,
			included: true
		});
		recordPublicEvent('tool_used');
	}
	function removeCourse(id: string) {
		rows = rows.filter((row) => row.id !== id);
		recordPublicEvent('tool_used');
	}
	function addScaleEntry() {
		scale.push({ letter: '', points: 0 });
		recordPublicEvent('tool_used');
	}
	function removeScaleEntry(index: number) {
		scale.splice(index, 1);
		recordPublicEvent('tool_used');
	}
</script>

<CalculatorFrame label="Credit-weighted GPA calculator">
	<p class="calc-note">
		Start with this editable A/B/C/D/F example scale, then match your school's policy. There is no
		universal GPA scale. The example assigns no rigor bonuses until you enter them.
	</p>
	<details>
		<summary>Configure the grade-point scale and bonus rule</summary>
		<fieldset>
			<legend>Grade labels and base points</legend>
			{#each scale as entry, index (index)}
				<div class="calc-row">
					<div class="calc-field">
						<label for={`${idPrefix}-scale-${index}-label`}>Grade label {index + 1}</label><input
							id={`${idPrefix}-scale-${index}-label`}
							bind:value={entry.letter}
							maxlength="20"
							placeholder="For example, A−"
						/>
					</div>
					<NumberField
						id={`${idPrefix}-scale-${index}-points`}
						label={`Base points for grade label ${index + 1}`}
						bind:value={entry.points}
					/>
					<div class="calc-actions">
						<button
							type="button"
							onclick={() => removeScaleEntry(index)}
							disabled={scale.length === 1}
							aria-label={`Remove grade label ${index + 1}`}>Remove grade label</button
						>
					</div>
				</div>
			{/each}
			<div class="calc-actions">
				<button type="button" onclick={addScaleEntry}>Add grade label</button>
			</div>
		</fieldset>
		<p class="calc-help">
			Add plus/minus grades with the exact points your school uses. Labels must be unique, ignoring
			letter case. Include pass/fail only if you know its GPA treatment; otherwise exclude that
			course.
		</p>
		<NumberField
			id={`${idPrefix}-bonus-threshold`}
			label="Minimum base points to receive a rigor bonus"
			bind:value={minimumPoints}
			hint="0 permits an entered bonus for any grade, including F. Raise this if low grades do not earn a bonus under your policy."
		/>
	</details>
	<fieldset>
		<legend>Courses, credits and optional rigor bonuses</legend>
		{#each rows as row (row.id)}
			<div class="calc-row">
				<div class="calc-field">
					<label for={`${idPrefix}-${row.id}-name`}>Course name</label><input
						id={`${idPrefix}-${row.id}-name`}
						bind:value={row.name}
						maxlength="80"
					/>
				</div>
				<label class="calc-check"
					><input type="checkbox" bind:checked={row.included} />Include {row.name || 'this course'} in
					GPA</label
				>
				<div class="calc-field">
					<label for={`${idPrefix}-${row.id}-grade`}>{row.name || 'Course'} grade</label><select
						id={`${idPrefix}-${row.id}-grade`}
						bind:value={row.grade}
						disabled={!row.included}
						>{#each scale as entry, index (index)}<option value={entry.letter}
								>{entry.letter || `Unnamed grade ${index + 1}`}</option
							>{/each}</select
					>
				</div>
				<NumberField
					id={`${idPrefix}-${row.id}-credits`}
					label={`${row.name || 'Course'} credits`}
					bind:value={row.credits}
					disabled={!row.included}
					hint="Use the same credit unit for every course, such as 1 for a year and 0.5 for a semester."
				/>
				<NumberField
					id={`${idPrefix}-${row.id}-bonus`}
					label={`${row.name || 'Course'} rigor bonus (grade points)`}
					bind:value={row.bonus}
					disabled={!row.included}
					hint="Enter 0 for none. Honors/AP/IB bonus rules vary; use the school's value."
				/>
				<div class="calc-actions">
					<button
						type="button"
						onclick={() => removeCourse(row.id)}
						disabled={rows.length === 1}
						aria-label={`Remove ${row.name || 'course'}`}>Remove course</button
					>
				</div>
			</div>
		{/each}
		<div class="calc-actions"><button type="button" onclick={addCourse}>Add course</button></div>
	</fieldset>
	{#if result.ok}
		<div class="calc-result" aria-live="polite" aria-atomic="true">
			<h3>Credit-weighted GPA · estimate</h3>
			<div class="calc-grid">
				<div>
					<span class="calc-help">Without rigor bonuses</span><strong
						class="calc-value"
						data-testid="gpa-unweighted">{displayGpa(result.unweighted)}</strong
					>
				</div>
				<div>
					<span class="calc-help">With configured rigor bonuses</span><strong
						class="calc-value"
						data-testid="gpa-weighted">{displayGpa(result.weighted)}</strong
					>
				</div>
			</div>
			<p class="calc-note">
				{result.courses} included courses, {result.credits} credits. Display rounded to two decimals;
				calculations retain the entered precision.
			</p>
		</div>
	{:else}<p class="calc-error" role="alert">{result.error}</p>{/if}
	<div class="calc-section">
		<h3>The formula</h3>
		<p class="calc-formula">
			GPA = Σ(configured grade points × course credits) ÷ Σ(included credits)
		</p>
		<p class="calc-note">
			The bonus version adds each eligible course's entered rigor bonus to its base grade points
			before weighting by credits. No cap, transcript eligibility, repeat-course replacement or
			district-specific rule is applied automatically. Exclude ineligible courses yourself and
			configure the scale and bonuses before relying on the estimate.
		</p>
		<p class="calc-note">
			This estimates GPA for only the courses you enter. It does not connect to StudentVUE, infer an
			official or college-admission GPA, or change your records. Values are used locally on this
			page.
		</p>
	</div>
</CalculatorFrame>

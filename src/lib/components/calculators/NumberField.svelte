<script lang="ts">
	import type { InputNumber } from '$lib/grades/public-calculators';
	let {
		id,
		label,
		value = $bindable(),
		min = 0,
		max,
		step = 'any',
		hint,
		disabled = false
	}: {
		id: string;
		label: string;
		value?: InputNumber;
		min?: number;
		max?: number;
		step?: number | 'any';
		hint?: string;
		disabled?: boolean;
	} = $props();
</script>

<div class="calc-field">
	<label for={id}>{label}</label>
	<input
		{id}
		type="number"
		bind:value
		{min}
		{max}
		{step}
		{disabled}
		aria-describedby={hint ? `${id}-hint` : undefined}
	/>
	{#if hint}<span class="calc-help" id={`${id}-hint`}>{hint}</span>{/if}
</div>

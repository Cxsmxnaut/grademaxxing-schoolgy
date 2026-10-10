<script lang="ts">
	import { recordPublicEvent } from '$lib/analytics/public-client';
	import { onMount, type Snippet } from 'svelte';
	let { label, children }: { label: string; children: Snippet } = $props();
	let interactive = $state(false);
	onMount(() => {
		interactive = true;
	});
</script>

<section class="calculator" aria-label={label} onchange={() => recordPublicEvent('tool_used')}>
	<fieldset class="calculator-content" disabled={!interactive} aria-label={label}>
		{@render children()}
	</fieldset>
	<noscript
		><p class="calc-note">
			Interactive calculator controls need JavaScript. The example results and formulas on this page
			are available to read without it.
		</p></noscript
	>
</section>

<style>
	.calculator .calculator-content {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.calculator {
		padding: clamp(1rem, 3vw, 2rem);
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--corner-xl);
		color: var(--foreground);
	}
	.calculator :global(.calc-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.calculator :global(.calc-field) {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}
	.calculator :global(label),
	.calculator :global(legend) {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.calculator :global(input:not([type='checkbox'])),
	.calculator :global(select) {
		box-sizing: border-box;
		width: 100%;
		min-height: 2.75rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--input);
		border-radius: var(--corner-sm);
		color: var(--foreground);
		background: var(--background);
		font: inherit;
	}
	.calculator :global(input:disabled),
	.calculator :global(select:disabled) {
		opacity: 0.6;
	}
	.calculator :global(input:focus-visible),
	.calculator :global(select:focus-visible),
	.calculator :global(button:focus-visible),
	.calculator :global(summary:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}
	.calculator :global(.calc-help),
	.calculator :global(.calc-note) {
		color: var(--muted-foreground);
		font-size: 0.85rem;
		line-height: 1.6;
	}
	.calculator :global(.calc-note) {
		margin-top: 1rem;
	}
	.calculator :global(a) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.calculator :global(.calc-section) {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
	}
	.calculator :global(.calc-section h3) {
		margin-bottom: 0.85rem;
		font-family: var(--font-heading);
		font-size: 1.1rem;
	}
	.calculator :global(fieldset) {
		border: 0;
		padding: 0;
		margin: 1.25rem 0 0;
		min-width: 0;
	}
	.calculator :global(legend) {
		margin-bottom: 0.75rem;
	}
	.calculator :global(.calc-row) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		padding-block: 1rem;
		border-bottom: 1px solid var(--border);
	}
	.calculator :global(.calc-check) {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 2.75rem;
	}
	.calculator :global(input[type='checkbox']) {
		width: 1.2rem;
		height: 1.2rem;
		accent-color: var(--primary);
	}
	.calculator :global(.calc-actions) {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}
	.calculator :global(button) {
		min-height: 2.75rem;
		padding: 0.65rem 1rem;
		color: var(--foreground);
		background: var(--secondary);
		border: 1px solid var(--input);
		border-radius: var(--corner-sm);
		font: inherit;
		cursor: pointer;
	}
	.calculator :global(button:disabled) {
		cursor: default;
		opacity: 0.55;
	}
	.calculator :global(.calc-result) {
		margin-top: 1.5rem;
		padding: 1.25rem;
		border-radius: var(--corner-md);
		background: var(--background);
		border-left: 3px solid var(--simulation);
	}
	.calculator :global(.calc-result h3) {
		font-size: 0.85rem;
		color: var(--muted-foreground);
		margin: 0 0 0.45rem;
	}
	.calculator :global(.calc-value) {
		display: block;
		font-family: var(--font-heading);
		font-size: clamp(1.7rem, 5vw, 2.5rem);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.calculator :global(.calc-warning) {
		color: var(--warning);
		margin-top: 0.5rem;
		line-height: 1.6;
	}
	.calculator :global(.calc-error) {
		margin-top: 1.25rem;
		color: var(--destructive);
		line-height: 1.6;
	}
	.calculator :global(.calc-formula) {
		font-family: var(--font-technical);
		overflow-wrap: anywhere;
		line-height: 1.8;
		font-size: 0.9rem;
	}
	.calculator :global(details) {
		margin-top: 1rem;
	}
	.calculator :global(summary) {
		min-height: 2.75rem;
		padding-block: 0.65rem;
		cursor: pointer;
	}
	@media (max-width: 560px) {
		.calculator :global(.calc-grid),
		.calculator :global(.calc-row) {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>

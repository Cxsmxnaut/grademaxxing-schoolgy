<script lang="ts">
	import { brand } from '$lib/brand';
	import ThinkingOrb from '$lib/components/ThinkingOrb.svelte';

	let {
		message = 'Loading your grades…',
		recoveryStage
	}: { message?: string; recoveryStage?: 'saving' | 'refreshing' } = $props();
	const currentStep = $derived(
		recoveryStage ? (recoveryStage === 'saving' ? 1 : 2) : /connect|restor/i.test(message) ? 1 : 2
	);
</script>

<div class="post-login-loading" data-testid="post-login-loading">
	<div class="loading-content" role="status" aria-live="polite" aria-atomic="true">
		{#key currentStep}
			<ThinkingOrb state={currentStep === 1 ? 'connecting' : 'working'} size={64} />
		{/key}
		<p class="loading-message">{message}</p>
		<p class="loading-detail">
			{#if recoveryStage === 'saving'}
				We’re restoring your saved session and bringing you right back.
			{:else if recoveryStage === 'refreshing'}
				Your session is saved. We’re getting your latest grades before you return.
			{:else}
				StudentVUE is retrieving your latest gradebook. This is the part where the portal does the
				work.
			{/if}
		</p>
		<ol
			class="loading-steps"
			aria-label={recoveryStage ? 'Session recovery progress' : 'Sign-in progress'}
		>
			<li class:complete={currentStep > 1} class:active={currentStep === 1}>
				<span aria-hidden="true">{currentStep > 1 ? '✓' : '1'}</span>
				{recoveryStage ? 'Save your session' : 'Connect to StudentVUE'}
			</li>
			<li class:active={currentStep === 2}>
				<span aria-hidden="true">2</span>
				{recoveryStage ? 'Refresh your grades' : 'Load your grades'}
			</li>
		</ol>
		<span class="sr-only">{message} {brand} is preparing your gradebook.</span>
	</div>
</div>

<style>
	/* Hallmark · loading state: flat canvas and the project's Thinking Orbs component */
	.post-login-loading {
		position: fixed;
		z-index: 100;
		inset: 0;
		display: grid;
		min-height: 100dvh;
		place-items: center;
		overflow: hidden;
		background: var(--background);
		color: var(--foreground);
		font-family: var(--font-body);
	}
	.loading-content {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		flex-direction: column;
		max-width: 32rem;
		padding: var(--space-lg);
		text-align: center;
	}
	.loading-content p {
		margin: 0;
		color: var(--muted-foreground);
		letter-spacing: -0.01em;
	}
	.loading-message {
		margin-top: var(--space-xl) !important;
		color: var(--foreground) !important;
		font-family: var(--font-heading);
		font-size: 1.25rem;
		font-weight: 700;
	}
	.loading-detail {
		margin-top: var(--space-xs) !important;
		font-size: 0.8125rem;
		line-height: 1.5;
	}
	.loading-steps {
		display: flex;
		gap: var(--space-lg);
		margin: var(--space-xl) 0 0;
		padding: 0;
		color: var(--tertiary-foreground);
		font-size: 0.75rem;
		font-weight: 650;
		list-style: none;
	}
	.loading-steps li {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.loading-steps li.active {
		color: var(--foreground);
	}
	.loading-steps li.complete {
		color: var(--success);
	}
	.loading-steps li span {
		display: grid;
		width: 20px;
		height: 20px;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-family: var(--font-technical);
		font-size: 0.625rem;
	}
	.loading-steps li.active span {
		border-color: var(--primary);
		color: var(--primary);
	}
	.loading-steps li.complete span {
		border-color: var(--success);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	@media (max-width: 480px) {
		.loading-steps {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
	}
</style>

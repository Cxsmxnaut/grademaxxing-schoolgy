<script lang="ts">
	import { brand } from '$lib/brand';

	let { message = 'Loading your grades…' }: { message?: string } = $props();
	const currentStep = $derived(/connect|restor/i.test(message) ? 1 : 2);
</script>

<div class="post-login-loading" data-testid="post-login-loading">
	<div class="loading-content" role="status" aria-live="polite" aria-atomic="true">
		<div class="thinking-orb" aria-hidden="true">
			<span class="orb-core"></span>
			<span class="orb-shine"></span>
		</div>
		<p class="loading-message">{message}</p>
		<p class="loading-detail">
			StudentVUE is retrieving your latest gradebook. This is the part where the portal does the
			work.
		</p>
		<ol class="loading-steps" aria-label="Sign-in progress">
			<li class:complete={currentStep > 1} class:active={currentStep === 1}>
				<span aria-hidden="true">{currentStep > 1 ? '✓' : '1'}</span>
				Connect to StudentVUE
			</li>
			<li class:active={currentStep === 2}>
				<span aria-hidden="true">2</span>
				Load your grades
			</li>
		</ol>
		<span class="sr-only">{message} {brand} is preparing your gradebook.</span>
	</div>
</div>

<style>
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · component: thinking orb · palette: Grademaxxing semantic tokens */
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
	.post-login-loading::before {
		position: absolute;
		width: min(26rem, 90vw);
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--primary);
		content: '';
		filter: blur(110px);
		opacity: 0.08;
		pointer-events: none;
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
	.thinking-orb {
		position: relative;
		width: 7rem;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--primary) 38%, transparent);
		border-radius: 50%;
		background: radial-gradient(
			circle at 31% 26%,
			color-mix(in srgb, var(--foreground) 72%, var(--primary)) 0%,
			color-mix(in srgb, var(--primary) 58%, var(--card)) 21%,
			color-mix(in srgb, var(--primary) 24%, var(--surface-sunken)) 55%,
			var(--surface-sunken) 82%
		);
		box-shadow:
			inset -0.75rem -1rem 1.5rem color-mix(in srgb, var(--surface-sunken) 75%, transparent),
			0 0 2.5rem color-mix(in srgb, var(--primary) 22%, transparent);
		animation: orb-breathe 3.6s ease-in-out infinite;
	}
	.orb-core {
		position: absolute;
		inset: 24% 14% 10% 24%;
		border-radius: 50%;
		background: color-mix(in srgb, var(--success) 52%, var(--primary));
		filter: blur(1.15rem);
		opacity: 0.58;
		animation: orb-drift 4.5s ease-in-out infinite alternate;
	}
	.orb-shine {
		position: absolute;
		top: 13%;
		left: 18%;
		width: 39%;
		height: 24%;
		border-radius: 50%;
		background: var(--foreground);
		filter: blur(0.7rem);
		opacity: 0.48;
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
	@keyframes orb-breathe {
		0%,
		100% {
			transform: translateY(0) scale(0.97);
		}
		50% {
			transform: translateY(-0.25rem) scale(1.03);
		}
	}
	@keyframes orb-drift {
		from {
			transform: translate(-10%, 8%) scale(0.86);
		}
		to {
			transform: translate(8%, -5%) scale(1.08);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.thinking-orb,
		.orb-core {
			animation: none;
		}
	}
	@media (max-width: 480px) {
		.loading-steps {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
	}
</style>

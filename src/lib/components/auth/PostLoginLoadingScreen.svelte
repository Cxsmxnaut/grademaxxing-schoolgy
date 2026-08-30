<script lang="ts">
	import { brand } from '$lib/brand';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let { message = 'Loading your grades…' }: { message?: string } = $props();

	const phrases = [
		'Getting your grades in sync…',
		'Building the full picture…',
		'Making your grades make sense…'
	];
	let phraseIndex = $state(0);

	onMount(() => {
		const interval = window.setInterval(() => {
			phraseIndex = (phraseIndex + 1) % phrases.length;
		}, 2_600);
		return () => window.clearInterval(interval);
	});
</script>

<div class="post-login-loading" data-testid="post-login-loading">
	<div class="loading-content" role="status" aria-live="polite" aria-atomic="true">
		<div class="logo-glow" aria-hidden="true">
			<img src="/favicon.svg" width="92" height="92" alt="" />
		</div>
		<div class="loading-dots" aria-hidden="true">
			<span></span><span></span><span></span>
		</div>
		{#key phraseIndex}
			<p in:fade={{ duration: 260 }} out:fade={{ duration: 180 }}>{phrases[phraseIndex]}</p>
		{/key}
		<span class="sr-only">{message} {brand} is preparing your dashboard.</span>
	</div>
</div>

<style>
	.post-login-loading {
		position: fixed;
		z-index: 100;
		inset: 0;
		display: grid;
		min-height: 100dvh;
		place-items: center;
		overflow: hidden;
		background:
			radial-gradient(720px 460px at 50% 48%, rgba(77, 182, 245, 0.045), transparent 70%),
			radial-gradient(980px 620px at 82% -18%, rgba(18, 55, 89, 0.34), transparent 65%),
			linear-gradient(145deg, #071724, #081522 58%, #06131f);
		color: #e4eef8;
		font-family: 'Instrument Sans Variable', system-ui, sans-serif;
	}
	.loading-content {
		display: flex;
		align-items: center;
		flex-direction: column;
		padding: 24px;
		text-align: center;
	}
	.logo-glow {
		display: grid;
		place-items: center;
		animation: logo-float 2.8s ease-in-out infinite;
	}
	.logo-glow img {
		filter: drop-shadow(0 14px 24px rgba(0, 0, 0, 0.32))
			drop-shadow(0 0 28px rgba(14, 159, 110, 0.12));
	}
	.loading-dots {
		display: flex;
		gap: 7px;
		margin-top: 10px;
	}
	.loading-dots span {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: #4db6f5;
		box-shadow: 0 0 12px rgba(77, 182, 245, 0.22);
		animation: loading-pulse 1.15s ease-in-out infinite;
	}
	.loading-dots span:nth-child(2) {
		animation-delay: 0.15s;
		opacity: 0.7;
	}
	.loading-dots span:nth-child(3) {
		animation-delay: 0.3s;
		opacity: 0.45;
	}
	.loading-content p {
		margin: 17px 0 0;
		color: #9bb3ca;
		font-size: 15px;
		font-weight: 650;
		letter-spacing: -0.01em;
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
	@keyframes loading-pulse {
		0%,
		100% {
			transform: translateY(0) scale(0.82);
			opacity: 0.38;
		}
		50% {
			transform: translateY(-3px) scale(1);
			opacity: 1;
		}
	}
	@keyframes logo-float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-dots span,
		.logo-glow {
			animation: none;
		}
		.loading-dots span {
			opacity: 0.8;
		}
	}
</style>

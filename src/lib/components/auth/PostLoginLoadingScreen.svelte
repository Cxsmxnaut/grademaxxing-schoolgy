<script lang="ts">
	import { brand } from '$lib/brand';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let { message = 'Loading your grades…' }: { message?: string } = $props();

	const phrases = [
		'Checking if that quiz got graded yet…',
		'Putting the full picture together…',
		'Whatever it says, you’re more than a number.'
	];
	let phraseIndex = $state(0);

	onMount(() => {
		const interval = window.setInterval(() => {
			phraseIndex = (phraseIndex + 1) % phrases.length;
		}, 2_400);
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
	.post-login-loading::before,
	.post-login-loading::after {
		position: absolute;
		inset: -35%;
		content: '';
		pointer-events: none;
	}
	.post-login-loading::before {
		background: repeating-radial-gradient(
			ellipse at 52% 48%,
			transparent 0 92px,
			rgba(77, 182, 245, 0.036) 112px 142px,
			transparent 166px 230px
		);
		filter: blur(12px);
		animation: wave-drift 13s ease-in-out infinite alternate;
	}
	.post-login-loading::after {
		background: repeating-radial-gradient(
			ellipse at 20% 70%,
			transparent 0 130px,
			rgba(20, 72, 111, 0.052) 158px 202px,
			transparent 230px 310px
		);
		filter: blur(18px);
		animation: wave-drift-reverse 17s ease-in-out infinite alternate;
	}
	.loading-content {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		flex-direction: column;
		padding: 24px;
		text-align: center;
	}
	.logo-glow {
		display: grid;
		place-items: center;
		animation: logo-float 2.3s ease-in-out infinite;
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
			transform: translateY(-6px) scale(1);
			opacity: 1;
		}
	}
	@keyframes logo-float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-7px);
		}
	}
	@keyframes wave-drift {
		from {
			transform: translate3d(-2%, -1%, 0) rotate(-8deg) scale(1.05);
		}
		to {
			transform: translate3d(3%, 2%, 0) rotate(-4deg) scale(1.11);
		}
	}
	@keyframes wave-drift-reverse {
		from {
			transform: translate3d(2%, -2%, 0) rotate(5deg) scale(1.08);
		}
		to {
			transform: translate3d(-3%, 2%, 0) rotate(1deg) scale(1.14);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-dots span,
		.logo-glow,
		.post-login-loading::before,
		.post-login-loading::after {
			animation: none;
		}
		.loading-dots span {
			opacity: 0.8;
		}
	}
</style>

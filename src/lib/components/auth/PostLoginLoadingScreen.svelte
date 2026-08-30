<script lang="ts">
	import { brand } from '$lib/brand';

	let { message = 'Loading your grades…' }: { message?: string } = $props();
</script>

<div class="post-login-loading" data-testid="post-login-loading">
	<div class="loading-content" role="status" aria-live="polite" aria-atomic="true">
		<div class="logo-glow" aria-hidden="true">
			<img src="/favicon.svg" width="78" height="78" alt="" />
		</div>
		<div class="loading-dots" aria-hidden="true">
			<span></span><span></span><span></span>
		</div>
		<p>{message}</p>
		<span class="sr-only">{brand} is preparing your dashboard.</span>
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
			radial-gradient(520px 320px at 50% 48%, rgba(77, 182, 245, 0.09), transparent 70%),
			radial-gradient(720px 460px at -8% 8%, rgba(77, 182, 245, 0.06), transparent 64%), #081522;
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
		width: 108px;
		height: 108px;
		place-items: center;
		border: 1px solid rgba(77, 182, 245, 0.08);
		border-radius: 30px;
		background: rgba(13, 32, 51, 0.82);
		box-shadow:
			0 22px 52px rgba(0, 0, 0, 0.28),
			0 0 64px rgba(77, 182, 245, 0.12);
	}
	.logo-glow img {
		filter: drop-shadow(0 12px 22px rgba(77, 182, 245, 0.2));
	}
	.loading-dots {
		display: flex;
		gap: 7px;
		margin-top: 18px;
	}
	.loading-dots span {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: #4db6f5;
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
		margin: 16px 0 0;
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
	@media (prefers-reduced-motion: reduce) {
		.loading-dots span {
			animation: none;
			opacity: 0.8;
		}
	}
</style>

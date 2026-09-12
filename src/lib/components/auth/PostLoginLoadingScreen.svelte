<script lang="ts">
	import { brand } from '$lib/brand';

	let { message = 'Loading your grades…' }: { message?: string } = $props();
	const currentStep = $derived(/connect|restor/i.test(message) ? 1 : 2);
</script>

<div class="post-login-loading" data-testid="post-login-loading">
	<div class="loading-content" role="status" aria-live="polite" aria-atomic="true">
		<div class="logo-glow" aria-hidden="true">
			<img src="/favicon.svg" width="92" height="92" alt="" />
		</div>
		<div class="loading-dots" aria-hidden="true">
			<span></span><span></span><span></span>
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
		font-family: 'Instrument Sans', system-ui, sans-serif;
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
		margin: 0;
		color: #9bb3ca;
		letter-spacing: -0.01em;
	}
	.loading-message {
		margin-top: 17px !important;
		color: #e4eef8 !important;
		font-size: 18px;
		font-weight: 700;
	}
	.loading-detail {
		margin-top: 7px !important;
		font-size: 13px;
	}
	.loading-steps {
		display: flex;
		gap: 18px;
		margin: 28px 0 0;
		padding: 0;
		color: #66819b;
		font-size: 12px;
		font-weight: 650;
		list-style: none;
	}
	.loading-steps li {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.loading-steps li.active {
		color: #b9d8ef;
	}
	.loading-steps li.complete {
		color: #65d397;
	}
	.loading-steps li span {
		display: grid;
		width: 20px;
		height: 20px;
		place-items: center;
		border: 1px solid rgba(102, 129, 155, 0.55);
		border-radius: 999px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
	}
	.loading-steps li.active span {
		border-color: #4db6f5;
		color: #4db6f5;
	}
	.loading-steps li.complete span {
		border-color: #65d397;
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
	@media (max-width: 480px) {
		.loading-steps {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
	}
</style>

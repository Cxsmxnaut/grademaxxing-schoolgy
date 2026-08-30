<script lang="ts">
	import '@fontsource-variable/instrument-sans';
	import '@fontsource-variable/space-grotesk';
	import '@fontsource/ibm-plex-mono';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { LocalStorageKey } from '$lib';
	import { acc, loadStudentAccount } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import MailIcon from '@lucide/svelte/icons/mail';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

	if (browser && localStorage.getItem(LocalStorageKey.token) !== null) {
		if (!acc.studentAccount) loadStudentAccount();
		void goto('/grades');
	}

	const features = [
		{
			icon: ChartLineIcon,
			title: 'Grade trends',
			description: 'See the assignments and changes behind every percentage.'
		},
		{
			icon: CalculatorIcon,
			title: 'What-if calculator',
			description: 'Test a final, missing assignment, or target grade before it happens.'
		},
		{
			icon: CalendarDaysIcon,
			title: 'Attendance detail',
			description: 'Review absences, tardies, activities, dates, and class periods.'
		},
		{
			icon: FileTextIcon,
			title: 'Records in one place',
			description: 'Keep StudentVUE documents, report cards, and mail within reach.'
		}
	];
</script>

<svelte:head>
	<title>{brand} — know where your grades are headed</title>
	<meta
		name="description"
		content="Understand StudentVUE grades with trends, category math, what-if scores, attendance, documents, and mail."
	/>
</svelte:head>

<div class="landing-root">
	<nav class="landing-nav" aria-label="Primary navigation">
		<a class="wordmark" href="/" aria-label="{brand} home">
			<img src="/favicon.svg" width="28" height="28" alt="" />
			<span>Grade<span class="accent-word">maxxing</span></span>
		</a>
		<div class="nav-actions">
			<a class="button button-ghost button-small" href="/login">Log in</a>
			<a class="button button-small" href="/signup">Sign up</a>
		</div>
	</nav>

	<main>
		<section class="hero" aria-labelledby="landing-title">
			<h1 id="landing-title">Know where your grades <br />are headed.</h1>
			<p class="hero-subtitle">
				Grade trends, category math, what-if scores, attendance, documents, and mail—without the
				StudentVUE maze.
			</p>
			<div class="hero-actions">
				<a class="button button-primary button-large" href="/login">
					Sign in with StudentVUE <ArrowRightIcon aria-hidden="true" />
				</a>
				<a class="button button-ghost button-large" href="#features">See what it does</a>
			</div>
			<div class="studentvue-pill">
				<RefreshCwIcon aria-hidden="true" /> Syncs directly with your district
			</div>
			<p class="human-line">Built around the school data students actually use.</p>

			<div class="product-frame" aria-label="Preview of the Grademaxxing gradebook">
				<div class="frame-bar" aria-hidden="true">
					<span class="dot dot-red"></span><span class="dot dot-yellow"></span><span
						class="dot dot-blue"
					></span><span class="frame-url">grademaxxing.local</span>
				</div>
				<div class="frame-image-wrap">
					<img
						src="/demo_dark.png"
						width="1484"
						height="1060"
						alt="Grademaxxing showing a class grade trend and hypothetical assignments"
					/>
				</div>
			</div>
		</section>

		<section id="features" class="feature-grid" aria-label="Grademaxxing features">
			{#each features as { icon: Icon, title, description } (title)}
				<article class="feature-card">
					<div class="feature-icon"><Icon aria-hidden="true" strokeWidth={1.6} /></div>
					<div>
						<h2>{title}</h2>
						<p>{description}</p>
					</div>
				</article>
			{/each}
		</section>

		<section class="showcase" aria-labelledby="context-heading">
			<p class="eyebrow">THE FULL PICTURE</p>
			<h2 id="context-heading">Every number has context.</h2>
			<p class="showcase-subtitle">
				Grademaxxing turns a final percentage into the information you need to act on it.
			</p>

			<div class="detail-grid">
				<article class="detail-card">
					<div class="detail-visual trend-visual" aria-hidden="true">
						<div class="trend-labels"><span>95</span><span>92</span><span>89</span></div>
						<svg viewBox="0 0 300 120" preserveAspectRatio="none">
							<defs
								><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"
									><stop offset="0" stop-color="#4db6f5" stop-opacity="0.28" /><stop
										offset="1"
										stop-color="#4db6f5"
										stop-opacity="0"
									/></linearGradient
								></defs
							>
							<path
								class="trend-fill"
								d="M0,84 L38,62 L76,70 L114,40 L152,48 L190,28 L228,52 L266,36 L300,42 L300,120 L0,120 Z"
							/>
							<path
								class="trend-line"
								d="M0,84 L38,62 L76,70 L114,40 L152,48 L190,28 L228,52 L266,36 L300,42"
							/>
						</svg>
					</div>
					<div class="detail-copy">
						<div class="detail-heading"><ChartLineIcon aria-hidden="true" /> Grade history</div>
						<h3>See what moved your grade.</h3>
						<p>Follow daily snapshots and assignment impact instead of guessing from one total.</p>
					</div>
				</article>

				<article class="detail-card detail-card-featured">
					<div class="detail-visual calculator-visual" aria-hidden="true">
						<div class="calc-top"><span>Target grade</span><strong>93%</strong></div>
						<div class="calc-row">
							<span>Final exam</span>
							<div><strong>47</strong><span>/ 50</span></div>
						</div>
						<div class="impact"><span>Projected impact</span><strong>+0.42%</strong></div>
					</div>
					<div class="detail-copy">
						<div class="detail-heading"><CalculatorIcon aria-hidden="true" /> What-if mode</div>
						<h3>Try the score before the test.</h3>
						<p>Add hypothetical work, change category scores, and calculate what you need next.</p>
					</div>
				</article>

				<article class="detail-card">
					<div class="detail-visual record-visual" aria-hidden="true">
						<div><CalendarDaysIcon /><span>Attendance</span><strong>2 records</strong></div>
						<div><FileTextIcon /><span>Documents</span><strong>4 files</strong></div>
						<div><MailIcon /><span>Mail</span><strong>1 unread</strong></div>
					</div>
					<div class="detail-copy">
						<div class="detail-heading"><HistoryIcon aria-hidden="true" /> School record</div>
						<h3>Keep the rest of school visible.</h3>
						<p>Review attendance details, report cards, documents, and StudentVUE messages.</p>
					</div>
				</article>
			</div>
		</section>

		<section class="privacy-section" aria-labelledby="privacy-heading">
			<div class="privacy-icon"><ShieldCheckIcon aria-hidden="true" strokeWidth={1.5} /></div>
			<div class="privacy-copy">
				<p class="eyebrow">PRIVATE BY DESIGN</p>
				<h2 id="privacy-heading">Your password is never stored.</h2>
				<p>
					Your credentials travel over encrypted HTTPS only to establish your StudentVUE session.
					Grademaxxing keeps the experience local to your browser.
				</p>
			</div>
			<a class="button button-ghost" href="/privacy"
				><LockKeyholeIcon aria-hidden="true" /> Read the privacy details</a
			>
		</section>

		<section class="final-cta" aria-labelledby="cta-heading">
			<img src="/favicon.svg" width="56" height="56" alt="" />
			<h2 id="cta-heading">Your grades should make sense.</h2>
			<p>Connect StudentVUE and see the full picture behind every class.</p>
			<a class="button button-primary button-large" href="/login"
				>Open {brand} <ArrowRightIcon aria-hidden="true" /></a
			>
		</section>
	</main>

	<footer class="landing-footer">
		<div class="footer-wordmark">
			<img src="/favicon.svg" width="22" height="22" alt="" /><span>{brand}</span>
		</div>
		<div class="footer-links">
			<a href="/login">Log in</a><a href="/signup">Sign up</a><a href="/privacy">Privacy</a>
		</div>
		<p>
			StudentVUE is a registered trademark of Edupoint Educational Systems LLC. {brand} is not affiliated
			with or endorsed by Edupoint or any school district.
		</p>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(body) {
		margin: 0;
	}
	.landing-root {
		--bg: #081522;
		--panel: #0d2033;
		--panel2: #132a41;
		--ink: #e4eef8;
		--muted: #8fa9c2;
		--faint: #6f8ba5;
		--line: rgba(228, 238, 248, 0.08);
		--line2: rgba(228, 238, 248, 0.16);
		--accent: #4db6f5;
		--accent-soft: rgba(77, 182, 245, 0.13);
		min-height: 100vh;
		overflow-x: hidden;
		isolation: isolate;
		color: var(--ink);
		font-family: 'Instrument Sans Variable', system-ui, sans-serif;
		font-size: 14.5px;
		line-height: 1.5;
		background:
			radial-gradient(900px 520px at 85% -10%, rgba(91, 142, 245, 0.12), transparent 62%),
			radial-gradient(720px 440px at -12% 14%, rgba(91, 142, 245, 0.08), transparent 60%), var(--bg);
	}
	.landing-nav {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px 40px;
	}
	.wordmark,
	.footer-wordmark {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		color: var(--ink);
		font-family: 'Space Grotesk Variable', sans-serif;
		font-size: 19px;
		font-weight: 700;
		letter-spacing: -0.01em;
		text-decoration: none;
	}
	.wordmark img,
	.footer-wordmark img {
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}
	.wordmark:hover img {
		transform: rotate(-4deg) scale(1.04);
	}
	.accent-word {
		color: var(--accent);
	}
	.nav-actions,
	.hero-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 1px solid var(--line2);
		border-radius: 8px;
		background: var(--panel);
		color: var(--ink);
		padding: 10px 16px;
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		text-decoration: none;
		transition:
			border-color 0.16s ease,
			background 0.16s ease,
			color 0.16s ease,
			filter 0.16s ease,
			transform 0.16s ease;
	}
	.button :global(svg) {
		width: 16px;
		height: 16px;
	}
	.button:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.button:active {
		transform: translateY(0);
	}
	.button:focus-visible,
	.wordmark:focus-visible,
	.landing-footer a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.button-small {
		border-radius: 7px;
		padding: 7px 12px;
		font-size: 12.5px;
	}
	.button-large {
		padding: 12px 22px;
		font-size: 14.5px;
	}
	.button-primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #06131f;
		box-shadow: 0 8px 24px -14px rgba(77, 182, 245, 0.92);
	}
	.button-primary:hover {
		filter: brightness(1.08);
		box-shadow: 0 12px 28px -14px rgba(77, 182, 245, 0.95);
	}
	.button-ghost {
		background: transparent;
		color: var(--muted);
	}
	.button-ghost:hover {
		color: var(--ink);
	}
	.hero {
		position: relative;
		max-width: 1100px;
		margin: 0 auto;
		padding: 72px 40px 0;
		text-align: center;
	}
	.hero::before {
		position: absolute;
		z-index: -1;
		top: -86px;
		left: 50%;
		width: min(760px, 92vw);
		height: 430px;
		transform: translateX(-50%);
		background: radial-gradient(circle, rgba(77, 182, 245, 0.085), transparent 68%);
		content: '';
		pointer-events: none;
	}
	.hero h1,
	.showcase h2,
	.privacy-section h2,
	.final-cta h2 {
		font-family: 'Space Grotesk Variable', sans-serif;
		font-weight: 700;
		letter-spacing: -0.03em;
	}
	.hero h1 {
		margin: 14px 0 18px;
		font-size: clamp(38px, 5.5vw, 54px);
		line-height: 1.08;
		text-wrap: balance;
	}
	.hero-subtitle {
		max-width: 650px;
		margin: 0 auto 30px;
		color: var(--muted);
		font-size: 17px;
		line-height: 1.6;
		text-wrap: pretty;
	}
	.hero-actions {
		justify-content: center;
		flex-wrap: wrap;
		gap: 12px;
	}
	.studentvue-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		background: rgba(77, 182, 245, 0.06);
		color: var(--accent);
		padding: 3px 9px;
		font-size: 11.5px;
		font-weight: 600;
	}
	.studentvue-pill :global(svg) {
		width: 13px;
		height: 13px;
	}
	.human-line {
		margin-top: 14px;
		color: var(--muted);
		font-size: 13px;
	}
	.product-frame {
		position: relative;
		max-width: 880px;
		margin: 52px auto 0;
		overflow: hidden;
		border: 1px solid var(--line2);
		border-radius: 14px;
		background: var(--panel);
		box-shadow:
			0 24px 70px rgba(11, 125, 194, 0.16),
			0 8px 24px rgba(0, 0, 0, 0.3);
		text-align: left;
	}
	.product-frame::after {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		box-shadow: inset 0 1px rgba(255, 255, 255, 0.08);
		content: '';
		pointer-events: none;
	}
	.frame-bar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--line);
		background: var(--panel2);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.dot-red {
		background: #f26d6d;
	}
	.dot-yellow {
		background: #f0c05a;
	}
	.dot-blue {
		background: #4db6f5;
	}
	.frame-url {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--panel);
		color: var(--faint);
		padding: 3px 24px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
	}
	.frame-image-wrap {
		position: relative;
		isolation: isolate;
		aspect-ratio: 16/9;
		overflow: hidden;
		background: #0b1718;
	}
	.frame-image-wrap::after {
		position: absolute;
		inset: 0;
		background: var(--accent);
		content: '';
		mix-blend-mode: color;
		pointer-events: none;
	}
	.frame-image-wrap img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
	}
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
		max-width: 1100px;
		margin: 44px auto 0;
		padding: 0 40px;
		scroll-margin-top: 24px;
	}
	.feature-card {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--panel);
		padding: 16px;
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.4),
			0 8px 24px rgba(0, 0, 0, 0.3);
		text-align: left;
		transition:
			transform 0.18s ease,
			border-color 0.18s ease;
	}
	.feature-card:hover {
		transform: translateY(-3px);
		border-color: rgba(77, 182, 245, 0.65);
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.4),
			0 14px 30px rgba(0, 0, 0, 0.34);
	}
	.feature-icon {
		display: grid;
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		place-items: center;
		border-radius: 10px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.feature-icon :global(svg) {
		width: 18px;
		height: 18px;
	}
	.feature-card h2 {
		margin: 1px 0 3px;
		font-family: 'Space Grotesk Variable', sans-serif;
		font-size: 14.5px;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.feature-card p {
		margin: 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
		text-wrap: pretty;
	}
	.showcase {
		max-width: 1100px;
		margin: 96px auto 0;
		padding: 0 40px;
		text-align: center;
	}
	.eyebrow {
		margin: 0 0 8px;
		color: var(--accent);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
	}
	.showcase h2,
	.privacy-section h2,
	.final-cta h2 {
		margin: 0;
		font-size: 28px;
		line-height: 1.18;
	}
	.showcase-subtitle {
		max-width: 580px;
		margin: 12px auto 0;
		color: var(--muted);
		font-size: 14.5px;
		text-wrap: pretty;
	}
	.detail-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: stretch;
		gap: 20px;
		margin-top: 36px;
		perspective: 1500px;
	}
	.detail-card {
		display: flex;
		min-width: 0;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 18px;
		background: var(--panel);
		box-shadow: 0 24px 50px -30px rgba(0, 0, 0, 0.9);
		text-align: left;
		transform: perspective(1200px) rotateY(4deg) translateZ(-18px);
		transition:
			transform 0.32s ease,
			border-color 0.22s ease;
	}
	.detail-card:last-child {
		transform: perspective(1200px) rotateY(-4deg) translateZ(-18px);
	}
	.detail-card-featured {
		border-color: var(--accent);
		transform: translateZ(18px);
	}
	.detail-card:hover,
	.detail-card:last-child:hover,
	.detail-card-featured:hover {
		border-color: var(--accent);
		transform: translateY(-4px);
	}
	.detail-visual {
		height: 190px;
		border-bottom: 1px solid var(--line);
		background: #091827;
	}
	.trend-visual {
		position: relative;
		padding: 28px 24px 20px 42px;
		background:
			linear-gradient(rgba(228, 238, 248, 0.05) 1px, transparent 1px) 0 28px/100% 42px,
			#091827;
	}
	.trend-labels {
		position: absolute;
		top: 26px;
		bottom: 22px;
		left: 15px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		color: var(--faint);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 8px;
	}
	.trend-visual svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.trend-fill {
		fill: url(#trend-fill);
	}
	.trend-line {
		fill: none;
		stroke: var(--accent);
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}
	.calculator-visual {
		display: flex;
		flex-direction: column;
		gap: 12px;
		justify-content: center;
		padding: 24px;
		background:
			radial-gradient(circle at 50% 0%, rgba(77, 182, 245, 0.12), transparent 68%), #091827;
	}
	.calc-top,
	.impact,
	.calc-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.calc-top,
	.impact {
		color: var(--muted);
		font-size: 12px;
	}
	.calc-top strong {
		color: var(--ink);
		font-family: 'Space Grotesk Variable', sans-serif;
		font-size: 18px;
	}
	.calc-row {
		border: 1px solid var(--line2);
		border-radius: 10px;
		background: var(--panel);
		padding: 14px;
		font-size: 13px;
		font-weight: 600;
	}
	.calc-row div {
		display: flex;
		align-items: baseline;
		gap: 4px;
	}
	.calc-row strong {
		border: 1px solid var(--accent);
		border-radius: 6px;
		color: var(--accent);
		padding: 3px 7px;
	}
	.calc-row div span {
		color: var(--faint);
		font-size: 11px;
	}
	.impact strong {
		color: var(--accent);
	}
	.record-visual {
		display: flex;
		flex-direction: column;
		gap: 8px;
		justify-content: center;
		padding: 24px;
	}
	.record-visual div {
		display: grid;
		grid-template-columns: 28px 1fr auto;
		align-items: center;
		gap: 10px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--panel);
		padding: 10px 12px;
		font-size: 12px;
		font-weight: 600;
	}
	.record-visual :global(svg) {
		width: 17px;
		height: 17px;
		color: var(--accent);
	}
	.record-visual strong {
		color: var(--muted);
		font-size: 10.5px;
		font-weight: 500;
	}
	.detail-copy {
		padding: 24px;
	}
	.detail-heading {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-bottom: 12px;
		color: var(--accent);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.detail-heading :global(svg) {
		width: 15px;
		height: 15px;
	}
	.detail-copy h3 {
		margin: 0 0 8px;
		font-family: 'Space Grotesk Variable', sans-serif;
		font-size: 18px;
		line-height: 1.25;
	}
	.detail-copy p {
		margin: 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
		text-wrap: pretty;
	}
	.privacy-section {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 24px;
		max-width: 1020px;
		margin: 88px auto 0;
		border: 1px solid var(--line);
		border-radius: 18px;
		background: linear-gradient(135deg, rgba(77, 182, 245, 0.1), transparent 55%), var(--panel);
		padding: 28px 30px;
		box-shadow: 0 24px 60px -38px rgba(77, 182, 245, 0.8);
	}
	.privacy-icon {
		display: grid;
		width: 58px;
		height: 58px;
		place-items: center;
		border: 1px solid rgba(77, 182, 245, 0.32);
		border-radius: 15px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.privacy-icon :global(svg) {
		width: 28px;
		height: 28px;
	}
	.privacy-copy h2 {
		font-size: 22px;
		letter-spacing: -0.02em;
	}
	.privacy-copy p:last-child {
		max-width: 610px;
		margin: 8px 0 0;
		color: var(--muted);
		font-size: 13px;
		text-wrap: pretty;
	}
	.final-cta {
		display: flex;
		align-items: center;
		flex-direction: column;
		max-width: 760px;
		margin: 108px auto 0;
		padding: 0 24px;
		text-align: center;
	}
	.final-cta img {
		margin-bottom: 22px;
		filter: drop-shadow(0 14px 30px rgba(77, 182, 245, 0.25));
	}
	.final-cta h2 {
		font-size: 32px;
	}
	.final-cta p {
		margin: 12px 0 24px;
		color: var(--muted);
		font-size: 15px;
		text-wrap: pretty;
	}
	.landing-footer {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 18px 28px;
		max-width: 1020px;
		margin: 96px auto 0;
		border-top: 1px solid var(--line);
		padding: 30px 0 40px;
		color: var(--faint);
		font-size: 11.5px;
	}
	.footer-wordmark {
		font-size: 15px;
	}
	.footer-links {
		display: flex;
		justify-content: flex-end;
		gap: 18px;
	}
	.footer-links a {
		color: var(--muted);
		font-weight: 600;
		text-decoration: none;
	}
	.footer-links a:hover {
		color: var(--accent);
	}
	.landing-footer p {
		grid-column: 1/-1;
		margin: 0;
		line-height: 1.5;
	}

	@media (max-width: 900px) {
		.feature-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.detail-grid {
			grid-template-columns: 1fr;
			max-width: 620px;
			margin-right: auto;
			margin-left: auto;
		}
		.detail-card,
		.detail-card:last-child,
		.detail-card-featured {
			transform: none;
		}
		.privacy-section {
			grid-template-columns: auto minmax(0, 1fr);
			margin-right: 24px;
			margin-left: 24px;
		}
		.privacy-section .button {
			grid-column: 2;
			justify-self: start;
		}
		.landing-footer {
			margin-right: 24px;
			margin-left: 24px;
		}
	}
	@media (max-width: 600px) {
		.landing-nav {
			padding: 14px 16px;
		}
		.wordmark {
			font-size: 16px;
		}
		.wordmark img {
			width: 26px;
			height: 26px;
		}
		.nav-actions {
			gap: 7px;
		}
		.button-small {
			padding: 7px 10px;
		}
		.hero {
			padding: 44px 16px 0;
		}
		.hero h1 {
			font-size: clamp(36px, 10.25vw, 40px);
		}
		.hero-subtitle {
			font-size: 15px;
		}
		.hero-actions {
			align-items: stretch;
			flex-direction: column;
			max-width: 290px;
			margin: 0 auto;
		}
		.product-frame {
			margin-top: 36px;
			border-radius: 12px;
		}
		.frame-url {
			padding: 3px 16px;
			font-size: 10px;
		}
		.frame-image-wrap {
			aspect-ratio: 4/3;
		}
		.frame-image-wrap img {
			width: auto;
			max-width: none;
			object-fit: cover;
			object-position: 28% top;
		}
		.feature-grid {
			grid-template-columns: 1fr;
			margin-top: 30px;
			padding: 0 16px;
		}
		.feature-card:hover {
			transform: none;
		}
		.showcase {
			margin-top: 78px;
			padding: 0 16px;
		}
		.showcase h2 {
			font-size: 25px;
		}
		.detail-grid {
			gap: 14px;
			margin-top: 28px;
		}
		.detail-visual {
			height: 170px;
		}
		.privacy-section {
			grid-template-columns: 1fr;
			gap: 18px;
			margin-top: 72px;
			padding: 24px;
			text-align: left;
		}
		.privacy-section .button {
			grid-column: 1;
			justify-self: stretch;
		}
		.final-cta {
			margin-top: 88px;
		}
		.final-cta h2 {
			font-size: 28px;
		}
		.landing-footer {
			grid-template-columns: 1fr;
			margin-top: 76px;
			padding-bottom: 30px;
			text-align: center;
		}
		.footer-wordmark,
		.footer-links {
			justify-content: center;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		.button,
		.wordmark img,
		.feature-card,
		.detail-card {
			transition: none;
		}
	}
</style>

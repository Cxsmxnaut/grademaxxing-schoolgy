<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import '$lib/components/landing/landing.css';
	import { LocalStorageKey } from '$lib/storage/keys';
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
			description:
				'See the assignments and changes behind every percentage. One total is rarely the whole story.'
		},
		{
			icon: CalculatorIcon,
			title: 'What-if calculator',
			description:
				'Test a final, missing assignment, or target grade before it happens. This is a simulation, not a prophecy.'
		},
		{
			icon: CalendarDaysIcon,
			title: 'Attendance detail',
			description:
				'Review absences, tardies, activities, dates, and class periods. The useful details are all here.'
		},
		{
			icon: FileTextIcon,
			title: 'Records in one place',
			description:
				'Keep StudentVUE documents, report cards, and mail within reach. One less portal maze.'
		}
	];
</script>

<svelte:head>
	<title>{brand} — gradebook without the maze</title>
	<meta
		name="description"
		content="Understand StudentVUE grades with trends, category math, what-if scores, attendance, documents, and mail."
	/>
</svelte:head>

<div class="landing-root">
	<nav class="landing-nav" aria-label="Primary navigation">
		<a class="wordmark" href="/" aria-label="{brand} home">
			<img src="/grademaxxing-growth-mark.png" width="32" height="32" alt="" />
			<span>Grade<span class="accent-word">maxxing</span></span>
		</a>
		<div class="nav-actions">
			<a class="button button-ghost button-small" href="/login">Log in</a>
		</div>
	</nav>

	<main>
		<section class="hero" aria-labelledby="landing-title">
			<h1 id="landing-title">Your grades are complicated enough.</h1>
			<p class="hero-subtitle">
				Grade trends, category math, what-if scores, attendance, documents, and mail. StudentVUE,
				with less maze.
			</p>
			<div class="hero-actions">
				<a class="button button-primary button-large" href="/login">
					Sign in with StudentVUE <ArrowRightIcon aria-hidden="true" />
				</a>
				<a class="button button-ghost button-large" href="#features">See what it actually does</a>
			</div>
			<div class="studentvue-pill">
				<RefreshCwIcon aria-hidden="true" /> Syncs directly with your district. Because apparently one
				portal wasn't enough.
			</div>
			<p class="human-line">No pep talk. Just the school data you actually need.</p>

			<div class="product-frame" aria-label={`Preview of the ${brand} gradebook`}>
				<div class="frame-bar" aria-hidden="true">
					<span class="dot dot-red"></span><span class="dot dot-yellow"></span><span
						class="dot dot-green"
					></span><span class="frame-url">grademaxxing.app/grades</span>
				</div>
				<div class="frame-image-wrap">
					<img
						src="/gradebook-preview-dark-v3.png"
						width="1440"
						height="900"
						alt={`${brand} gradebook screenshot with sample grades, GPA summary, courses, and recent assignments`}
					/>
				</div>
			</div>
		</section>

		<section id="features" class="feature-grid" aria-label={`${brand} features`}>
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
			<p class="eyebrow">THE USEFUL PART</p>
			<h2 id="context-heading">A percentage is not a plan.</h2>
			<p class="showcase-subtitle">
				{brand} turns a final percentage into the information you need to act on it.
			</p>

			<div class="detail-grid">
				<article class="detail-card">
					<div class="detail-visual trend-visual" aria-hidden="true">
						<div class="trend-labels"><span>95</span><span>92</span><span>89</span></div>
						<svg viewBox="0 0 300 120" preserveAspectRatio="none">
							<defs
								><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"
									><stop offset="0" stop-color="#6ea8dc" stop-opacity="0.24" /><stop
										offset="1"
										stop-color="#6ea8dc"
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
						<h3>See what actually moved it.</h3>
						<p>
							Follow daily snapshots and assignment impact. Guessing from one total is optional.
						</p>
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
						<p>
							Add hypothetical work, change category scores, and calculate what you need next. Time
							travel, basically.
						</p>
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
						<h3>The rest of school is here too.</h3>
						<p>Attendance, report cards, documents, and messages. One less maze to open.</p>
					</div>
				</article>
			</div>
		</section>

		<section class="privacy-section" aria-labelledby="privacy-heading">
			<div class="privacy-icon"><ShieldCheckIcon aria-hidden="true" strokeWidth={1.5} /></div>
			<div class="privacy-copy">
				<p class="eyebrow">PRIVATE BY DESIGN</p>
				<h2 id="privacy-heading">Your password stays encrypted on your device.</h2>
				<p>
					Your credentials travel over encrypted HTTPS to establish your StudentVUE session. If you
					choose to stay signed in, the password is encrypted locally and never stored on our
					servers.
				</p>
			</div>
			<a class="button button-ghost" href="/privacy"
				><LockKeyholeIcon aria-hidden="true" /> Read the privacy details</a
			>
		</section>

		<section class="final-cta" aria-labelledby="cta-heading">
			<img src="/grademaxxing-growth-mark.png" width="64" height="64" alt="" />
			<h2 id="cta-heading">Your grades are already enough of a puzzle.</h2>
			<p>Connect StudentVUE. We'll do the sorting.</p>
			<a class="button button-primary button-large" href="/login"
				>Open {brand} <ArrowRightIcon aria-hidden="true" /></a
			>
		</section>
	</main>

	<footer class="landing-footer">
		<div class="footer-wordmark">
			<img src="/grademaxxing-growth-mark.png" width="24" height="24" alt="" /><span>{brand}</span>
		</div>
		<div class="footer-links">
			<a href="/login">Log in</a><a href="/privacy">Privacy</a>
		</div>
		<p>
			StudentVUE is a registered trademark of Edupoint Educational Systems LLC. {brand} is not affiliated
			with or endorsed by Edupoint or any school district.
		</p>
	</footer>
</div>

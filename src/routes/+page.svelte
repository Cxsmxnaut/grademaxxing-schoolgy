<script lang="ts">
	import { goto } from '$app/navigation';
	import { brand } from '$lib/brand';
	import { recordPublicEvent } from '$lib/analytics/public-client';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import '$lib/components/landing/landing.css';
	import { LocalStorageKey } from '$lib/storage/keys';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { onMount } from 'svelte';

	const introduction = `${brand} turns a final percentage into the information you actually need — grade trends, category math, and what-if scores, so you always know what to do next.`;
	let hero: HTMLElement;
	let wordStage: HTMLDivElement;
	let heroProgress = $state(0);
	let wordProgress = $state(1);

	onMount(() => {
		recordPublicEvent('page_view', '/');
		if (localStorage.getItem(LocalStorageKey.token) !== null) {
			void goto('/grades');
		}
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		let frame = 0;
		const measure = () => {
			frame = 0;
			const rect = hero.getBoundingClientRect();
			heroProgress = motion.matches
				? 0
				: Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - innerHeight * 0.2)));
			const range = wordStage.offsetHeight - innerHeight;
			wordProgress =
				motion.matches || range <= 0
					? 1
					: Math.max(0, Math.min(1, -wordStage.getBoundingClientRect().top / range));
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		measure();
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		motion.addEventListener('change', schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			motion.removeEventListener('change', schedule);
		};
	});

	const previews = [
		{
			image: 'gradebook',
			label: 'Your grades, together',
			alt: 'Six sample courses with letter grades and percentages',
			height: 852
		},
		{
			image: 'trends',
			label: 'See your grade trend',
			alt: 'A sample course grade and its complete trend chart',
			height: 384
		},
		{
			image: 'what-if',
			label: 'Try a what-if score',
			alt: 'Hypothetical mode with an estimated grade and a sample what-if assignment',
			height: 738
		},
		{
			image: 'attendance',
			label: 'Understand attendance',
			alt: 'A sample attendance record showing an arrival marked tardy',
			height: 206
		},
		{
			image: 'documents',
			label: 'Find your school documents',
			alt: 'Sample progress reports, schedule confirmation, and unofficial transcript',
			height: 425
		},
		{
			image: 'mail',
			label: 'Read school messages',
			alt: 'A sample inbox with school messages and an attachment',
			height: 851
		},
		{
			image: 'gpa',
			label: 'Explore your projected GPA',
			alt: 'Projected GPA estimates, policy disclaimer, and hypothetical course-grade controls',
			height: 765
		}
	];
	const steps = [
		{
			title: 'Connect StudentVUE',
			body: 'Sign in with your existing account to read grades, attendance, documents, and mail from your district’s portal.',
			image: 'login-connect'
		},
		{
			title: 'See the real math',
			body: 'Follow dated assignments and watch each new score move the chart — no more guessing what changed your grade.',
			image: 'course-grade-trend'
		},
		{
			title: 'Try the what-if scores',
			body: 'Add hypothetical work, change category scores, and explore what you need next. Estimates stay separate from official grades.',
			image: 'what-if-calculator'
		}
	];
	const features = [
		{
			title: 'Grade trends',
			body: 'See your grade changes across assignments, and try out what-if scores on the chart.',
			image: 'course-grade-trend',
			alt: 'Sample course view with a rising grade trend chart'
		},
		{
			title: 'What-if calculator',
			body: 'Test a final, missing assignment, or target grade before it happens. This is a simulation, not a prophecy.',
			image: 'what-if-calculator',
			alt: 'Sample hypothetical mode with a what-if assignment added'
		},
		{
			title: 'Attendance detail',
			body: 'Review absences, tardies, activities, dates, and class periods. The useful details are all here.',
			image: 'attendance-detail',
			alt: 'Sample attendance calendar and records'
		},
		{
			title: 'Records in one place',
			body: 'Keep StudentVUE documents, report cards, and mail within reach. One less portal maze.',
			image: 'records-documents',
			alt: 'Sample document library with report cards and transcripts'
		}
	];
	const audiences = [
		{
			icon: GraduationCapIcon,
			title: 'Grade trackers',
			body: 'Watch every assignment move the line, and understand what changed your grade.'
		},
		{
			icon: ChartLineIcon,
			title: 'College applicants',
			body: 'Explore your projected GPA and grade trends without confusing estimates with official records.'
		},
		{
			icon: CalculatorIcon,
			title: 'Test takers',
			body: 'Run the what-if numbers before the exam and walk in knowing your target.'
		},
		{
			icon: CalendarDaysIcon,
			title: 'Attendance watchers',
			body: 'See absences, tardies, and class periods by name — before they become a surprise.'
		},
		{
			icon: FileTextIcon,
			title: 'Record keepers',
			body: 'Report cards, documents, and school mail in one place instead of five tabs.'
		},
		{
			icon: MailIcon,
			title: 'Message readers',
			body: 'Read school messages and attachments alongside the rest of your school record.'
		}
	];
	const faqs = [
		{
			q: 'What is Grademaxxing?',
			a: 'A calmer, read-only layer on top of StudentVUE. Grade trends, category math, what-if scores, attendance, documents, and mail — in one place, without the maze.'
		},
		{
			q: 'Does it work with my school?',
			a: 'Grademaxxing connects to StudentVUE portals using your existing account. Availability depends on your district’s portal and the records it exposes; not every district configuration has been verified.'
		},
		{
			q: 'Is my password safe?',
			a: 'Your credentials travel over encrypted HTTPS to establish your StudentVUE session, then the server discards the password. If you choose to stay signed in, saved credentials are encrypted locally on this device. Read the privacy details for more information.'
		},
		{
			q: 'Do you change or store my grades?',
			a: 'Grademaxxing cannot change school records, submit assignments, or send mail. Grade data may be cached on your device. What-if scores are local simulations and never replace official grades.'
		},
		{
			q: 'Is Grademaxxing free?',
			a: 'Grademaxxing is free to use, including grade trends, what-if scores, attendance, documents, and mail when your portal provides them.'
		},
		{
			q: 'What’s a what-if score?',
			a: 'A hypothetical. Add an assignment you haven’t done yet — or a final you’re dreading — and estimate how it would move your grade before it happens.'
		},
		{
			q: 'Does it work on my phone?',
			a: 'Yes — Grademaxxing is a website, so you can use it in a modern browser on your phone, tablet, or laptop. Nothing to install.'
		},
		{
			q: 'Can parents use it too?',
			a: 'Grademaxxing is designed for StudentVUE accounts. ParentVUE accounts and multi-student switching are not currently supported.'
		}
	];
</script>

<PageMeta path="/" />

<div class="landing-root">
	<a class="landing-skip" href="#landing-main">Skip to content</a>
	<nav class="landing-nav" aria-label="Primary navigation">
		<div class="landing-nav-inner">
			<a class="wordmark" href="/" aria-label="Grademaxxing home"
				><img src="/brand-mark-48.webp" width="24" height="24" alt="" /><span
					>Grade<span class="accent-word">maxxing</span></span
				></a
			>
			<div class="landing-nav-links">
				<a href="/calculators">Calculators</a><a href="/demo">Try a demo</a><a href="#why"
					>Features</a
				><a href="#faq">FAQ</a>
			</div>
			<a
				class="landing-login"
				href="/login"
				onclick={() => recordPublicEvent('connection_start', '/')}>Log in</a
			>
		</div>
	</nav>
	<main id="landing-main">
		<section bind:this={hero} class="landing-hero" aria-labelledby="landing-title">
			<div class="landing-hero-copy">
				<h1 id="landing-title">Understand your StudentVUE grades.</h1>
				<p>
					Grade trends, category math, what-if scores, attendance, documents, and mail. StudentVUE,
					with less maze.
				</p>
				<a
					class="landing-cta"
					href="/login"
					onclick={() => recordPublicEvent('connection_start', '/')}>Open Grademaxxing</a
				>
				<a class="landing-demo-link" href="/demo">Try fictional grades first →</a>
				<div class="landing-pill">Read-only StudentVUE companion</div>
			</div>
			<div class="landing-hero-preview" aria-label="Preview of the Grademaxxing gradebook">
				<img
					class="landing-overview"
					src="/landing/optimized-large/gradebook-overview.webp"
					srcset="/landing/optimized-small/gradebook-overview.webp 640w, /landing/optimized-large/gradebook-overview.webp 1200w"
					sizes="(max-width: 885px) calc(100vw - 48px), 837px"
					fetchpriority="high"
					width="1440"
					height="900"
					alt="Grademaxxing gradebook with synthetic sample grades, GPA summary, and courses"
					style:transform="translateY({heroProgress * 38}px) scale({1 - heroProgress * 0.018})"
				/>
				<img
					class="landing-hills"
					src="/landing/optimized-large/hills-foreground3-cn7rvjta.webp"
					srcset="/landing/optimized-small/hills-foreground3-cn7rvjta.webp 640w, /landing/optimized-large/hills-foreground3-cn7rvjta.webp 1200w"
					sizes="110vw"
					decoding="async"
					width="4320"
					height="1635"
					alt=""
					aria-hidden="true"
				/>
			</div>
		</section>
		<div bind:this={wordStage} class="landing-word-stage">
			<div class="landing-word-sticky">
				<p>
					<span class="sr-only">{introduction}</span>
					{#each introduction.split(' ') as word, i (i)}
						{@const progress = Math.max(
							0,
							Math.min(
								1,
								(wordProgress - i / introduction.split(' ').length) * introduction.split(' ').length
							)
						)}
						<span
							aria-hidden="true"
							style:opacity={0.12 + 0.88 * progress}
							style:filter="blur({6 * (1 - progress)}px)"
							style:transform="translateY({16 * (1 - progress)}px)">{word + '\u00a0'}</span
						>{/each}
				</p>
			</div>
		</div>
		<section id="calculators" class="landing-section landing-tools" aria-labelledby="tools-heading">
			<header class="landing-section-heading">
				<h2 id="tools-heading">Plan your next score. No sign-in needed.</h2>
				<p>
					Use the grading model from your class. Every result shows its assumptions and stays
					separate from your official school record.
				</p>
			</header>
			<div class="landing-tool-list">
				<a href="/calculators/assignment-impact"
					><h3>Assignment impact</h3>
					<p>See what a new or replacement score changes, including weighted categories.</p>
					<span>Calculate assignment impact →</span></a
				>
				<a href="/calculators/final-grade"
					><h3>Final exam target</h3>
					<p>Find the score you need when the final has a fixed share of your course grade.</p>
					<span>Calculate your final score →</span></a
				>
				<a href="/calculators/weighted-grade"
					><h3>Weighted grade</h3>
					<p>Combine category percentages with explicit weights and normalization.</p>
					<span>Calculate a weighted grade →</span></a
				>
				<a href="/calculators/gpa"
					><h3>GPA with your policy</h3>
					<p>Choose grade points, course credits and rigor bonuses for your estimate.</p>
					<span>Estimate your GPA →</span></a
				>
			</div>
			<p class="landing-tools-guide">
				<a href="/studentvue-grade-calculator">Explore the StudentVUE grade planner</a> ·
				<a href="/guides/studentvue-grade-calculation">Understand grade calculations</a>
				· <a href="/methodology/grade-calculations">Check our math</a>
			</p>
		</section>
		<section id="showcase" class="landing-section" aria-labelledby="context-heading">
			<header class="landing-section-heading">
				<p class="landing-eyebrow">THE USEFUL PART</p>
				<h2 id="context-heading">A percentage is not a plan.</h2>
				<p>Grademaxxing turns a final percentage into the information you need to act on it.</p>
			</header>
			<div role="region" aria-label="Feature previews" class="landing-showcase-grid">
				{#each previews as preview (preview.image)}
					<figure>
						<figcaption>{preview.label}</figcaption>
						<img
							src="/landing/optimized-large/showcase-{preview.image}.webp"
							srcset="/landing/optimized-small/showcase-{preview.image}.webp 640w, /landing/optimized-large/showcase-{preview.image}.webp 1200w"
							sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1100px) 45vw, 500px"
							decoding="async"
							alt={preview.alt}
							width="1200"
							height={preview.height}
							loading="lazy"
						/>
					</figure>
				{/each}
			</div>
			<p class="landing-sample-note">
				All previews use fictional sample records. Projected grades and GPA are estimates, not
				school records.
			</p>
		</section>
		<section id="how-it-works" class="landing-section landing-steps" aria-label="How it works">
			{#each steps as step, i (step.title)}
				<article style:--step={i}>
					<div>
						<p class="landing-eyebrow">0{i + 1}</p>
						<h2>{step.title}</h2>
						<p>{step.body}</p>
					</div>
					<img
						src="/landing/optimized-large/{step.image}.webp"
						srcset="/landing/optimized-small/{step.image}.webp 640w, /landing/optimized-large/{step.image}.webp 1200w"
						sizes="(max-width: 900px) calc(100vw - 112px), 50vw"
						decoding="async"
						width="2880"
						height="1800"
						loading="lazy"
						alt={step.title + ' — synthetic app preview'}
					/>
				</article>
			{/each}
		</section>
		<section id="why" class="landing-section" aria-labelledby="why-heading">
			<header class="landing-section-heading">
				<p class="landing-eyebrow">WHY GRADEMAXXING</p>
				<h2 id="why-heading">No pep talk. Just the school data you actually need.</h2>
			</header>
			<div class="landing-feature-grid">
				{#each features as feature (feature.title)}<article>
						<div>
							<h3>{feature.title}</h3>
							<p>{feature.body}</p>
						</div>
						<img
							src="/landing/optimized-large/{feature.image}.webp"
							srcset="/landing/optimized-small/{feature.image}.webp 640w, /landing/optimized-large/{feature.image}.webp 1200w"
							sizes="(max-width: 767px) calc(100vw - 48px), 50vw"
							decoding="async"
							alt={feature.alt}
							loading="lazy"
							width="2880"
							height="1800"
						/>
					</article>{/each}
			</div>
		</section>
		<section id="who-its-for" class="landing-section" aria-labelledby="audience-heading">
			<header class="landing-section-heading">
				<h2 id="audience-heading">Built for every kind of student</h2>
				<p>
					However you do school, Grademaxxing turns the portal maze into data you can actually use.
				</p>
			</header>
			<div class="landing-audience-grid">
				{#each audiences as { icon: Icon, title, body } (title)}<article>
						<div class="landing-audience-icon"><Icon size={23} aria-hidden="true" /></div>
						<h3>{title}</h3>
						<p>{body}</p>
					</article>{/each}
			</div>
		</section>
		<section id="faq" class="landing-section landing-faq" aria-labelledby="faq-heading">
			<header class="landing-section-heading">
				<p class="landing-eyebrow">FAQ</p>
				<h2 id="faq-heading">Questions, answered</h2>
			</header>
			{#each faqs as faq (faq.q)}<details>
					<summary>{faq.q}<span class="dt-faq-icon" aria-hidden="true">+</span></summary>
					<div>
						{faq.a}{#if faq.q === 'Is my password safe?'}
							<a href="/privacy">Read the privacy details</a>{/if}
					</div>
				</details>{/each}
		</section>
	</main>
	<footer class="landing-footer">
		<section class="landing-final-cta" aria-labelledby="cta-heading">
			<div>
				<img
					src="/brand-mark-224.webp"
					width="112"
					height="112"
					alt=""
					loading="lazy"
					decoding="async"
				/>
				<h2 id="cta-heading">Your grades are already enough of a puzzle.</h2>
				<p>Connect StudentVUE. We’ll do the sorting.</p>
				<a
					class="landing-cta"
					href="/login"
					onclick={() => recordPublicEvent('connection_start', '/')}>Open Grademaxxing</a
				>
			</div>
			<img
				class="landing-hills"
				src="/landing/optimized-large/hills-foreground3-cn7rvjta.webp"
				srcset="/landing/optimized-small/hills-foreground3-cn7rvjta.webp 640w, /landing/optimized-large/hills-foreground3-cn7rvjta.webp 1200w"
				sizes="110vw"
				decoding="async"
				width="4320"
				height="1635"
				alt=""
				loading="lazy"
				aria-hidden="true"
			/>
		</section>
		<div class="landing-footer-links">
			<span>© 2026 Grademaxxing</span><a href="/calculators">Calculators</a><a href="/demo">Demo</a
			><a href="/about">About</a><a href="/studentvue-compatibility">Compatibility</a><a
				href="/privacy">Privacy</a
			>
		</div>
		<p class="landing-legal">
			StudentVUE is a registered trademark of Edupoint Educational Systems LLC. Grademaxxing is not
			affiliated with or endorsed by Edupoint or any school district.
		</p>
	</footer>
</div>

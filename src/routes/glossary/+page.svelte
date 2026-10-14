<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';

	const description =
		'A plain-language glossary of grading and StudentVUE terms — reporting periods, category weights, what-if scores, impact deltas, and how Grademaxxing keeps estimates separate from official grades.';
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: `Glossary - ${brand}`,
		url: 'https://grademaxxing.app/glossary',
		description
	};

	const terms = [
		{
			term: 'StudentVUE',
			definition:
				'The student grade portal from Edupoint Educational Systems that many districts use, and the only source Grademaxxing reads from.'
		},
		{
			term: 'Reporting period',
			definition:
				'The quarter, trimester, or semester window that grades are reported in. Your gradebook view is scoped to one reporting period at a time.'
		},
		{
			term: 'Category',
			definition:
				'A weighted group of assignments inside a course — homework, quizzes, tests, and so on. Categories are how your district decides what counts.'
		},
		{
			term: 'Category weight',
			definition:
				'How much a category counts toward your course grade. A category worth 40% moves your grade more than one worth 10%.'
		},
		{
			term: 'Points possible and percentage',
			definition:
				'The maximum points on an assignment (points possible), the points you earned, and the resulting percentage for the assignment or the course.'
		},
		{
			term: 'What-if score',
			definition:
				'A hypothetical grade you have not earned yet. Grademaxxing simulates its impact locally so you can plan; it never changes your official record.'
		},
		{
			term: 'Grade trend',
			definition:
				'Your course percentage plotted across dated assignments, so you can see what actually moved the line.'
		},
		{
			term: 'Impact delta',
			definition:
				'How much a newly posted assignment moved your course average — for example, +0.42% or −1.15%.'
		},
		{
			term: 'Tardy',
			definition:
				'A late arrival recorded in attendance, shown alongside absences and activities with dates and class periods.'
		},
		{
			term: 'Estimate versus official',
			definition:
				'Every projected, hypothetical, or simulated number in Grademaxxing is labeled as an estimate. Letter grades and percentages that come straight from StudentVUE are the official values your school reports.'
		}
	];
</script>

<SeoHead title="Glossary - {brand}" {description} {jsonLd} />

<AuthShell promo={false}>
	<article class="text-foreground w-full max-w-[46rem] py-2 sm:py-8">
		<AuthPanelHeader />
		<p class="text-primary mb-2 text-xs font-bold tracking-[0.14em] uppercase">Glossary</p>
		<h1
			class="mb-4 text-3xl font-bold tracking-[-0.03em]"
			style="font-family: 'Outfit', sans-serif"
		>
			Grade and StudentVUE terms, in plain language
		</h1>
		<p class="text-muted-foreground mb-10 max-w-2xl text-base leading-7">
			The vocabulary Grademaxxing uses. Official values come from your school; everything
			Grademaxxing calculates on top is labeled as an estimate.
		</p>

		<div class="text-muted-foreground space-y-9 text-[0.9375rem] leading-7">
			{#each terms as { term, definition } (term)}
				<section>
					<h2 class="text-foreground mb-2 text-lg font-semibold">{term}</h2>
					<p>{definition}</p>
				</section>
			{/each}
		</div>

		<footer class="text-muted-foreground mt-10 text-xs leading-relaxed">
			<a href="/" class="text-link hover:brightness-110">Home</a><span aria-hidden="true">
				·
			</span><a href="/privacy" class="text-link hover:brightness-110">Privacy</a><span
				aria-hidden="true"
			>
				·
			</span><a href="/glossary" aria-current="page" class="text-link hover:brightness-110"
				>Glossary</a
			>
		</footer>
	</article>
</AuthShell>

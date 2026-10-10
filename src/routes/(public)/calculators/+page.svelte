<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	const tools = [
		{
			path: '/calculators/final-grade',
			title: 'Final grade',
			question: 'What score do I need on my final?',
			detail: 'A final with a fixed overall course weight, with a target and a forward check.',
			example: '82% before a 20% final needs 122% to reach 90% — above an ordinary maximum.'
		},
		{
			path: '/calculators/assignment-impact',
			title: 'Assignment impact',
			question: 'How will one assignment change my grade?',
			detail:
				'Add or replace a score in total points or weighted, points-based categories. Solve a category target, too.',
			example: '80/100 plus a new 40/50 stays at 80%. Replacement removes the original first.'
		},
		{
			path: '/calculators/weighted-grade',
			title: 'Weighted grade',
			question: 'How do my category grades combine?',
			detail: 'Combine category percentages with explicit weights and optional normalization.',
			example: '80% in a 70%-weight category plus 100% in a 30%-weight category gives 86%.'
		},
		{
			path: '/calculators/gpa',
			title: 'Credit-weighted GPA',
			question: 'What GPA do these courses produce?',
			detail: 'Set your grade-point scale, course credits, eligibility and optional rigor bonuses.',
			example: 'A at 4 points for 1 credit plus B at 3 points for 0.5 credits gives 3.67.'
		}
	];
</script>

<PageMeta path="/calculators" />
<div class="hub">
	<header>
		<p class="eyebrow">No login needed · synthetic examples</p>
		<h1>Grade calculators</h1>
		<p>
			Put a number on your next move. Choose the tool that matches your grading model and check its
			assumptions against your course or school policy.
		</p>
	</header>
	<div class="tools">
		{#each tools as tool (tool.path)}<article>
				<h2><a href={tool.path}>{tool.title} calculator <span aria-hidden="true">↗</span></a></h2>
				<p class="question">{tool.question}</p>
				<p>{tool.detail}</p>
				<p class="example">{tool.example}</p>
			</article>{/each}
	</div>
	<aside>
		<h2>Estimates you can inspect</h2>
		<p>
			Each calculator shows its formula and flags invalid inputs. Entered values are calculated
			locally on the page. These tools do not connect to StudentVUE or determine official grades.
			Teacher rounding, drops and transcript rules can change the result.
		</p>
		<p>
			See <a href="/methodology/grade-calculations">worked examples and calculation methodology</a>,
			or try our <a href="/demo">synthetic grade demo</a>.
		</p>
	</aside>
</div>

<style>
	.hub {
		padding-top: clamp(2rem, 5vw, 4rem);
		width: min(100%, 64rem);
		margin: 0 auto;
	}
	header {
		max-width: 47rem;
		margin-bottom: 2.5rem;
	}
	.eyebrow {
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}
	h1 {
		font-family: var(--font-heading);
		font-size: clamp(2.4rem, 5vw, 3.8rem);
		line-height: 1.1;
		letter-spacing: -0.03em;
		margin: 0.7rem 0 1rem;
	}
	p {
		color: var(--muted-foreground);
		line-height: 1.8;
	}
	.tools {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25rem;
	}
	article {
		padding: 1.5rem;
		border: 1px solid var(--border);
		border-radius: var(--corner-lg);
		background: var(--card);
	}
	h2 {
		font-family: var(--font-heading);
		font-size: 1.3rem;
		margin: 0 0 0.75rem;
	}
	h2 a {
		text-decoration: none;
	}
	h2 a:hover {
		text-decoration: underline;
	}
	h2 span {
		color: var(--primary);
	}
	.question {
		color: var(--foreground);
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}
	.example {
		font-size: 0.85rem;
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	aside {
		margin: 2.5rem 0 0;
		max-width: 48rem;
	}
	aside a {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 4px;
		border-radius: var(--corner-xs);
	}
	@media (max-width: 680px) {
		.tools {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>

<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
	import { recordPublicEvent } from '$lib/analytics/public-client';
</script>

<PageMeta path="/studentvue-grade-calculator" />
<PublicArticle
	eyebrow="StudentVUE planning"
	title="A StudentVUE grade calculator for your next what-if."
	intro="See what a new assignment, recovered missing score or final exam could do to your grade. Start with manual calculators, then connect a compatible StudentVUE portal if you want to plan from your own course records."
	related={[
		{ href: '/demo', label: 'Try a fictional gradebook scenario' },
		{ href: '/guides/studentvue-grade-calculation', label: 'Understand the calculation first' },
		{ href: '/studentvue-compatibility', label: 'Read StudentVUE compatibility limits' }
	]}
>
	<PageSection heading="Choose the calculation that fits your course">
		<ul>
			<li>
				<a href="/calculators/assignment-impact">Assignment impact calculator</a>: add a new
				assignment or replace a score already counted. Use total points or category weights.
			</li>
			<li>
				<a href="/calculators/weighted-grade">Weighted grade calculator</a>: combine category point
				totals and weights, such as tests 70% and homework 30%.
			</li>
			<li>
				<a href="/calculators/final-grade">Final grade calculator</a>: find a required final exam
				score when the final is a separate share of the course grade.
			</li>
			<li>
				<a href="/calculators/gpa">GPA calculator</a>: use the credits and grade-point values your
				school requires.
			</li>
		</ul>
		<p>
			These tools run in your browser. You do not need a StudentVUE account to use them. Entered
			scores are not added to the page address or sent to the public analytics endpoint.
		</p>
	</PageSection>
	<PageSection heading="A new assignment is different from replacing a missing score">
		<p>
			Suppose a fictional class currently counts 80 earned points out of 100. A <strong>new</strong> 40/50
			assignment produces 120/150, or 80%. Both the earned and possible totals grow.
		</p>
		<p>
			If a 0/50 assignment is <strong>already counted</strong> in an 80/150 total, replacing that zero
			with 40/50 produces 120/150, or 80%. Here the possible total stays the same. Calling both actions
			“add 40 points” hides a difference that can change the result substantially.
		</p>
		<p>
			Use the <a href="/guides/missing-excused-ungraded">assignment status guide</a> to decide whether
			a blank, missing or excused row currently contributes to the total. A label by itself is insufficient.
		</p>
	</PageSection>
	<PageSection heading="Planning from connected StudentVUE records">
		<p>
			In the connected app, Grademaxxing reads official marks, assignment details and available
			category rules from the district's StudentVUE portal. What-if edits are local simulations.
			They do not change the official gradebook.
		</p>
		<p>
			Compare the local baseline with the official mark before relying on a target. Some portal
			rules or assignment scales cannot be reproduced from the available data. Grademaxxing labels
			incomplete projections as estimates and keeps the official mark visible.
		</p>
		<p>
			<a
				href="/login"
				onclick={() => recordPublicEvent('connection_start', '/studentvue-grade-calculator')}
				>Connect StudentVUE</a
			>
			after reviewing <a href="/studentvue-compatibility">compatibility</a> and
			<a href="/privacy">how sign-in and local storage work</a>. Grademaxxing is an independent,
			read-only companion, not an Edupoint or district service.
		</p>
	</PageSection>
	<PageSection heading="Do I use final weight or category weight?">
		<p>
			A final worth 20% of the <em>whole course</em> uses a standalone final model: 80% of the pre-final
			grade plus 20% of the final score. A final placed inside a “Tests” category instead changes that
			category's points before its weight is applied. The same score can have a different effect in the
			two models.
		</p>
		<p>
			Confirm the teacher's rule before choosing the calculator. The <a
				href="/methodology/grade-calculations">calculation methodology</a
			> works through both models and explains what a target over 100% means.
		</p>
	</PageSection>
</PublicArticle>

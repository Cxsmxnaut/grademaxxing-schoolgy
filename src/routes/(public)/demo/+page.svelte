<script lang="ts">
	import AssignmentImpactCalculator from '$lib/components/calculators/AssignmentImpactCalculator.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/demo" />
<PublicArticle
	eyebrow="Fictional demo · no sign-in"
	title="Try a what-if without using school records."
	intro="This fictional course starts at 80 earned points out of 100. Change a future score or switch calculation models below to see how the estimate responds. Nothing connects to StudentVUE or changes a gradebook."
	related={[
		{ href: '/studentvue-grade-calculator', label: 'Plan from your own StudentVUE records' },
		{ href: '/guides/missing-excused-ungraded', label: 'Learn when to add or replace a score' },
		{ href: '/methodology/calculator-validation', label: 'Reproduce the reference cases' }
	]}
>
	<PageSection heading="The starting record is entirely synthetic">
		<div class="table-scroll">
			<table>
				<caption>Fictional Algebra · points-only starting scenario</caption>
				<thead
					><tr
						><th scope="col">Assignment</th><th scope="col">Earned</th><th scope="col">Possible</th
						><th scope="col">Included?</th></tr
					></thead
				>
				<tbody>
					<tr><th scope="row">Practice set</th><td>16</td><td>20</td><td>Yes</td></tr>
					<tr><th scope="row">Quiz</th><td>24</td><td>30</td><td>Yes</td></tr>
					<tr><th scope="row">Unit test</th><td>40</td><td>50</td><td>Yes</td></tr>
					<tr><th scope="row">Starting total</th><td>80</td><td>100</td><td>80%</td></tr>
				</tbody>
			</table>
		</div>
		<p>
			This table is the fixed starting example, not a live record. The calculator's current totals
			are editable. Its initial new assignment is 40/50, giving 120/150 = 80%. Increase new earned
			points to 50 to see 130/150 ≈ 86.67%.
		</p>
	</PageSection>
	<PageSection heading="Change the scenario">
		<AssignmentImpactCalculator idPrefix="demo-impact" initialModel="total" initialAction="new" />
	</PageSection>
	<PageSection heading="Three things to try">
		<ol>
			<li>
				<strong>Recover a counted zero.</strong> Select “Replace a scored assignment.” Set current totals
				to 80/150, original score to 0/50, and replacement to 40/50. The possible total stays at 150,
				and the estimate rises from about 53.33% to 80%.
			</li>
			<li>
				<strong>Switch to weighted categories.</strong> The synthetic defaults become Tests 170/200 and
				Homework 95/100, each at 50% weight. A new 40/50 test yields Tests 210/250 = 84% and a course
				estimate of 89.5%.
			</li>
			<li>
				<strong>Try the category target.</strong> In weighted mode, the separate target section asks for
				a new 100-point test to reach 92% from the current category totals. The required score is 97/100.
				It does not include the impact preview as a second assignment.
			</li>
		</ol>
	</PageSection>
	<PageSection heading="What the connected app adds">
		<p>
			The connected app reads available StudentVUE course and assignment data instead of requiring
			you to type totals. It keeps the official course mark visible alongside local estimates and
			restricts unsupported edits when the necessary assignment scale is unavailable.
		</p>
		<p>
			This public demo demonstrates calculation behavior. It does not test a district connection,
			authenticate a student, reproduce a school's policy or produce an official GPA. You can use
			every public calculator without entering credentials; connecting StudentVUE is optional.
		</p>
	</PageSection>
</PublicArticle>

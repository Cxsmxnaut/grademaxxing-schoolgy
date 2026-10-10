<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/methodology/grade-calculations" />
<PublicArticle
	eyebrow="Calculation methodology"
	title="The formulas behind a grade estimate."
	intro="Public calculators use explicit numbers and assumptions. Connected StudentVUE planning uses available portal evidence. Neither calculation changes an official school record or establishes an unpublished grading policy."
	related={[
		{ href: '/methodology/calculator-validation', label: 'Check six synthetic reference cases' },
		{ href: '/calculators', label: 'Use the calculators' },
		{ href: '/guides/grade-mismatches', label: 'Understand baseline disagreements' }
	]}
>
	<PageSection heading="Total points: add the points before dividing">
		<p>
			Let E be counted earned points and P be counted possible points. When P is positive, the
			percentage is 100 × E/P. This model does not average assignment percentages.
		</p>
		<p class="formula">
			New assignment: G = 100 × (E + e) / (P + p)<br />Replacement: G = 100 × (E − old e + new e) /
			(P − old p + new p)
		</p>
		<p>
			The current totals must already contain the original score when replacing it. If the possible
			value remains unchanged, the denominator remains unchanged. For 80/100 plus a new 40/50 score,
			the result is 120/150 = 80%.
		</p>
		<p>
			Ordinary assignments need positive possible points. The assignment calculator also supports
			explicitly selected <strong>numerator-only extra credit</strong>, which adds earned points and
			zero possible points. A zero total denominator has no defined grade; extra credit alone cannot
			create a percentage.
		</p>
	</PageSection>
	<PageSection heading="Weighted categories: calculate each category first">
		<p>
			For category i, its points percentage gᵢ is 100 × Eᵢ/Pᵢ. With weights wᵢ, the course
			percentage is a weighted average. A points change affects its selected category first, then
			the combined course.
		</p>
		<p class="formula">G = Σ(gᵢ × wᵢ) / Σ(wᵢ)</p>
		<p>
			The assignment-impact model includes categories with positive possible points and positive
			weight, and normalizes across those active weights. A new ordinary assignment can activate a
			previously empty category. An explicitly zero-weight category contributes nothing. An unknown
			weight is an invalid input, not a zero.
		</p>
		<p>
			The separate weighted-grade calculator accepts category percentages directly. You can require
			included weights to total 100% or explicitly choose normalization. Excluding an ungraded
			category is a choice about the model; it is not a claim about your school's policy.
		</p>
		<p>
			This points-within-category model does not implement equal weighting of assignments regardless
			of their possible points, dynamic drop-lowest rules, or an automatic change to which
			assignment gets dropped.
		</p>
	</PageSection>
	<PageSection heading="An assignment target inside a category">
		<p>
			Keep other categories fixed. Let W be the sum of weights active after the new assignment, w be
			its category weight, and B be the sum of other category percentages multiplied by their
			weights. For desired course percentage T, the required category percentage is (T × W − B)/w.
			Let E and P be that category's current earned and possible points, and p be the new
			assignment's possible points.
		</p>
		<p class="formula">
			Required category percentage q = (T × W − B) / w<br />Required earned points x = (q / 100) ×
			(P + p) − E
		</p>
		<p>
			For Tests 170/200 at 50% weight and Homework 95/100 at 50%, reaching 92% with one new
			100-point test requires 97/100. The updated Tests percentage is 267/300 = 89%; averaging it
			with 95% gives 92%.
		</p>
		<p>
			The target tool rounds upward to the chosen point step and checks that score through the
			forward formula. Required points above the ordinary maximum mean the target is unreachable
			within that maximum. A negative algebraic target means zero already secures the target under
			the stated model.
		</p>
	</PageSection>
	<PageSection heading="A standalone final has a different equation">
		<p>
			Let C be the current percentage for the whole non-final share, f be the final's overall course
			weight as a fraction, and X be its score percentage. Then G = C × (1 − f) + X × f.
		</p>
		<p class="formula">Required final score X = (target − C × (1 − f)) / f</p>
		<p>
			With a current 82%, a target 90%, and a final worth 20% of the whole course, X = (90 − 82 ×
			0.8)/0.2 = <strong>122%</strong>. A 100% final gives 85.6%; the target is not reachable
			without another change or permitted extra credit.
		</p>
		<p>
			A final entered as an assignment inside Tests instead changes that category's point
			denominator. Do not use the standalone equation merely because the assignment is called
			“Final.” The teacher's course-weight rule determines the model.
		</p>
	</PageSection>
	<PageSection heading="GPA: grade points weighted by credits">
		<p class="formula">GPA = Σ(grade points × course credits) / Σ(course credits)</p>
		<p>
			The public GPA calculator accepts an editable letter-to-points scale, course credits,
			exclusions, rigor bonuses and a minimum base-point threshold for bonuses. A 4-point A worth 1
			credit and a 3-point B worth 0.5 credits give (4 + 1.5)/1.5 = approximately 3.67.
		</p>
		<p>
			The connected app's current “PUSD provisional” policy is an assumption, not confirmed district
			transcript policy. It uses whole-letter 4/3/2/1/0 values with the same value for plus/minus
			variants, provisional AP/IB and honors bonuses, grade-level and course-exclusion rules, and
			default credits where needed. Confirm eligibility, credits, plus/minus treatment and all
			weighting rules with the school before interpreting it as a school GPA.
		</p>
	</PageSection>
	<PageSection heading="What the public tools support">
		<div class="table-scroll">
			<table>
				<thead
					><tr
						><th scope="col">Model or rule</th><th scope="col">Public support</th><th scope="col"
							>Boundary</th
						></tr
					></thead
				>
				<tbody>
					<tr
						><th scope="row">Total points and score replacement</th><td>Assignment impact</td><td
							>Explicit numeric totals; original score already included.</td
						></tr
					>
					<tr
						><th scope="row">Points within weighted categories</th><td
							>Assignment impact and category targets</td
						><td>Known weights; active-category normalization; other totals fixed.</td></tr
					>
					<tr
						><th scope="row">Weighted category percentages</th><td>Weighted grade</td><td
							>Require 100% or select normalization explicitly.</td
						></tr
					>
					<tr
						><th scope="row">Final as separate course share</th><td>Final grade</td><td
							>Current grade represents the whole remaining share.</td
						></tr
					>
					<tr
						><th scope="row">Credit-weighted grade points</th><td>GPA</td><td
							>Entered policy; official transcript calculation not inferred.</td
						></tr
					>
					<tr
						><th scope="row">Status codes, drops, overrides, retake rules</th><td
							>Not automatically modeled</td
						><td>Supply confirmed counted totals; consult course policy.</td></tr
					>
				</tbody>
			</table>
		</div>
		<p>
			Public inputs must be finite and nonnegative; ordinary possible points, credits and score
			steps must be positive where required. Invalid or missing inputs produce an explanation
			instead of an invented score. Calculations retain precision internally and round for display.
		</p>
	</PageSection>
</PublicArticle>

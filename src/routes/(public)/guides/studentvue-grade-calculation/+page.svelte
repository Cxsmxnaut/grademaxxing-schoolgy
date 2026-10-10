<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/guides/studentvue-grade-calculation" />
<PublicArticle
	eyebrow="Grade calculation guide"
	title="How to calculate a StudentVUE grade."
	intro="Start with the course's grading rule, then its counted assignments. A total-points course and a category-weighted course can show different grades from the same scores."
	related={[
		{ href: '/calculators/weighted-grade', label: 'Try the weighted grade calculator' },
		{ href: '/guides/grade-mismatches', label: 'Diagnose a grade mismatch' },
		{ href: '/methodology/grade-calculations', label: 'See formulas and support limits' }
	]}
>
	<PageSection heading="1. Check the reporting period and official mark">
		<p>
			Use the same course, quarter or semester when comparing records. The StudentVUE course mark is
			the school's published result. A calculation from assignment rows is a reconstruction; it may
			lack hidden assignments, dropped scores, special scales or teacher-managed rules.
		</p>
		<p>
			Before running a what-if, calculate the current baseline. If it differs from the official
			mark, resolve the difference or treat the prediction as an estimate. A plausible future number
			does not fix an incomplete starting point.
		</p>
	</PageSection>
	<PageSection heading="2. Decide whether the course uses total points or categories">
		<h3>Total points</h3>
		<p>
			Add counted earned points, add their possible points, then divide. A 9/10 quiz and a 50/100
			test produce 59/110, approximately <strong>53.64%</strong>. Averaging their percentages, 90%
			and 50%, would give 70%; that is a different rule.
		</p>
		<p class="formula">Course percentage = 100 × total earned / total possible</p>
		<h3>Weighted categories</h3>
		<p>
			First calculate each category's percentage from its own counted points. Then apply its weight.
			Tests at 80% with 70% of the course weight and homework at 100% with 30% give <strong
				>86%</strong
			>.
		</p>
		<p class="formula">Course percentage = (80 × 70 + 100 × 30) / (70 + 30) = 86</p>
		<p>
			The points-within-category model in the assignment-impact calculator normalizes over
			categories with a positive point denominator and positive weight. An empty category is omitted
			until it has counted possible points. The weighted-grade tool instead accepts category
			percentages and lets you require weights totaling 100% or explicitly normalize. Your teacher's
			handling of empty categories may differ; confirm the rule instead of assuming an empty
			category is a zero.
		</p>
	</PageSection>
	<PageSection heading="3. Check which assignments count">
		<p>
			A missing flag, an earned zero and a blank score describe different evidence. A counted 0/50
			lowers a grade because 50 is included in the denominator. A genuinely excluded assignment
			affects neither earned nor possible points. An ungraded row may be excluded until it receives
			a score, but a school can apply a different policy.
		</p>
		<p>
			Look for exclusion and drop indicators, available category totals, and the actual scored
			values. The <a href="/guides/missing-excused-ungraded">missing, excused and ungraded guide</a> explains
			why labels alone cannot establish the formula.
		</p>
	</PageSection>
	<PageSection heading="4. Model one change at a time">
		<p>
			A new assignment adds its earned and possible points. Replacing a score already counted
			removes its old earned value before adding the new value; do not count its possible points
			twice. In a weighted course, update the affected category before recombining all categories.
		</p>
		<p>
			For example, a 100-point test changes a small Tests category more than a large one. Its course
			impact also depends on the category's weight. “A test is worth 100 points” does not say what
			fraction of the whole course it controls.
		</p>
		<p>
			Use <a href="/calculators/assignment-impact">assignment impact</a> for an assignment within a
			category. Use the <a href="/calculators/final-grade">final grade calculator</a> only when the final
			is a separate course share and the current grade represents the entire remaining share.
		</p>
	</PageSection>
	<PageSection heading="5. Read the result as a conditional estimate">
		<p>
			A target can require more than 100% when it cannot be reached within the ordinary assignment
			maximum. A result below zero means the target is already met even with a zero under those
			assumptions. Extra credit, retakes, score caps, rounding thresholds and future assignments can
			change the conclusion.
		</p>
		<p>
			Grademaxxing keeps connected official marks distinct from its scenarios. Consult the teacher
			or official course policy when the rule is unclear; a calculator cannot infer an unpublished
			grading rule.
		</p>
	</PageSection>
</PublicArticle>

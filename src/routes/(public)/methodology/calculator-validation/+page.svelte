<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/methodology/calculator-validation" />
<PublicArticle
	eyebrow="Synthetic reference cases"
	title="Check the calculation, not just the answer."
	intro="These six fictional cases are worked out directly from the published formulas. They describe arithmetic support, not verified district behavior, official grades or results from a real student account."
	related={[
		{ href: '/methodology/grade-calculations', label: 'Read formulas and supported models' },
		{ href: '/demo', label: 'Change a synthetic scenario interactively' },
		{ href: '/calculators', label: 'Reproduce the cases in a calculator' }
	]}
>
	<PageSection heading="1. Unequal assignment maxima">
		<p>
			<strong>Input:</strong> a points-only course has 9/10 and 50/100, both included.
			<strong>Expected:</strong> 59/110 × 100 = 53.63636…%, displayed as 53.64%. A simple mean of 90%
			and 50% would be 70%, so this case distinguishes points from equal assignment averaging.
		</p>
		<p>
			<strong>Scope:</strong> total-points model. Reproduce it by entering current totals 9/10 and
			adding a new 50/100 score in <a href="/calculators/assignment-impact">assignment impact</a>.
		</p>
	</PageSection>
	<PageSection heading="2. Weighted category percentages">
		<p>
			<strong>Input:</strong> Tests at 80% with 70% weight; Homework at 100% with 30% weight.
			<strong>Expected:</strong> (80 × 70 + 100 × 30)/100 = 86%.
		</p>
		<p>
			<strong>Scope:</strong> weighted percentages with weights totaling 100%. The
			<a href="/calculators/weighted-grade">weighted grade calculator</a> can require that total or normalize
			included weights explicitly. This example does not establish a school's empty-category policy.
		</p>
	</PageSection>
	<PageSection heading="3. Recovering a counted zero">
		<p>
			<strong>Input:</strong> current totals 80/150 already contain a 0/50 assignment. Replace that
			score with 40/50. <strong>Expected:</strong> (80 − 0 + 40)/(150 − 50 + 50) × 100 = 80%. Before replacement,
			80/150 is about 53.33%, so the change is about +26.67 percentage points.
		</p>
		<p>
			<strong>Scope:</strong> replacement of an included score. Adding another 50 possible points would
			be the wrong action. An excluded or ungraded row requires different current totals and may require
			a new-score model.
		</p>
	</PageSection>
	<PageSection heading="4. A new test inside a category">
		<p>
			<strong>Input:</strong> Tests 170/200 at 50% and Homework 95/100 at 50%; target 92%; one new
			100-point test; whole-point score step. <strong>Expected:</strong> 97 earned points. Forward check:
			Tests become 267/300 = 89%, then (89 × 50 + 95 × 50)/100 = 92%.
		</p>
		<p>
			<strong>Scope:</strong> points within categories, known weights, no other changes. The
			<a href="/calculators/assignment-impact">category target tool</a> computes a new ordinary assignment
			separately from its impact preview.
		</p>
	</PageSection>
	<PageSection heading="5. An unreachable standalone final target">
		<p>
			<strong>Input:</strong> current non-final grade 82%, target 90%, final worth 20% of the entire
			course, ordinary final maximum 100%. <strong>Expected:</strong> (90 − 82 × 0.8)/0.2 = 122% required.
			At a 100% final, the course reaches only 85.6%.
		</p>
		<p>
			<strong>Scope:</strong> standalone final share. The
			<a href="/calculators/final-grade">final calculator</a> identifies a target above the entered maximum.
			The equation does not apply to a final merely entered as another test inside a points category.
		</p>
	</PageSection>
	<PageSection heading="6. GPA with unequal credits">
		<p>
			<strong>Input:</strong> A = 4 points for a 1-credit course; B = 3 points for a 0.5-credit
			course; no rigor bonuses. <strong>Expected:</strong> (4 × 1 + 3 × 0.5)/(1 + 0.5) = 3.66666…, displayed
			as 3.67. A simple mean of 4 and 3 would be 3.5.
		</p>
		<p>
			<strong>Scope:</strong> entered grade points and positive credits in the
			<a href="/calculators/gpa">GPA calculator</a>. This establishes no transcript, admissions or
			district-specific GPA policy.
		</p>
	</PageSection>
	<PageSection heading="What these cases do not verify">
		<p>
			Agreement with reference arithmetic does not prove that a school uses the same rules. These
			examples do not verify live StudentVUE connections, missing-score policies, teacher overrides,
			drop-lowest behavior, unknown weighted assignment scales or the connected app's provisional
			GPA policy.
		</p>
		<p>
			For connected planning, compare the baseline with the official mark and read any estimate or
			incomplete-data warning. For manual planning, choose the formula that matches the confirmed
			course policy and keep inputs explicit.
		</p>
	</PageSection>
</PublicArticle>

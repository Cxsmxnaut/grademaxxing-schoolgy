<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/guides/grade-mismatches" />
<PublicArticle
	eyebrow="Troubleshooting a calculation"
	title="Why your calculated grade may differ from StudentVUE."
	intro="Use StudentVUE's official mark as the reference. A mismatch usually means the local calculation is using different inputs, inclusion rules, scales or rounding—not that the official grade should be replaced."
	related={[
		{ href: '/guides/studentvue-grade-calculation', label: 'Rebuild a baseline step by step' },
		{ href: '/guides/missing-excused-ungraded', label: 'Check assignment inclusion' },
		{ href: '/calculators/weighted-grade', label: 'Compare a manual weighted calculation' }
	]}
>
	<PageSection heading="Start with the scope, then the arithmetic">
		<ol>
			<li>
				<strong>Match the course and reporting period.</strong> Quarter, semester and year grades can
				use different assignments or combinations of marks.
			</li>
			<li>
				<strong>Check for stale records.</strong> Compare the latest official portal data after a teacher
				update. Refresh the connected app before investigating old cached rows.
			</li>
			<li>
				<strong>Confirm total points versus category weights.</strong> Averaging assignment percentages
				rarely reproduces a points-based course.
			</li>
			<li>
				<strong>Use counted rows.</strong> Missing, excused, excluded and dropped work may contribute
				differently. A visible assignment list may also be incomplete.
			</li>
			<li>
				<strong>Check scales and precision.</strong> Raw points, weighted points and a displayed percentage
				need not be interchangeable.
			</li>
			<li>
				<strong>Look for teacher-managed rules.</strong> Overrides, score caps, retakes, extra credit
				and final-exam combinations can require information absent from the rows.
			</li>
		</ol>
	</PageSection>
	<PageSection heading="Small differences: rounding and precision">
		<p>
			A displayed 89.9% may be rounded or truncated from a more precise number. Multiplying that
			displayed percentage by the possible points can invent an earned value slightly different from
			the posted score. Keep full precision through the calculation and round only the displayed
			result.
		</p>
		<p>
			For example, 17/19 is approximately 89.4737%. Turning a displayed 89% back into points
			produces 16.91/19. Across many rows, small reconstruction errors can accumulate. A
			letter-grade threshold may also depend on the school's rounding rule.
		</p>
		<p>
			Grademaxxing preserves available point evidence and reported precision. It does not treat a
			rounded percentage as permission to overwrite more precise posted points.
		</p>
	</PageSection>
	<PageSection heading="Large differences: denominators and category rules">
		<p>
			Suppose you count 80/100 but the course includes an additional 0/50. Your reconstruction gives
			80%; the counted total is 80/150, about 53.33%. If that 50-point row is actually excluded,
			including it would create the opposite mistake.
		</p>
		<p>
			In a weighted course, a 90% Homework category and a 70% Tests category are not necessarily
			equal contributors. At 20% Homework and 80% Tests, the course is 74%, not the simple average
			of 80%.
		</p>
		<p>
			Empty categories need attention too. Renormalizing active weights and assigning zero to an
			empty category are different policies. Adding its first graded assignment may activate a
			previously unused category weight.
		</p>
	</PageSection>
	<PageSection heading="Why some connected assignments cannot be simulated exactly">
		<p>
			A portal can publish an official category total without enough information to model every row
			independently. An assignment's raw maximum may differ from its weighted maximum. If the
			weighted scale is unavailable, substituting raw points can produce a confident but false
			projection.
		</p>
		<p>
			Grademaxxing keeps known official values visible, restricts edits where scales cannot be
			modeled, and may retain a known category contribution for unsupported rows. Incomplete inputs
			or baseline disagreement make projections estimates. Explicit zero-weight practice categories
			do not contribute; unknown weights are not assumed to be zero.
		</p>
	</PageSection>
	<PageSection heading="What to do with an unresolved mismatch">
		<p>
			Keep the official mark as your current grade. Use a scenario only with its stated uncertainty,
			or enter confirmed totals in a public calculator. Ask the teacher about the grading rule when
			the official course policy is unclear.
		</p>
		<p>
			If reporting a software issue, describe the type of difference and use fictional values to
			reproduce it. Do not post passwords, full student records or identifying gradebook screenshots
			in a public issue. A useful report can explain “a counted zero was treated as ungraded”
			without exposing the student's account.
		</p>
	</PageSection>
</PublicArticle>

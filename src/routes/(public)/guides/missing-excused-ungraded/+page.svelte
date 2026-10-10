<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PublicArticle from '$lib/components/public/PublicArticle.svelte';
	import PageSection from '$lib/components/public/PageSection.svelte';
</script>

<PageMeta path="/guides/missing-excused-ungraded" />
<PublicArticle
	eyebrow="Assignment status guide"
	title="Missing, excused and ungraded are different inputs."
	intro="A status label tells you something about an assignment, but it does not by itself tell you whether the assignment counts in your grade. Check the score, possible points and inclusion rule together."
	related={[
		{ href: '/calculators/assignment-impact', label: 'Model a new or replacement score' },
		{ href: '/guides/grade-mismatches', label: 'Check other causes of a mismatch' },
		{ href: '/methodology/grade-calculations', label: 'Read the supported calculation models' }
	]}
>
	<PageSection heading="Read status and scoring evidence separately">
		<div class="table-scroll">
			<table>
				<caption>These are interpretation checks, not universal district rules.</caption>
				<thead
					><tr
						><th scope="col">What you see</th><th scope="col">What it establishes</th><th
							scope="col">What still needs checking</th
						></tr
					></thead
				>
				<tbody>
					<tr
						><th scope="row">Missing label</th><td>The work is flagged as missing.</td><td
							>Whether it already counts as 0/possible, remains ungraded or uses a special rule.</td
						></tr
					>
					<tr
						><th scope="row">Posted zero</th><td>A numeric score of zero is present.</td><td
							>Whether the row is included, excluded, dropped or in a zero-weight category.</td
						></tr
					>
					<tr
						><th scope="row">Excused or excluded</th><td>A special status is present.</td><td
							>Whether the gradebook removes both earned and possible points; code meanings depend
							on school policy.</td
						></tr
					>
					<tr
						><th scope="row">Blank or ungraded score</th><td>No usable earned score is shown.</td
						><td>Whether it is omitted until graded or treated as zero under a known rule.</td></tr
					>
					<tr
						><th scope="row">Dropped score</th><td>A drop rule may remove its contribution.</td><td
							>Whether a what-if changes which score is dropped.</td
						></tr
					>
				</tbody>
			</table>
		</div>
		<p>
			Codes such as EXC, NYG or AB can be defined differently by a district or teacher. Do not
			translate an unfamiliar code into a zero just because it appears in the score column.
		</p>
	</PageSection>
	<PageSection heading="The same 50-point assignment can have three different effects">
		<p>
			Start with a fictional class containing 80 earned points out of 100 counted possible points.
		</p>
		<ul>
			<li>
				<strong>Excluded:</strong> an excluded 50-point assignment changes neither total. The grade remains
				80/100 = 80%.
			</li>
			<li><strong>Counted zero:</strong> including it as 0/50 gives 80/150 ≈ 53.33%.</li>
			<li>
				<strong>New 40/50 score:</strong> if it was not counted before, adding it gives 120/150 = 80%.
			</li>
		</ul>
		<p>
			If the zero is already in 80/150, recovering 40 points is a <strong>replacement</strong>:
			120/150 = 80%. Adding another 50 possible points would count the same assignment twice.
		</p>
	</PageSection>
	<PageSection heading="Category weights can change the impact again">
		<p>
			In a weighted course, the row changes its own category total. A recovered 40/50 test affects
			the Tests percentage first; the Tests weight then determines its contribution to the whole
			course.
		</p>
		<p>
			An assignment in an explicitly zero-weight practice category does not affect the course
			percentage. A category with no counted positive denominator has no defined points percentage.
			Giving its first assignment a score can activate its weight under a model that previously
			normalized only active categories.
		</p>
	</PageSection>
	<PageSection heading="How to plan without guessing the policy">
		<ol>
			<li>Check the official course or category totals before changing anything.</li>
			<li>Identify whether the assignment's possible points are already included.</li>
			<li>
				Choose “new assignment” or “replace counted score” in the <a
					href="/calculators/assignment-impact">assignment calculator</a
				> accordingly.
			</li>
			<li>
				Confirm exclusion, late-work, retake and drop rules with the teacher if they are unclear.
			</li>
		</ol>
		<p>
			The public calculator models explicit numeric inclusion. It does not automatically interpret
			school-specific status codes or apply a dynamic drop-lowest rule. The connected app uses
			available portal evidence, but its projections remain estimates when that evidence is
			incomplete.
		</p>
	</PageSection>
</PublicArticle>

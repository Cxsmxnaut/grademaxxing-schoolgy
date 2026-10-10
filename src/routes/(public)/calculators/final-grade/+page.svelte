<script lang="ts">
	import CalculatorPage from '$lib/components/calculators/CalculatorPage.svelte';
	import FinalGradeCalculator from '$lib/components/calculators/FinalGradeCalculator.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta path="/calculators/final-grade" />
<CalculatorPage
	title="Final grade calculator"
	introduction="What do you need on your final? Enter your current grade, target and the final's fixed overall course weight. See the required score, unreachable targets and a forward check before making a plan."
>
	<FinalGradeCalculator />
</CalculatorPage>

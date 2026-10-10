<script lang="ts">
	import CalculatorPage from '$lib/components/calculators/CalculatorPage.svelte';
	import WeightedGradeCalculator from '$lib/components/calculators/WeightedGradeCalculator.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta path="/calculators/weighted-grade" />
<CalculatorPage
	title="Weighted grade calculator"
	introduction="Combine category percentages using your course's weights. Require weights to total 100%, or explicitly normalize the included weights. Keep scored zeros distinct from ungraded categories."
>
	<WeightedGradeCalculator />
</CalculatorPage>

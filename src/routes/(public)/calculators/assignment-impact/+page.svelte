<script lang="ts">
	import AssignmentImpactCalculator from '$lib/components/calculators/AssignmentImpactCalculator.svelte';
	import CalculatorPage from '$lib/components/calculators/CalculatorPage.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta path="/calculators/assignment-impact" />
<CalculatorPage
	title="Assignment impact calculator"
	introduction="Estimate how adding or replacing one score changes your grade. Choose total points or weighted categories that use points internally. The category model also solves the score needed on a new assignment to reach a target."
>
	<AssignmentImpactCalculator />
</CalculatorPage>

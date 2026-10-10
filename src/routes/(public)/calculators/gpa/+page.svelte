<script lang="ts">
	import CalculatorPage from '$lib/components/calculators/CalculatorPage.svelte';
	import GpaCalculator from '$lib/components/calculators/GpaCalculator.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta path="/calculators/gpa" />
<CalculatorPage
	title="Credit-weighted GPA calculator"
	introduction="Estimate GPA for the courses you enter using an editable grade-point scale, course credits and optional rigor bonuses. Choose which courses count and configure your school's rules; this example is not an official transcript policy."
>
	<GpaCalculator />
</CalculatorPage>
